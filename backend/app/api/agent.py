"""Ask is read-only. Investigation and Act reuse the existing durable run/action APIs."""

from fastapi import APIRouter, Depends

from app.api.auth import CurrentUser, services
from app.domain.agent import (
    AgentNotice,
    AgentRequest,
    AgentResponse,
    AgentSettings,
    InvestigationReport,
)
from app.domain.errors import NotFound
from app.domain.runs import AgentRun
from app.policies.actions import require

router = APIRouter(prefix="/api/projects/{project_id}/agent", tags=["agent"])


@router.get("/settings", response_model=AgentSettings)
def settings(project_id: str, user: CurrentUser, svc=Depends(services)):
    require(user, "read")
    with svc.factory.open() as repo:
        repo.state(project_id)
        return repo.agent_settings(project_id)


@router.post("/settings", response_model=AgentSettings)
def configure(project_id: str, request: AgentSettings, user: CurrentUser, svc=Depends(services)):
    return svc.agent.configure(project_id, request, user)


@router.get("/notices", response_model=list[AgentNotice])
def notices(project_id: str, user: CurrentUser, svc=Depends(services)):
    require(user, "read")
    with svc.factory.open() as repo:
        repo.state(project_id)
        return repo.agent_notices(project_id)


@router.post("/ask", response_model=AgentResponse)
def ask(project_id: str, request: AgentRequest, user: CurrentUser, svc=Depends(services)):
    require(user, "read")
    return svc.investigations.ask(project_id, request)


@router.post("/investigate", response_model=AgentRun, status_code=202)
def investigate(project_id: str, request: AgentRequest, user: CurrentUser, svc=Depends(services)):
    return svc.agent.enqueue(project_id, request, user)


@router.get("/investigations/{run_id}", response_model=InvestigationReport | None)
def report(project_id: str, run_id: str, user: CurrentUser, svc=Depends(services)):
    require(user, "read")
    with svc.factory.open() as repo:
        run = repo.run(run_id)
        if run.project_id != project_id or run.category != "investigation":
            raise NotFound("Investigation does not belong to this project")
        return repo.investigation_report(run_id)
