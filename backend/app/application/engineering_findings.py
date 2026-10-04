"""Evidence-bound findings and explicit human coordination decisions."""

from app.application.engineering_inputs import inputs_current, validate_groups
from app.application.engineering_publication import validate_evidence
from app.application.projects import record_lifecycle_change
from app.application.rechecks import ReCheckService
from app.domain.actions import Principal
from app.domain.engineering import Coordination, FindingDecision, FindingDraft
from app.domain.errors import Conflict
from app.domain.models import Finding, ProjectSnapshot, utcnow
from app.policies.actions import require
from app.ports.coordination import CoordinationRepository, RepositoryFactory


def validate_draft(repo: CoordinationRepository, project_id: str, request: FindingDraft) -> None:
    validate_groups(request.dependencies)
    state = repo.state(project_id)
    evidence = repo.evidence_by_ids(project_id, request.evidence_ids)
    if {e.id for e in evidence} != set(request.evidence_ids):
        raise Conflict("Finding may only cite persisted project Evidence")
    evidence = [validate_evidence(repo, project_id, e) for e in evidence]
    provenance = {(e.source_id, e.source_revision_id) for e in evidence}
    for dependency in request.dependencies:
        revision = repo.source_revision(
            project_id, dependency.source_id, dependency.source_revision_id
        )
        if dependency.target.source_revision_id != revision.id:
            raise Conflict("Dependency target references another revision")
        if (dependency.source_id, revision.id) not in provenance:
            raise Conflict("Every dependency needs persisted revision-bound Evidence")
        for identity in dependency.work_package_ids:
            state.package(identity)
    for identity in request.change_ids:
        change = repo.change(project_id, identity)
        if (change.source_id, change.to_revision_id) not in provenance:
            raise Conflict("Finding change lacks revision-bound Evidence")
    for identity in request.impact.work_package_ids:
        state.package(identity)
    if not set(request.impact.area_ids) <= {a.id for a in state.areas}:
        raise Conflict("Impact contains an unknown project area")


class FindingService:
    def __init__(self, factory: RepositoryFactory, rechecks: ReCheckService):
        self.factory, self.rechecks = factory, rechecks

    def create(self, project_id: str, request: FindingDraft, principal: Principal) -> Finding:
        require(principal, "ingest")
        with self.factory.open(project_id, write=True) as repo:
            validate_draft(repo, project_id, request)
            state = repo.state(project_id)
            snapshot = ProjectSnapshot(
                project_id=project_id, version=state.version, sources=state.sources
            )
            repo.save_snapshot(snapshot)
            item = Finding(
                project_id=project_id,
                snapshot_id=snapshot.id,
                work_package_id=next(iter(request.impact.work_package_ids), ""),
                conclusion=request.why_it_matters,
                reasoning_summary=request.what_changed,
                **request.model_dump(),
            )
            repo.save_finding(item, new=True)
            record_lifecycle_change(
                repo, state, principal, "FINDING_PROPOSED", {"finding_id": item.id}
            )
        return item

    def decide(
        self, project_id: str, finding_id: str, request: FindingDecision, principal: Principal
    ) -> Finding:
        require(principal, "approve")
        with self.factory.open(project_id, write=True) as repo:
            item = repo.finding(project_id, finding_id)
            allowed = {
                "PROPOSED": {"CONFIRMED", "DISMISSED", "EDITED"},
                "CONFIRMED": {"DISMISSED", "CLOSED", "EDITED"},
                "DISMISSED": {"REOPENED"},
                "CLOSED": {"REOPENED"},
            }
            if request.decision not in allowed[item.state]:
                raise Conflict(f"Cannot apply {request.decision} to a {item.state} Finding")
            if request.recheck_id is not None:
                recheck = repo.recheck(project_id, request.recheck_id)
                if recheck.finding_id != item.id:
                    raise Conflict("Decision ReCheck must belong to the current Finding")
            if request.decision == "CLOSED":
                self._check_closure(repo, project_id, item, request)
            updates: dict = {"updated_at": utcnow()}
            if request.decision != "EDITED":
                updates["state"] = (
                    "PROPOSED" if request.decision == "REOPENED" else request.decision
                )
            if request.title is not None:
                updates["title"] = request.title
            if request.suggested_action is not None:
                updates["suggested_action"] = request.suggested_action
            updated = item.model_copy(update=updates)
            repo.save_finding(updated)
            repo.add_coordination(
                Coordination(
                    project_id=project_id,
                    finding_id=item.id,
                    actor=principal.id,
                    decision=request.decision,
                    note=request.note,
                    recheck_id=request.recheck_id,
                )
            )
            record_lifecycle_change(
                repo,
                repo.state(project_id),
                principal,
                "FINDING_" + request.decision,
                {"finding_id": item.id},
            )
            if request.decision == "CONFIRMED":
                # An arrival while this Finding was only proposed did not enqueue it.
                # Bind catch-up checks to the confirmed version in the same transaction.
                for source_id in {d.source_id for d in updated.dependencies}:
                    revision = repo.latest_source_revision(project_id, source_id)
                    if revision:
                        self.rechecks.record_revision(
                            repo, revision, principal, finding_id=updated.id
                        )
        if request.decision == "CONFIRMED":
            self.rechecks.dispatch(project_id)
        return updated

    @staticmethod
    def _check_closure(repo, project_id, item, request):
        if item.state != "CONFIRMED" or not request.recheck_id:
            raise Conflict("Closure requires a confirmed Finding and resolved ReCheck")
        recheck = repo.recheck(project_id, request.recheck_id)
        if (
            recheck.finding_id != item.id
            or recheck.outcome != "RESOLVED"
            or not recheck.evidence_ids
            or recheck.finding_updated_at != item.updated_at
        ):
            raise Conflict("Closure requires current resolved ReCheck evidence")
        if not inputs_current(repo, recheck):
            raise Conflict("ReCheck is superseded by a newer revision")
        # Multi-source findings require a resolved, current check for every dependency source.
        for dependency in item.dependencies:
            if not any(
                r.outcome == "RESOLVED"
                and r.evidence_ids
                and r.finding_updated_at == item.updated_at
                and dependency in r.dependencies
                and inputs_current(repo, r)
                for r in repo.rechecks(project_id, item.id)
            ):
                raise Conflict("Every dependency source requires current resolved evidence")
