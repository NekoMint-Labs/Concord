"""Logical sources, append-only uploads and project-scoped historical downloads."""

import asyncio
from urllib.parse import quote

from fastapi import APIRouter, Depends, File, Form, Response, UploadFile
from pydantic import ValidationError

from app.api.auth import CurrentUser, services
from app.api.capability_jobs import read_upload
from app.application.project_sources import source_status, source_statuses
from app.domain.errors import DomainError
from app.domain.project_sources import (
    CreateProjectSource,
    ProjectSource,
    ProjectSourceRevision,
    ProjectSourceStatus,
    RevisionUploadResult,
)
from app.domain.runs import AgentRun
from app.policies.actions import require

router = APIRouter(prefix="/api/projects/{project_id}/sources", tags=["project-sources"])


@router.post(
    "/{source_id}/revisions/{revision_id}/import", response_model=AgentRun, status_code=202
)
def import_revision(
    project_id: str, source_id: str, revision_id: str, user: CurrentUser, svc=Depends(services)
):
    return svc.source_imports.enqueue(project_id, source_id, revision_id, user)


@router.get("/{source_id}/revisions/{revision_id}/import", response_model=AgentRun | None)
def import_status(
    project_id: str, source_id: str, revision_id: str, user: CurrentUser, svc=Depends(services)
):
    require(user, "read")
    with svc.factory.open() as repo:
        repo.source_revision(project_id, source_id, revision_id)
        link = repo.source_import(revision_id)
        return repo.run(link.run_id) if link else None


@router.post("", response_model=ProjectSource, status_code=201)
def create_source(
    project_id: str, request: CreateProjectSource, user: CurrentUser, svc=Depends(services)
):
    return svc.sources.create(project_id, request, user)


@router.get("", response_model=list[ProjectSourceStatus])
def sources(project_id: str, user: CurrentUser, svc=Depends(services)):
    require(user, "read")
    with svc.factory.open() as repo:
        repo.state(project_id)
        return source_statuses(repo, project_id)


@router.get("/{source_id}", response_model=ProjectSourceStatus)
def source(project_id: str, source_id: str, user: CurrentUser, svc=Depends(services)):
    require(user, "read")
    with svc.factory.open() as repo:
        return source_status(repo, repo.project_source(project_id, source_id))


@router.get("/{source_id}/revisions", response_model=list[ProjectSourceRevision])
def revisions(project_id: str, source_id: str, user: CurrentUser, svc=Depends(services)):
    require(user, "read")
    with svc.factory.open() as repo:
        repo.project_source(project_id, source_id)
        return repo.source_revisions(project_id, source_id)


@router.get("/{source_id}/revisions/{revision_id}", response_model=ProjectSourceRevision)
def revision(
    project_id: str, source_id: str, revision_id: str, user: CurrentUser, svc=Depends(services)
):
    require(user, "read")
    with svc.factory.open() as repo:
        return repo.source_revision(project_id, source_id, revision_id)


@router.post(
    "/{source_id}/revisions",
    response_model=RevisionUploadResult,
    status_code=201,
    responses={
        200: {"model": RevisionUploadResult, "description": "Identical content already stored"}
    },
)
async def upload_revision(
    project_id: str,
    source_id: str,
    user: CurrentUser,
    response: Response,
    file: UploadFile = File(...),
    external_label: str | None = Form(None, max_length=180),
    svc=Depends(services),
):
    require(user, "ingest")
    content = await read_upload(file, svc.settings.max_upload_bytes)
    try:
        result = await asyncio.to_thread(
            svc.sources.upload,
            project_id,
            source_id,
            file.filename or "",
            content,
            user,
            media_type=file.content_type,
            external_label=external_label,
        )
    except ValidationError as exc:
        raise DomainError("Invalid revision metadata or original filename") from exc
    if result.duplicate:
        response.status_code = 200
    return result


@router.get(
    "/{source_id}/revisions/{revision_id}/content",
    response_class=Response,
    responses={
        200: {
            "description": "Stored original file bytes",
            "content": {
                "application/octet-stream": {"schema": {"type": "string", "format": "binary"}}
            },
        }
    },
)
def revision_content(
    project_id: str, source_id: str, revision_id: str, user: CurrentUser, svc=Depends(services)
):
    item, content = svc.sources.content(project_id, source_id, revision_id, user)
    return Response(
        content,
        media_type="application/octet-stream",
        headers={
            "Content-Disposition": f"attachment; filename*=UTF-8''{quote(item.original_filename)}"
        },
    )
