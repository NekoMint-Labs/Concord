"""Explicit human acceptance of a complete immutable revision set."""

from app.application.projects import record_lifecycle_change
from app.domain.actions import Principal
from app.domain.baselines import Baseline, CreateBaseline
from app.policies.actions import require
from app.ports.coordination import RepositoryFactory


class BaselineService:
    def __init__(self, factory: RepositoryFactory):
        self.factory = factory

    def create(self, project_id: str, request: CreateBaseline, principal: Principal) -> Baseline:
        require(principal, "approve")
        with self.factory.open(project_id, write=True) as repo:
            state = repo.state(project_id)
            for entry in request.entries:
                repo.source_revision(project_id, entry.source_id, entry.revision_id)
            previous = repo.latest_baseline(project_id)
            baseline = Baseline(
                project_id=project_id,
                sequence=previous.sequence + 1 if previous else 1,
                accepted_by=principal.id,
                name=request.name,
                entries=tuple(sorted(request.entries, key=lambda entry: entry.source_id)),
            )
            repo.add_baseline(baseline)
            record_lifecycle_change(
                repo, state, principal, "BASELINE_ACCEPTED", {"baseline_id": baseline.id}
            )
        return baseline
