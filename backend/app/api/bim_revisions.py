"""Revision-aware BIM import, human binding and comparison APIs."""

import asyncio

from fastapi import APIRouter, Depends

from app.api.auth import CurrentUser, services
from app.domain.bim_revisions import (
    BimBindingStatus,
    BimRevisionSnapshot,
    CompareBimRevisions,
    ConfirmBimBindings,
    RevisionComparison,
    RevisionComparisonDetail,
    WorkPackageBimBinding,
)
from app.policies.actions import require

router = APIRouter(prefix="/api/projects/{project_id}/sources/{source_id}", tags=["bim-revisions"])


@router.get("/revisions/{revision_id}/bim-snapshot", response_model=BimRevisionSnapshot)
def revision_snapshot(
    project_id: str,
    source_id: str,
    revision_id: str,
    user: CurrentUser,
    svc=Depends(services),
):
    from app.domain.errors import NotFound

    require(user, "read")
    with svc.factory.open() as repo:
        snapshot = repo.bim_revision_snapshot(project_id, source_id, revision_id)
    if snapshot is None:
        raise NotFound("This source revision has not been imported as BIM")
    return snapshot


@router.post("/bim-bindings", response_model=list[WorkPackageBimBinding], status_code=201)
def confirm_bindings(
    project_id: str,
    source_id: str,
    request: ConfirmBimBindings,
    user: CurrentUser,
    svc=Depends(services),
):
    return svc.bim_bindings.confirm(project_id, source_id, request, user)


@router.get("/bim-bindings", response_model=list[BimBindingStatus])
def binding_statuses(
    project_id: str,
    source_id: str,
    user: CurrentUser,
    revision_id: str | None = None,
    svc=Depends(services),
):
    require(user, "read")
    return svc.bim_bindings.statuses(project_id, source_id, revision_id)


@router.post("/bim-comparisons", response_model=RevisionComparisonDetail, status_code=201)
async def compare_revisions(
    project_id: str,
    source_id: str,
    request: CompareBimRevisions,
    user: CurrentUser,
    svc=Depends(services),
):
    return await asyncio.to_thread(
        svc.bim_revisions.compare,
        project_id,
        source_id,
        request.from_revision_id,
        request.to_revision_id,
        user,
    )


@router.get("/bim-comparisons", response_model=list[RevisionComparison])
def comparisons(project_id: str, source_id: str, user: CurrentUser, svc=Depends(services)):
    require(user, "read")
    with svc.factory.open() as repo:
        repo.project_source(project_id, source_id)
        return repo.revision_comparisons(project_id, source_id)


@router.get("/bim-comparisons/{comparison_id}", response_model=RevisionComparisonDetail)
def comparison_detail(
    project_id: str,
    source_id: str,
    comparison_id: str,
    user: CurrentUser,
    svc=Depends(services),
):
    require(user, "read")
    return svc.bim_revisions.detail(project_id, source_id, comparison_id)
