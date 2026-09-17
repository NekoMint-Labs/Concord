"""Snapshot-bound, read-only tools shared by deterministic and model agents."""

from app.application.agent_scope import package_ids
from app.application.project_sources import source_statuses
from app.domain.agent import AgentScope, ToolTrace
from app.domain.agent_tools import (
    ReadResult,
    RevisionQuery,
    SearchQuery,
    WorkPackageFact,
    WorkPackageQuery,
)
from app.domain.errors import Conflict, PermissionDenied, ProviderError
from app.domain.models import Evidence, ProjectSnapshot, ProjectState, new_id, utcnow
from app.domain.readiness import evaluate
from app.policies.actions import check_fresh
from app.ports.agent import EngineeringReadPort
from app.ports.coordination import RepositoryFactory
from app.ports.providers import SearchProvider


class ReadTools:
    def __init__(
        self,
        factory: RepositoryFactory,
        state: ProjectState,
        snapshot: ProjectSnapshot,
        scope: AgentScope,
        search: SearchProvider,
        engineering: EngineeringReadPort | None = None,
        run_id: str | None = None,
        generation: int = 0,
    ):
        self.factory, self.state, self.snapshot, self.scope = factory, state, snapshot, scope
        self.search, self.engineering = search, engineering
        self.run_id, self.generation = run_id, generation
        self.allowed_packages = package_ids(state, scope)
        self.evaluation = evaluate(state, snapshot)
        self.observations: list[ReadResult] = []
        self.trace: list[ToolTrace] = []
        self.comparisons: list[tuple[RevisionQuery, ReadResult]] = []
        self.binding_results: list[ReadResult] = []
        self.revision_hashes: set[str] | None = None
        if scope.source_id:
            with factory.open() as repo:
                self.revision_hashes = {
                    repo.source_revision(state.project.id, scope.source_id, identity).sha256
                    for identity in (scope.from_revision_id, scope.to_revision_id)
                    if identity
                }

    def fresh(self) -> None:
        with self.factory.open() as repo:
            check_fresh(self.snapshot, repo.state(self.state.project.id))
            if self.run_id:
                run = repo.run(self.run_id)
                if run.generation != self.generation or run.status in {"CANCELLED", "EXPIRED"}:
                    raise Conflict("Investigation was stopped or superseded")

    def _fact(self, fact: str, source: str, revision: str) -> Evidence:
        return Evidence(
            snapshot_id=self.snapshot.id,
            provider="project-records",
            source_id=source,
            source_revision=revision,
            observed_at=utcnow(),
            fact=fact,
        )

    def record(self, name: str, result: ReadResult) -> ReadResult:
        self.fresh()
        if len(self.trace) >= 12:
            raise ProviderError("Investigation exceeded its read-tool budget")
        self.observations.append(result)
        self.trace.append(
            ToolTrace(
                tool=name,
                evidence_ids=tuple(e.id for e in result.evidence),
                available=result.available,
            )
        )
        return result

    def project_state(self) -> ReadResult:
        with self.factory.open() as repo:
            sources = tuple(
                s
                for s in source_statuses(repo, self.state.project.id)
                if not self.scope.source_id or s.source.id == self.scope.source_id
            )
        if not self.scope.source_id and (
            self.scope.work_package_ids or self.scope.area_ids or self.scope.element_ids
        ):
            sources = ()  # A project catalog is not evidence of source-to-WP association.
        evidence, _, constraints, _, _ = self.evaluation
        visible = self.allowed_packages
        if self.scope.source_id and (
            self.scope.element_ids or not (self.scope.work_package_ids or self.scope.area_ids)
        ):
            visible = frozenset()  # Source relevance requires actual persisted bindings.
        facts = tuple(
            WorkPackageFact(
                id=p.id,
                area_id=p.area_id,
                discipline=p.discipline,
                blocker_count=sum(c.work_package_id == p.id for c in constraints),
            )
            for p in self.state.work_packages
            if p.id in visible
        )
        overview = self._fact(
            f"Recorded project version {self.state.version}; {len(facts)} work packages in scope; "
            f"{sum(s.has_pending_revision for s in sources)} sources differ from the baseline.",
            self.state.project.id,
            str(self.state.version),
        )
        return self.record(
            "project_state",
            ReadResult(
                work_packages=facts,
                sources=sources,
                evidence=(overview,) + tuple(e for e in evidence if e.work_package_id in visible),
            ),
        )

    def validate_revision(self, query: RevisionQuery) -> None:
        scope = self.scope
        if not scope.source_id and (scope.work_package_ids or scope.area_ids or scope.element_ids):
            raise PermissionDenied("Select the associated source before comparing scoped revisions")
        if scope.source_id and (
            query.source_id != scope.source_id
            or query.from_revision_id != scope.from_revision_id
            or query.to_revision_id != scope.to_revision_id
        ):
            raise PermissionDenied("Comparison is outside the selected revision scope")
        with self.factory.open() as repo:
            for identity in (query.from_revision_id, query.to_revision_id):
                if identity:
                    repo.source_revision(self.state.project.id, query.source_id, identity)

    def compare_revisions(self, query: RevisionQuery) -> ReadResult:
        self.validate_revision(query)
        with self.factory.open() as repo:
            target = repo.source_revision(
                self.state.project.id, query.source_id, query.to_revision_id
            )
            origin = (
                repo.source_revision(self.state.project.id, query.source_id, query.from_revision_id)
                if query.from_revision_id
                else None
            )
        fact = (
            f"Source {query.source_id}: revision {target.id} "
            f"(sequence {target.sequence}, SHA256 {target.sha256}). "
        )
        fact += (
            f"Compared with {origin.id}: original bytes "
            f"{'match' if origin.sha256 == target.sha256 else 'differ'}."
            if origin
            else "No prior revision selected."
        )
        return self.record(
            "compare_revisions",
            ReadResult(
                evidence=(self._fact(fact, query.source_id, target.sha256),),
                limitations=(
                    "File metadata does not establish BIM changes or engineering readiness.",
                ),
            ),
        )

    def bim_changes(self, query: RevisionQuery) -> ReadResult:
        self.validate_revision(query)
        result = (
            self.engineering.changes(self.snapshot, self.scope, query)
            if self.engineering
            else ReadResult(
                available=False,
                limitations=("Persisted BIM comparison provider is not connected.",),
            )
        )
        with self.factory.open() as repo:
            hashes = {
                repo.source_revision(self.state.project.id, query.source_id, identity).sha256
                for identity in (query.from_revision_id, query.to_revision_id)
                if identity
            }
        if any(
            e.source_id != query.source_id or e.source_revision not in hashes
            for e in result.evidence
        ):
            raise ProviderError("Comparison evidence does not match the selected revisions")
        result = result.model_copy(update={"bindings": ()})
        if self.scope.element_ids:
            result = result.model_copy(
                update={
                    "changes": tuple(
                        c for c in result.changes if c.global_id in self.scope.element_ids
                    )
                }
            )
        result = self._engineering_result(result)
        if any(
            not any(c.global_id in e.element_ids for e in result.evidence) for c in result.changes
        ):
            raise ProviderError("Each changed element requires its own supporting evidence")
        self.comparisons.append((query, result))
        return self.record("bim_changes", result)

    def work_package_bindings(self, query: WorkPackageQuery) -> ReadResult:
        if set(query.work_package_ids) - self.allowed_packages:
            raise PermissionDenied("Binding query is outside the selected work-package scope")
        result = (
            self.engineering.bindings(self.snapshot, self.scope, query)
            if self.engineering
            else ReadResult(
                available=False,
                limitations=("Persisted source-level BIM binding provider is not connected.",),
            )
        )
        selected = set(query.work_package_ids) or self.allowed_packages
        if any(b.work_package_id not in selected for b in result.bindings):
            raise ProviderError("Engineering provider returned bindings outside the query")
        if self.scope.source_id and any(
            b.source_id != self.scope.source_id for b in result.bindings
        ):
            raise ProviderError("Engineering provider returned bindings from another source")
        with self.factory.open() as repo:
            for source_id in {b.source_id for b in result.bindings}:
                repo.project_source(self.state.project.id, source_id)
        result = result.model_copy(update={"changes": ()})
        result = self._engineering_result(result)
        if any(
            not any(
                e.work_package_id == b.work_package_id
                and e.source_id == b.source_id
                and b.global_id in e.element_ids
                for e in result.evidence
            )
            for b in result.bindings
        ):
            raise ProviderError("Each binding requires source, element and WP supporting evidence")
        self.binding_results.append(result)
        return self.record("work_package_bindings", result)

    def _engineering_result(self, result: ReadResult) -> ReadResult:
        if not result.available and (result.changes or result.bindings):
            raise ProviderError("Unavailable engineering results cannot supply facts")
        # Provider facts must already be persisted and project-scoped.
        with self.factory.open() as repo:
            stored = {
                e.id: e
                for e in repo.evidence_by_ids(
                    self.state.project.id, tuple(e.id for e in result.evidence)
                )
            }
        for evidence in result.evidence:
            if stored.get(evidence.id) != evidence or not self._in_scope(evidence):
                raise ProviderError("Engineering provider evidence is unpersisted or outside scope")
        if (result.changes or result.bindings) and not result.evidence:
            raise ProviderError("Engineering results require persisted supporting evidence")
        return result.model_copy(
            update={
                "evidence": tuple(self._historical(e) for e in result.evidence),
                "work_packages": (),
                "sources": (),
                "bindings": tuple(
                    b
                    for b in result.bindings
                    if not self.scope.element_ids or b.global_id in self.scope.element_ids
                ),
            }
        )

    def _historical(self, item: Evidence) -> Evidence:
        return item.model_copy(
            update={
                "id": new_id(),
                "snapshot_id": self.snapshot.id,
                "fact": (
                    f"Recorded evidence {item.id} from snapshot {item.snapshot_id}: {item.fact}"
                ),
            }
        )

    def _in_scope(self, item: Evidence) -> bool:
        if item.work_package_id and item.work_package_id not in self.allowed_packages:
            return False
        if self.scope.element_ids and not set(item.element_ids).intersection(
            self.scope.element_ids
        ):
            return False
        if self.scope.source_id and item.source_id != self.scope.source_id:
            return False
        if self.revision_hashes is not None and item.source_revision not in self.revision_hashes:
            return False
        if (self.scope.work_package_ids or self.scope.area_ids) and not item.work_package_id:
            return False
        return True

    def persisted_evidence(self) -> ReadResult:
        with self.factory.open() as repo:
            evidence = tuple(
                self._historical(e)
                for e in repo.evidence(self.state.project.id)
                if self._in_scope(e)
            )[:30]
        return self.record(
            "persisted_evidence",
            ReadResult(
                evidence=evidence,
                limitations=(
                    "Historical evidence retains its original snapshot and source revision.",
                ),
            ),
        )

    def relevant_documents(self, query: SearchQuery) -> ReadResult:
        from app.application.agent_documents import relevant_documents

        return relevant_documents(self, query)
