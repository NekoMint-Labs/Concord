"""User controls and a revision-to-investigation outbox in the existing transaction."""

from app.application.agent_scope import bind_scope
from app.application.streaming import custom, emit
from app.domain.actions import AuditRecord, Principal
from app.domain.agent import (
    AgentNotice,
    AgentRequest,
    AgentScope,
    AgentSettings,
    InvestigationRequest,
)
from app.domain.models import utcnow
from app.domain.project_sources import ProjectSourceRevision
from app.domain.runs import AgentRun
from app.policies.actions import require
from app.ports.coordination import CoordinationRepository, RepositoryFactory
from app.ports.services import DurableRuntime


class AgentControlService:
    def __init__(self, factory: RepositoryFactory, runtime: DurableRuntime, runtime_name: str):
        self.factory, self.runtime, self.runtime_name = factory, runtime, runtime_name

    def configure(
        self, project_id: str, settings: AgentSettings, principal: Principal
    ) -> AgentSettings:
        require(principal, "execute")
        cancelled = []
        with self.factory.open(project_id, write=True) as repo:
            repo.state(project_id)
            repo.save_agent_settings(project_id, settings)
            if settings.initiative != "auto-investigate":
                for run in repo.pending_runs(project_id):
                    if run.category == "investigation" and repo.investigation(run.id).automatic:
                        repo.save_run(
                            run.model_copy(update={"status": "CANCELLED", "updated_at": utcnow()})
                        )
                        custom(
                            repo,
                            run.id,
                            "cancelled",
                            {"reason": "automatic-investigation-disabled"},
                        )
                        cancelled.append(run)
            repo.audit(
                AuditRecord(
                    project_id=project_id,
                    action="AGENT_INITIATIVE_CHANGED",
                    actor=principal.id,
                    detail=settings.model_dump(),
                )
            )
        for run in cancelled:
            self.runtime.cancel(run.id, generation=run.generation)
        return settings

    def enqueue(self, project_id: str, request: AgentRequest, principal: Principal) -> AgentRun:
        require(principal, "execute")
        with self.factory.open(project_id, write=True) as repo:
            request = bind_scope(repo, project_id, request)
            run = self._enqueue(repo, project_id, request, principal.id)
        self.runtime.start(run.id)
        with self.factory.open() as repo:
            return repo.run(run.id)

    def _enqueue(
        self,
        repo: CoordinationRepository,
        project_id: str,
        request: AgentRequest,
        actor: str,
        automatic: bool = False,
    ) -> AgentRun:
        run = AgentRun(project_id=project_id, category="investigation", runtime=self.runtime_name)
        repo.save_run(run)
        repo.save_investigation(
            InvestigationRequest(
                run_id=run.id,
                project_id=project_id,
                requested_by=actor,
                request=request,
                automatic=automatic,
            )
        )
        emit(repo, run.id, "RUN_STARTED")
        repo.audit(
            AuditRecord(
                project_id=project_id,
                action="INVESTIGATION_REQUESTED",
                actor=actor,
                run_id=run.id,
                detail={"scope": request.scope.model_dump_json(), "automatic": automatic},
            )
        )
        return run

    def record_revision(
        self, repo: CoordinationRepository, revision: ProjectSourceRevision, principal: Principal
    ) -> None:
        baseline = repo.latest_baseline(revision.project_id)
        origin = (
            next(
                (e.revision_id for e in baseline.entries if e.source_id == revision.source_id), None
            )
            if baseline
            else None
        )
        run = None
        if repo.agent_settings(revision.project_id).initiative == "auto-investigate":
            request = AgentRequest(
                instruction="Investigate the newly stored source revision.",
                scope=AgentScope(
                    source_id=revision.source_id,
                    from_revision_id=origin,
                    to_revision_id=revision.id,
                ),
            )
            run = self._enqueue(repo, revision.project_id, request, principal.id, automatic=True)
        repo.save_agent_notice(
            AgentNotice(
                id=revision.id,
                project_id=revision.project_id,
                source_id=revision.source_id,
                revision_id=revision.id,
                from_revision_id=origin,
                run_id=run.id if run else None,
            )
        )

    def dispatch(self, project_id: str) -> None:
        with self.factory.open() as repo:
            queued = [
                r
                for r in repo.pending_runs(project_id)
                if r.category == "investigation" and r.status == "QUEUED"
            ]
        for run in queued:
            if run.generation:
                self.runtime.resume(run.id)
            else:
                self.runtime.start(run.id)
