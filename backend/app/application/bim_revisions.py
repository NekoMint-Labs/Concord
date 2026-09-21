"""Human-confirmed BIM bindings and revision comparison publication."""

import json
from collections import defaultdict

from app.domain.actions import AuditRecord, Principal
from app.domain.bim_revisions import (
    AffectedWorkPackage,
    BimElementChange,
    ComparisonSummary,
    RevisionComparison,
    RevisionComparisonDetail,
)
from app.domain.errors import Conflict, DomainError
from app.domain.models import Evidence, ProjectSnapshot, SourceRevision, utcnow
from app.policies.actions import require
from app.ports.bim_revisions import IfcComparisonEngine
from app.ports.coordination import RepositoryFactory
from app.ports.services import FileStore

LOW_CONTINUITY = 0.5


class BimRevisionService:
    def __init__(
        self, factory: RepositoryFactory, storage: FileStore, comparison: IfcComparisonEngine
    ):
        self.factory, self.storage, self.comparison = factory, storage, comparison

    def compare(
        self,
        project_id: str,
        source_id: str,
        from_revision_id: str,
        to_revision_id: str,
        principal: Principal,
    ) -> RevisionComparisonDetail:
        require(principal, "ingest")
        if from_revision_id == to_revision_id:
            raise DomainError("Comparison revisions must be different")
        with self.factory.open() as repo:
            source = repo.project_source(project_id, source_id)
            old_revision = repo.source_revision(project_id, source_id, from_revision_id)
            new_revision = repo.source_revision(project_id, source_id, to_revision_id)
            old_snapshot = repo.bim_revision_snapshot(project_id, source_id, from_revision_id)
            new_snapshot = repo.bim_revision_snapshot(project_id, source_id, to_revision_id)
        if source.kind != "BIM" or old_snapshot is None or new_snapshot is None:
            raise Conflict("Both selected BIM revisions must be imported before comparison")
        old_content = self._verified_content(old_revision.storage_key, old_revision.sha256)
        new_content = self._verified_content(new_revision.storage_key, new_revision.sha256)
        normalized = self.comparison.compare(old_content, new_content)
        old_ids = {item.global_id for item in old_snapshot.elements}
        new_ids = {item.global_id for item in new_snapshot.elements}
        common = old_ids & new_ids
        continuity = len(common) / max(len(old_ids), len(new_ids), 1)
        warnings = ()
        if continuity < LOW_CONTINUITY:
            warnings = (
                "Low GlobalId continuity; exporter behavior may appear as mass "
                "additions/deletions.",
            )
        comparison = RevisionComparison(
            project_id=project_id,
            source_id=source_id,
            from_revision_id=from_revision_id,
            to_revision_id=to_revision_id,
            engine=normalized.engine,
            engine_version=normalized.engine_version,
            summary=ComparisonSummary(
                added=len(normalized.added),
                deleted=len(normalized.deleted),
                changed=len(normalized.changed),
                from_elements=len(old_ids),
                to_elements=len(new_ids),
                common_global_ids=len(common),
                global_id_continuity=continuity,
                warnings=warnings,
                compare_seconds=normalized.compare_seconds,
            ),
            raw_result_key="pending",
        )
        raw_key = f"bim-comparisons/{comparison.id}/ifcdiff.json"
        self.storage.put(raw_key, json.dumps(normalized.raw, sort_keys=True).encode())
        comparison = comparison.model_copy(update={"raw_result_key": raw_key})
        changes = self._changes(comparison.id, normalized)
        try:
            return self._publish(project_id, source_id, comparison, changes, principal)
        except Exception:
            self.storage.delete(raw_key)
            raise

    def _publish(
        self,
        project_id: str,
        source_id: str,
        comparison: RevisionComparison,
        changes: tuple[BimElementChange, ...],
        principal: Principal,
    ) -> RevisionComparisonDetail:
        changed_ids = {change.global_id for change in changes}
        with self.factory.open(project_id, write=True) as repo:
            state = repo.state(project_id)
            old_revision = repo.source_revision(project_id, source_id, comparison.from_revision_id)
            new_revision = repo.source_revision(project_id, source_id, comparison.to_revision_id)
            if repo.revision_comparison_for_revisions(
                project_id,
                source_id,
                comparison.from_revision_id,
                comparison.to_revision_id,
            ):
                raise Conflict("These source revisions have already been compared")
            bindings = repo.bim_bindings(project_id, source_id, changed_ids)
            by_package: dict[str, list[BimElementChange]] = defaultdict(list)
            change_by_id = {change.global_id: change for change in changes}
            for binding in bindings:
                by_package[binding.work_package_id].append(change_by_id[binding.global_id])
            next_state = state.model_copy(update={"version": state.version + 1})
            snapshot = ProjectSnapshot(
                project_id=project_id,
                version=next_state.version,
                sources=(
                    *next_state.sources,
                    SourceRevision(source=f"bim/{source_id}/from", revision=old_revision.sha256),
                    SourceRevision(source=f"bim/{source_id}/to", revision=new_revision.sha256),
                ),
            )
            repo.save_state(next_state)
            repo.save_snapshot(snapshot)
            evidence = [
                Evidence(
                    snapshot_id=snapshot.id,
                    provider=f"{comparison.engine}/{comparison.engine_version}",
                    source_id=source_id,
                    source_revision=new_revision.sha256,
                    observed_at=utcnow(),
                    work_package_id=work_package_id,
                    element_ids=tuple(sorted(change.global_id for change in package_changes)),
                    fact=(
                        f"IFC comparison affected {len(package_changes)} bound element(s) "
                        f"for Work Package {work_package_id}."
                    ),
                )
                for work_package_id, package_changes in sorted(by_package.items())
            ]
            evidence.append(
                Evidence(
                    snapshot_id=snapshot.id,
                    provider=f"{comparison.engine}/{comparison.engine_version}",
                    source_id=source_id,
                    source_revision=new_revision.sha256,
                    observed_at=utcnow(),
                    element_ids=tuple(sorted(changed_ids)),
                    fact=(
                        f"Compared IFC revisions: {comparison.summary.added} added, "
                        f"{comparison.summary.deleted} deleted, "
                        f"{comparison.summary.changed} changed; GlobalId continuity "
                        f"{comparison.summary.global_id_continuity:.1%}."
                    ),
                )
            )
            comparison = comparison.model_copy(
                update={"evidence_ids": tuple(item.id for item in evidence)}
            )
            repo.add_revision_comparison(comparison, changes)
            for item in evidence:
                repo.save_evidence(item)
            repo.audit(
                AuditRecord(
                    project_id=project_id,
                    action="BIM_REVISIONS_COMPARED",
                    actor=principal.id,
                    snapshot_id=snapshot.id,
                    detail={"source_id": source_id, "comparison_id": comparison.id},
                )
            )
        return RevisionComparisonDetail(
            comparison=comparison,
            changes=changes,
            affected_work_packages=tuple(
                AffectedWorkPackage(
                    work_package_id=package_id,
                    changes=tuple(sorted(items, key=lambda item: item.global_id)),
                )
                for package_id, items in sorted(by_package.items())
            ),
        )

    def detail(
        self, project_id: str, source_id: str, comparison_id: str
    ) -> RevisionComparisonDetail:
        with self.factory.open() as repo:
            comparison = repo.revision_comparison(project_id, source_id, comparison_id)
            changes = tuple(repo.bim_element_changes(comparison_id))
            bindings = repo.bim_bindings(
                project_id, source_id, {change.global_id for change in changes}
            )
        by_package: dict[str, list[BimElementChange]] = defaultdict(list)
        change_by_id = {change.global_id: change for change in changes}
        for binding in bindings:
            by_package[binding.work_package_id].append(change_by_id[binding.global_id])
        return RevisionComparisonDetail(
            comparison=comparison,
            changes=changes,
            affected_work_packages=tuple(
                AffectedWorkPackage(
                    work_package_id=key,
                    changes=tuple(sorted(value, key=lambda item: item.global_id)),
                )
                for key, value in sorted(by_package.items())
            ),
        )

    def _verified_content(self, key: str, expected_hash: str) -> bytes:
        import hashlib

        content = self.storage.read(key)
        if hashlib.sha256(content).hexdigest() != expected_hash:
            raise DomainError("Stored source revision failed its integrity check")
        return content

    @staticmethod
    def _changes(comparison_id: str, normalized) -> tuple[BimElementChange, ...]:
        items = [
            BimElementChange(comparison_id=comparison_id, global_id=item, change_kind="added")
            for item in normalized.added
        ]
        items.extend(
            BimElementChange(comparison_id=comparison_id, global_id=item, change_kind="deleted")
            for item in normalized.deleted
        )
        items.extend(
            BimElementChange(
                comparison_id=comparison_id,
                global_id=item,
                change_kind="changed",
                changed_aspects=aspects,
            )
            for item, aspects in normalized.changed.items()
        )
        return tuple(sorted(items, key=lambda item: (item.change_kind, item.global_id)))
