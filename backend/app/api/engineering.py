"""Product-facing engineering coordination. Engine publication stays internal."""

from fastapi import APIRouter, Depends

from app.api.auth import CurrentUser, services
from app.domain.engineering import (
    Change,
    Coordination,
    FindingDecision,
    FindingDraft,
    ReCheck,
    ReCheckRequest,
)
from app.domain.models import Evidence, Finding
from app.policies.actions import require

router = APIRouter(prefix="/api/projects/{project_id}/engineering", tags=["engineering"])


@router.get("/changes", response_model=list[Change])
def changes(
    project_id: str, user: CurrentUser, revision_id: str | None = None, svc=Depends(services)
):
    require(user, "read")
    with svc.factory.open() as repo:
        repo.state(project_id)
        return repo.changes(project_id, revision_id)


@router.get("/evidence/{evidence_id}", response_model=Evidence)
def evidence(project_id: str, evidence_id: str, user: CurrentUser, svc=Depends(services)):
    from app.domain.errors import NotFound

    require(user, "read")
    with svc.factory.open() as repo:
        items = repo.evidence_by_ids(project_id, (evidence_id,))
        if not items:
            raise NotFound("Evidence not found")
        return items[0]


@router.get("/findings", response_model=list[Finding])
def findings(project_id: str, user: CurrentUser, svc=Depends(services)):
    require(user, "read")
    with svc.factory.open() as repo:
        repo.state(project_id)
        return repo.findings(project_id)


@router.get("/findings/{finding_id}", response_model=Finding)
def finding(project_id: str, finding_id: str, user: CurrentUser, svc=Depends(services)):
    require(user, "read")
    with svc.factory.open() as repo:
        return repo.finding(project_id, finding_id)


@router.post("/findings", response_model=Finding, status_code=201)
def propose(project_id: str, request: FindingDraft, user: CurrentUser, svc=Depends(services)):
    return svc.findings.create(project_id, request, user)


@router.post("/findings/{finding_id}/decisions", response_model=Finding)
def decide(
    project_id: str,
    finding_id: str,
    request: FindingDecision,
    user: CurrentUser,
    svc=Depends(services),
):
    return svc.findings.decide(project_id, finding_id, request, user)


@router.get("/findings/{finding_id}/coordination", response_model=list[Coordination])
def coordination(project_id: str, finding_id: str, user: CurrentUser, svc=Depends(services)):
    require(user, "read")
    with svc.factory.open() as repo:
        repo.finding(project_id, finding_id)
        return repo.coordination_records(project_id, finding_id)


@router.get("/findings/{finding_id}/rechecks", response_model=list[ReCheck])
def rechecks(project_id: str, finding_id: str, user: CurrentUser, svc=Depends(services)):
    require(user, "read")
    with svc.factory.open() as repo:
        repo.finding(project_id, finding_id)
        return repo.rechecks(project_id, finding_id)


@router.post("/findings/{finding_id}/rechecks", response_model=list[ReCheck], status_code=202)
def request_recheck(
    project_id: str,
    finding_id: str,
    request: ReCheckRequest,
    user: CurrentUser,
    svc=Depends(services),
):
    return svc.rechecks.request(project_id, finding_id, user, operation_id=request.operation_id)
