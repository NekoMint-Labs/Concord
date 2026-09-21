"""Expose persisted BIM comparisons and bindings through the Agent read contract."""

from app.application.agent_scope import package_ids
from app.domain.agent import AgentScope
from app.domain.agent_tools import (
    BindingFact,
    ElementChange,
    ReadResult,
    RevisionQuery,
    WorkPackageQuery,
)
from app.domain.models import ProjectSnapshot
from app.ports.coordination import RepositoryFactory


class PersistedBimEngineering:
    def __init__(self, factory: RepositoryFactory):
        self.factory = factory

    def changes(
        self, snapshot: ProjectSnapshot, scope: AgentScope, query: RevisionQuery
    ) -> ReadResult:
        if query.from_revision_id is None:
            return ReadResult(
                available=False,
                limitations=("Select two imported BIM revisions before requesting changes.",),
            )
        with self.factory.open() as repo:
            comparison = repo.revision_comparison_for_revisions(
                snapshot.project_id,
                query.source_id,
                query.from_revision_id,
                query.to_revision_id,
            )
            if comparison is None:
                return ReadResult(
                    available=False,
                    limitations=("The selected BIM revisions have not been compared.",),
                )
            changes = repo.bim_element_changes(comparison.id)
            evidence = repo.evidence_by_ids(snapshot.project_id, comparison.evidence_ids)
            allowed = package_ids(repo.state(snapshot.project_id), scope)
            visible = {item.global_id for item in changes}
            if scope.work_package_ids or scope.area_ids:
                visible &= {
                    binding.global_id
                    for binding in repo.bim_bindings(
                        snapshot.project_id, query.source_id, visible
                    )
                    if binding.work_package_id in allowed
                }
        if scope.element_ids:
            visible &= set(scope.element_ids)
        if scope.work_package_ids or scope.area_ids or scope.element_ids:
            changes = [item for item in changes if item.global_id in visible]
            evidence = [
                item
                for item in evidence
                if visible.intersection(item.element_ids)
                and (
                    not (scope.work_package_ids or scope.area_ids)
                    or item.work_package_id is None
                    or item.work_package_id in allowed
                )
            ]
        return ReadResult(
            evidence=tuple(evidence),
            changes=tuple(
                ElementChange(
                    global_id=item.global_id,
                    kind=item.change_kind,
                    aspects=item.changed_aspects,
                )
                for item in changes
            ),
            limitations=comparison.summary.warnings,
        )

    def bindings(
        self, snapshot: ProjectSnapshot, scope: AgentScope, query: WorkPackageQuery
    ) -> ReadResult:
        with self.factory.open() as repo:
            state = repo.state(snapshot.project_id)
            selected_packages = set(query.work_package_ids) or set(package_ids(state, scope))
            if scope.source_id:
                source_ids = (scope.source_id,)
            else:
                source_ids = tuple(
                    source.id
                    for source in repo.project_sources(snapshot.project_id, limit=50)
                    if source.kind == "BIM"
                )
            bindings = [
                binding
                for source_id in source_ids
                for binding in repo.bim_bindings(snapshot.project_id, source_id)
                if binding.work_package_id in selected_packages
                and (not scope.element_ids or binding.global_id in scope.element_ids)
            ]
            evidence = repo.evidence_by_ids(
                snapshot.project_id, tuple(binding.evidence_id for binding in bindings)
            )
        return ReadResult(
            evidence=tuple(evidence),
            bindings=tuple(
                BindingFact(
                    work_package_id=item.work_package_id,
                    source_id=item.source_id,
                    global_id=item.global_id,
                )
                for item in bindings
            ),
        )
