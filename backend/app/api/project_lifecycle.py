"""Project creation and structure APIs; existing workspace reads remain compatible."""

from fastapi import APIRouter, Depends

from app.api.auth import CurrentUser, services
from app.domain.models import Area, Project, ProjectState, WorkPackage
from app.domain.project_lifecycle import CreateArea, CreateProject, CreateWorkPackage
from app.policies.actions import require

router = APIRouter(prefix="/api/projects", tags=["project-lifecycle"])


@router.post("", response_model=Project, status_code=201)
def create_project(request: CreateProject, user: CurrentUser, svc=Depends(services)):
    return svc.projects.create(request, user)


@router.get("/{project_id}", response_model=ProjectState)
def open_project(project_id: str, user: CurrentUser, svc=Depends(services)):
    require(user, "read")
    with svc.factory.open() as repo:
        return repo.state(project_id)


@router.post("/{project_id}/areas", response_model=Area, status_code=201)
def create_area(project_id: str, request: CreateArea, user: CurrentUser, svc=Depends(services)):
    return svc.projects.add_area(project_id, request, user)


@router.post("/{project_id}/work-packages", response_model=WorkPackage, status_code=201)
def create_work_package(
    project_id: str, request: CreateWorkPackage, user: CurrentUser, svc=Depends(services)
):
    return svc.projects.add_work_package(project_id, request, user)
