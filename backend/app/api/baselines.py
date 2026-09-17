"""Baseline reads and explicit human acceptance. Upload never accepts a revision."""

from fastapi import APIRouter, Depends

from app.api.auth import CurrentUser, services
from app.domain.baselines import Baseline, CreateBaseline
from app.policies.actions import require

router = APIRouter(prefix="/api/projects/{project_id}/baselines", tags=["baselines"])


@router.post("", response_model=Baseline, status_code=201)
def create_baseline(
    project_id: str, request: CreateBaseline, user: CurrentUser, svc=Depends(services)
):
    return svc.baselines.create(project_id, request, user)


@router.get("", response_model=list[Baseline])
def baselines(project_id: str, user: CurrentUser, svc=Depends(services)):
    require(user, "read")
    with svc.factory.open() as repo:
        repo.state(project_id)
        return repo.baselines(project_id)


@router.get("/{baseline_id}", response_model=Baseline)
def baseline(project_id: str, baseline_id: str, user: CurrentUser, svc=Depends(services)):
    require(user, "read")
    with svc.factory.open() as repo:
        return repo.baseline(project_id, baseline_id)
