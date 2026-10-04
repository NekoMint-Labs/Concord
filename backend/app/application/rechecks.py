"""DBOS-dispatched, dependency-scoped ReChecks; no independent scheduler."""

import hashlib
import json
from uuid import NAMESPACE_URL, uuid5

from app.application.derived_artifacts import DerivedArtifacts
from app.application.engineering_inputs import bind_inputs, dependency_groups, inputs_current
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

    def register(self, capability: EngineeringCapability) -> None:
        if not capability.name or not capability.version or capability.name in self.capabilities:
            raise Conflict("Engineering capability needs a unique name and nonempty version")
        self.capabilities[capability.name] = capability

    def record_revision(
        self,
        repo: CoordinationRepository,
        revision: ProjectSourceRevision,
        principal: Principal,
        *,
        finding_id: str | None = None,
        request_id: str = "revision",
        ids_only: bool = False,
    ) -> list[str]:
        identities = []
        for finding in repo.dependent_findings(revision.project_id, revision.source_id):
            if finding_id is not None and finding.id != finding_id:
                continue
            affected_groups = {
                d.group_id
                for d in finding.dependencies
                if d.source_id == revision.source_id and d.group_id is not None
            }
            dependencies = tuple(
                d
                for d in finding.dependencies
                if (d.source_id == revision.source_id or d.group_id in affected_groups)
                and (not ids_only or d.requirements_kind == "ids")
            )
            if not dependencies:
                continue
            inputs, selection = bind_inputs(repo, revision.project_id, dependencies)
            if request_id == "revision" and all(
                i.from_revision_id == i.source_revision_id
                for i in inputs
                if i.role != "requirements"
            ):
                continue
            digest = hashlib.sha256(
                json.dumps(
                    [
                        [i.model_dump(mode="json") for i in inputs],
                        selection.id if selection else None,
                    ],
                    sort_keys=True,
                ).encode()
            ).hexdigest()[:32]
            bound_request_id = request_id + ":" + digest
            # Both model triggers expand to the same bound group. The trigger's
            # revision must not create a second durable run for that input set.
            identity = str(
                uuid5(
                    NAMESPACE_URL,
                    f"concord:recheck:{finding.id}:{finding.updated_at.isoformat()}:{bound_request_id}",
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
                        request_id=bound_request_id,
                        inputs=inputs,
                        ids_requirements=selection,
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
        with self.factory.open() as repo:
            ready = inputs_current(repo, check)
        # A paired capability executes once per group, not once per model.
        results = (
            [
                self._execute(check, members[0], group, cache_writes)
                for group, members in dependency_groups(check.dependencies).items()
            ]
            if ready
            else []
        )
        with self.factory.open(run.project_id, write=True) as repo:
            current = repo.run(run_id)
            if current.generation != generation or current.status in {
                "CANCELLED",
                "EXPIRED",
                "COMPLETED",
            }:
                return current.status
            finding = repo.finding(run.project_id, check.finding_id)
            stale = (
                finding.updated_at != check.finding_updated_at
                or finding.state != "CONFIRMED"
                or not inputs_current(repo, check)
            )
            evidence_ids = []
            if not stale:
                for result in results:
                    for evidence in result.evidence:
                        evidence = evidence.model_copy(
                            update={"id": new_id(), "snapshot_id": snapshot.id}
                        )
                        evidence = validate_evidence(repo, run.project_id, evidence)
                        bound = {
                            (i.source_id, i.source_revision_id)
                            for i in check.inputs
                            if i.role != "requirements"
                        } or {(check.source_id, check.source_revision_id)}
                        if (evidence.source_id, evidence.source_revision_id) not in bound:
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

    def _execute(self, check, dependency, group, cache_writes) -> CapabilityCheckResult:
        with self.factory.open() as repo:
            if not inputs_current(repo, check):
                return CapabilityCheckResult(
                    outcome="NEEDS_REVIEW", explanation="Superseded engineering input set"
                )
        capability = self.capabilities.get(dependency.capability)
        if capability is None:
            return CapabilityCheckResult(
                outcome="NEEDS_REVIEW",
                explanation=f"Capability unavailable: {dependency.capability}",
            )
        if dependency.requirements_kind == "ids" and check.ids_requirements is None:
            return CapabilityCheckResult(
                outcome="NEEDS_REVIEW", explanation="Select an explicit IDS requirements revision"
            )
        inputs = tuple(i for i in check.inputs if i.group_id == group)
        primary = next((i for i in inputs if i.role != "requirements"), None)
        with self.factory.open() as repo:
            before = repo.source_revision(
                check.project_id, dependency.source_id, dependency.source_revision_id
            )
            after = repo.source_revision(
                check.project_id,
                dependency.source_id,
                primary.source_revision_id if primary else check.source_revision_id,
            )
            revisions = [
                repo.source_revision(check.project_id, i.source_id, i.source_revision_id)
                for i in inputs
            ]
        originals = []
        for item, revision in zip(inputs, revisions, strict=True):
            content = self.artifacts.storage.read(revision.storage_key)
            if (
                len(content) != revision.size_bytes
                or hashlib.sha256(content).hexdigest() != item.sha256
            ):
                raise Conflict("Engineering input original failed integrity validation")
            originals.append(content)
        request = CapabilityCheck(
            project_id=check.project_id,
            source_id=dependency.source_id,
            from_revision_id=before.id,
            to_revision_id=after.id,
            dependency=dependency,
            group_id=dependency.group_id,
            inputs=inputs,
            input_bytes=tuple(originals),
            ids_requirements=check.ids_requirements
            if dependency.requirements_kind == "ids"
            else None,
        )
        parameters = dependency.model_dump(mode="json")
        parameters.pop("source_revision_id")
        parameters["target"].pop("source_revision_id")
        parameters["project_id"] = check.project_id
        strict_inputs = dependency.group_id is not None or dependency.requirements_kind == "ids"
        if strict_inputs:
            parameters["inputs"] = [i.model_dump(mode="json") for i in inputs]
            parameters["selection_id"] = (
                check.ids_requirements.id if check.ids_requirements else None
            )
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
        bound = {i.source_id: i for i in inputs if i.role != "requirements"}
        for item in result.evidence:
            if strict_inputs:
                identity = bound.get(item.source_id)
                if identity is None or (
                    item.source_revision_id != identity.source_revision_id
                    or item.source_revision != identity.sha256
                    or (
                        item.viewer_target
                        and item.viewer_target.source_revision_id != identity.source_revision_id
                    )
                ):
                    raise Conflict(
                        "Capability returned evidence outside the complete bound input set"
                    )
                normalized.append(item)
                continue
            if not cached and (
                item.source_id != dependency.source_id
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
                        "source_id": dependency.source_id,
                        "source_revision_id": after.id,
                        "source_revision": after.sha256,
                        "viewer_target": target,
                    }
                )
            )
        if not normalized or any(e.quality != "structured" for e in normalized):
            return CapabilityCheckResult(
                outcome="NEEDS_REVIEW",
                explanation=result.explanation,
                evidence=() if strict_inputs else tuple(normalized),
            )
        if strict_inputs and (
            {e.source_id for e in normalized} != set(bound)
            or (result.outcome == "RESOLVED" and result.expected_condition_satisfied is not True)
        ):
            return CapabilityCheckResult(
                outcome="NEEDS_REVIEW",
                explanation="Complete input Evidence and expected-condition evaluation required",
                evidence=(),
            )
        if not cached and result.outcome != "NEEDS_REVIEW":
            cache_writes.append((key, result.model_dump_json().encode()))
        return result.model_copy(update={"evidence": tuple(normalized)})
