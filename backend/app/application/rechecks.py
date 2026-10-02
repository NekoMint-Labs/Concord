"""DBOS-dispatched, dependency-scoped ReChecks; no independent scheduler."""

from uuid import NAMESPACE_URL, uuid5

from app.application.derived_artifacts import DerivedArtifacts
from app.application.engineering_publication import validate_evidence
from app.application.streaming import custom, emit
from app.domain.actions import AuditRecord, Principal
from app.domain.engineering import CapabilityCheck, CapabilityCheckResult, ReCheck
from app.domain.errors import CapabilityUnavailable, Conflict, DomainError, NotFound
from app.domain.models import ProjectSnapshot, new_id, utcnow
from app.domain.project_sources import ProjectSourceRevision
from app.domain.runs import AgentRun
from app.policies.actions import require
from app.ports.coordination import CoordinationRepository, RepositoryFactory
from app.ports.engineering import EngineeringCapability
from app.ports.services import DurableRuntime


class ReCheckService:
    def __init__(self, factory: RepositoryFactory, artifacts: DerivedArtifacts, runtime_name: str):
        self.factory, self.artifacts, self.runtime_name = factory, artifacts, runtime_name
        self.runtime: DurableRuntime | None = None
        self.capabilities: dict[str, EngineeringCapability] = {}

    def record_revision(
        self,
        repo: CoordinationRepository,
        revision: ProjectSourceRevision,
        principal: Principal,
        *,
        finding_id: str | None = None,
        request_id: str = "revision",
    ) -> list[str]:
        identities = []
        for finding in repo.dependent_findings(revision.project_id, revision.source_id):
            if finding_id is not None and finding.id != finding_id:
                continue
            dependencies = tuple(
                d for d in finding.dependencies if d.source_id == revision.source_id
            )
            if request_id == "revision" and all(
                d.source_revision_id == revision.id for d in dependencies
            ):
                continue
            identity = str(
                uuid5(
                    NAMESPACE_URL,
                    f"concord:recheck:{finding.id}:{revision.id}:{finding.updated_at.isoformat()}:{request_id}",
                )
            )
            try:
                repo.recheck(revision.project_id, identity)
            except NotFound:
                run = AgentRun(
                    id=identity,
                    project_id=revision.project_id,
                    category="engineering_recheck",
                    runtime=self.runtime_name,
                )
                repo.save_run(run)
                repo.save_recheck(
                    ReCheck(
                        id=identity,
                        project_id=revision.project_id,
                        finding_id=finding.id,
                        source_id=revision.source_id,
                        source_revision_id=revision.id,
                        dependencies=dependencies,
                        finding_updated_at=finding.updated_at,
                        request_id=request_id,
                    )
                )
                emit(repo, identity, "RUN_STARTED")
                repo.audit(
                    AuditRecord(
                        project_id=revision.project_id,
                        run_id=identity,
                        actor=principal.id,
                        action="RECHECK_REQUESTED",
                    )
                )
            identities.append(identity)
        return identities

    def request(
        self,
        project_id: str,
        finding_id: str,
        principal: Principal,
        *,
        operation_id: str = "manual",
    ) -> list[ReCheck]:
        require(principal, "ingest")
        with self.factory.open(project_id, write=True) as repo:
            finding = repo.finding(project_id, finding_id)
            if finding.state != "CONFIRMED":
                raise Conflict("Only confirmed Findings can be rechecked")
            for source_id in {d.source_id for d in finding.dependencies}:
                revision = repo.latest_source_revision(project_id, source_id)
                if revision:
                    self.record_revision(
                        repo,
                        revision,
                        principal,
                        finding_id=finding.id,
                        request_id="manual:" + operation_id,
                    )
            result = repo.rechecks(project_id, finding_id)
        self.dispatch(project_id)
        return result

    def dispatch(self, project_id: str) -> None:
        if self.runtime is None:
            raise CapabilityUnavailable("ReCheck runtime is not initialized")
        with self.factory.open() as repo:
            queued = [
                r
                for r in repo.pending_runs(project_id)
                if r.category == "engineering_recheck" and r.status == "QUEUED"
            ]
        for run in queued:
            self.runtime.resume(run.id) if run.generation else self.runtime.start(run.id)

    def process(self, run_id: str, *, generation: int) -> str:
        with self.factory.open() as repo:
            initial = repo.run(run_id)
        with self.factory.open(initial.project_id, write=True) as repo:
            run = repo.run(run_id)
            if run.generation != generation or run.status in {"CANCELLED", "EXPIRED", "COMPLETED"}:
                return run.status
            check = repo.recheck(run.project_id, run_id)
            state = repo.state(run.project_id)
            snapshot = ProjectSnapshot(
                project_id=run.project_id, version=state.version, sources=state.sources
            )
            repo.save_snapshot(snapshot)
            repo.save_run(run.model_copy(update={"status": "RUNNING", "updated_at": utcnow()}))
            emit(repo, run_id, "STEP_STARTED", stepName="engineering_recheck")
        cache_writes: list[tuple[str, bytes]] = []
        results = [
            self._execute(check, dependency, cache_writes) for dependency in check.dependencies
        ]
        with self.factory.open(run.project_id, write=True) as repo:
            current = repo.run(run_id)
            if current.generation != generation or current.status in {
                "CANCELLED",
                "EXPIRED",
                "COMPLETED",
            }:
                return current.status
            finding = repo.finding(run.project_id, check.finding_id)
            latest = repo.latest_source_revision(run.project_id, check.source_id)
            stale = (
                finding.updated_at != check.finding_updated_at
                or finding.state != "CONFIRMED"
                or latest is None
                or latest.id != check.source_revision_id
            )
            evidence_ids = []
            if not stale:
                for result in results:
                    for evidence in result.evidence:
                        evidence = evidence.model_copy(
                            update={"id": new_id(), "snapshot_id": snapshot.id}
                        )
                        evidence = validate_evidence(repo, run.project_id, evidence)
                        if (
                            evidence.source_id != check.source_id
                            or evidence.source_revision_id != check.source_revision_id
                        ):
                            raise Conflict("ReCheck evidence escaped its bound revision")
                        repo.save_evidence(evidence)
                        evidence_ids.append(evidence.id)
            outcomes = {r.outcome for r in results}
            outcome = "RESOLVED"
            for candidate in ("NEEDS_REVIEW", "CHANGED", "STILL_OPEN"):
                if candidate in outcomes:
                    outcome = candidate
                    break
            if stale or not results or not evidence_ids:
                outcome = "NEEDS_REVIEW"
            explanation = (
                "Superseded Finding or source revision"
                if stale
                else "; ".join(r.explanation for r in results)
            )
            repo.save_recheck(
                check.model_copy(
                    update={
                        "outcome": outcome,
                        "evidence_ids": tuple(evidence_ids),
                        "explanation": explanation,
                        "completed_at": utcnow(),
                    }
                )
            )
            repo.save_run(
                current.model_copy(
                    update={"status": "COMPLETED", "error": None, "updated_at": utcnow()}
                )
            )
            custom(repo, run_id, "recheck-result", {"outcome": outcome, "finding_id": finding.id})
            emit(repo, run_id, "STEP_FINISHED", stepName="engineering_recheck")
            emit(repo, run_id, "RUN_FINISHED")
            repo.audit(
                AuditRecord(
                    project_id=run.project_id,
                    run_id=run_id,
                    actor="runtime",
                    action="RECHECK_COMPLETED",
                    detail={"outcome": outcome},
                )
            )
        # Only successful, non-stale publication permits cache publication. File I/O
        # stays outside the transaction; cache failure cannot undo authoritative state.
        if not stale:
            for key, content in cache_writes:
                try:
                    self.artifacts.write(key, content)
                except (OSError, DomainError):
                    import logging

                    logging.getLogger("cca").warning("ReCheck artifact cache write failed")
        return "COMPLETED"

    def _execute(self, check, dependency, cache_writes) -> CapabilityCheckResult:
        capability = self.capabilities.get(dependency.capability)
        if capability is None:
            return CapabilityCheckResult(
                outcome="NEEDS_REVIEW",
                explanation=f"Capability unavailable: {dependency.capability}",
            )
        with self.factory.open() as repo:
            before = repo.source_revision(
                check.project_id, check.source_id, dependency.source_revision_id
            )
            after = repo.source_revision(
                check.project_id, check.source_id, check.source_revision_id
            )
        request = CapabilityCheck(
            project_id=check.project_id,
            source_id=check.source_id,
            from_revision_id=before.id,
            to_revision_id=after.id,
            dependency=dependency,
        )
        parameters = dependency.model_dump(mode="json")
        parameters.pop("source_revision_id")
        parameters["target"].pop("source_revision_id")
        parameters["project_id"] = check.project_id
        key = self.artifacts.key(
            capability.name, capability.version, (before.sha256, after.sha256), parameters
        )
        cached = self.artifacts.read(key)
        result = (
            CapabilityCheckResult.model_validate_json(cached)
            if cached
            else capability.check(request)
        )
        normalized = []
        for item in result.evidence:
            if not cached and (
                item.source_id != check.source_id
                or item.source_revision_id != after.id
                or item.source_revision != after.sha256
                or (item.viewer_target and item.viewer_target.source_revision_id != after.id)
            ):
                raise Conflict("Capability returned evidence for another revision")
            target = item.viewer_target
            if target:
                target = target.model_copy(update={"source_revision_id": after.id})
            normalized.append(
                item.model_copy(
                    update={
                        "source_id": check.source_id,
                        "source_revision_id": after.id,
                        "source_revision": after.sha256,
                        "viewer_target": target,
                    }
                )
            )
        if not normalized or any(e.quality != "structured" for e in normalized):
            return CapabilityCheckResult(
                outcome="NEEDS_REVIEW", explanation=result.explanation, evidence=tuple(normalized)
            )
        if not cached and result.outcome != "NEEDS_REVIEW":
            cache_writes.append((key, result.model_dump_json().encode()))
        return result.model_copy(update={"evidence": tuple(normalized)})
