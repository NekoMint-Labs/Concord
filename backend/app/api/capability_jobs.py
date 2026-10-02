"""Heavy capability work is submitted to the existing durable runtime, never a web task."""

import asyncio
import hashlib

from fastapi import APIRouter, Depends, File, Form, UploadFile
from fastapi.responses import Response

from app.api.auth import CurrentUser, services
from app.domain.errors import CapabilityUnavailable, DomainError, NotFound, PermissionDenied
from app.domain.jobs import CapabilityJob, EmbeddingIndexRequest, OptimizationRequest, VisionRequest
from app.domain.models import Evidence, new_id
from app.domain.retrieval import SemanticMatch, SemanticQuery
from app.domain.runs import AgentRun
from app.domain.scheduling import SchedulingProblem
from app.policies.actions import require

router = APIRouter(prefix="/api", tags=["capability-jobs"])


async def read_upload(file: UploadFile, limit: int) -> bytes:
    try:
        content = await file.read(limit + 1)
    finally:
        await file.close()
    if not content or len(content) > limit:
        raise DomainError("Upload must be nonempty and within the configured size limit")
    return content


def dispatch(svc, run: AgentRun) -> AgentRun:
    # The committed job is an outbox record. A dispatch outage can be resumed safely.
    try:
        svc.runtime.start(run.id)
    except DomainError:
        with svc.factory.open() as repo:
            if repo.run(run.id).status != "FAILED":
                raise
    with svc.factory.open() as repo:
        return repo.run(run.id)


@router.get("/jobs/{job_id}", response_model=CapabilityJob)
def job(job_id: str, user: CurrentUser, svc=Depends(services)):
    require(user, "read")
    with svc.factory.open() as repo:
        return repo.job(job_id)


@router.get("/projects/{project_id}/evidence", response_model=list[Evidence])
def evidence(
    project_id: str, user: CurrentUser, source_id: str | None = None, svc=Depends(services)
):
    require(user, "read")
    with svc.factory.open() as repo:
        repo.state(project_id)
        # Evidence belongs to a snapshot; scope through its project in the repository.
        return repo.evidence(project_id, source_id)


@router.post("/projects/{project_id}/bim/import", response_model=AgentRun, status_code=202)
async def import_ifc(
    project_id: str, user: CurrentUser, file: UploadFile = File(...), svc=Depends(services)
):
    require(user, "ingest")
    if not (file.filename or "").lower().endswith(".ifc"):
        raise DomainError("BIM import accepts IFC files only")
    content = await read_upload(file, svc.settings.upload_limit(file.filename or ""))
    run = await asyncio.to_thread(
        svc.jobs.upload, project_id, file.filename, content, "bim_import", user
    )
    return await asyncio.to_thread(dispatch, svc, run)


@router.get("/projects/{project_id}/bim/content")
def bim_content(project_id: str, user: CurrentUser, svc=Depends(services)):
    from urllib.parse import quote

    require(user, "read")
    with svc.factory.open() as repo:
        index = repo.bim_index(project_id)
    if index is None:
        raise NotFound("No imported IFC source exists for this project")
    content = svc.storage.read(index.object_key)
    if hashlib.sha256(content).hexdigest() != index.revision:
        raise DomainError("Stored IFC content failed its hash check")
    return Response(
        content,
        media_type="application/octet-stream",
        headers={"Content-Disposition": f"attachment; filename*=UTF-8''{quote(index.filename)}"},
    )


@router.get("/optimization/fixture", response_model=SchedulingProblem)
def optimization_fixture(user: CurrentUser):
    from app.adapters.scheduling_fixture import coordination_fixture

    require(user, "read")
    return coordination_fixture()


@router.post("/projects/{project_id}/optimization", response_model=AgentRun, status_code=202)
def optimize(project_id: str, problem: SchedulingProblem, user: CurrentUser, svc=Depends(services)):
    run = svc.jobs.enqueue(project_id, OptimizationRequest(problem=problem), user)
    return dispatch(svc, run)


@router.post("/projects/{project_id}/vision", response_model=AgentRun, status_code=202)
async def vision(
    project_id: str,
    user: CurrentUser,
    file: UploadFile = File(...),
    consent: bool = Form(False),
    svc=Depends(services),
):
    require(user, "ingest")
    if not consent:
        raise PermissionDenied("Cloud image analysis requires explicit disclosure consent")
    if not svc.settings.vision_enabled:
        raise CapabilityUnavailable("Vision is disabled")
    media_type = file.content_type or ""
    if media_type not in {"image/png", "image/jpeg", "image/webp"}:
        raise DomainError("Vision accepts PNG/JPEG/WebP only")
    content = await read_upload(file, min(svc.settings.max_upload_bytes, 5 * 1024 * 1024))
    digest = hashlib.sha256(content).hexdigest()
    key = f"vision/{new_id()}/{digest}"
    await asyncio.to_thread(svc.storage.put, key, content)
    try:
        run = await asyncio.to_thread(
            svc.jobs.enqueue,
            project_id,
            VisionRequest(
                object_key=key,
                content_hash=digest,
                media_type=media_type,
                source_id=key,
                consent=True,
            ),
            user,
        )
    except Exception:
        await asyncio.to_thread(svc.storage.delete, key)
        raise
    return await asyncio.to_thread(dispatch, svc, run)


@router.post("/projects/{project_id}/semantic/index", response_model=AgentRun, status_code=202)
def index_document(
    project_id: str, request: EmbeddingIndexRequest, user: CurrentUser, svc=Depends(services)
):
    run = svc.jobs.enqueue(project_id, request, user)
    return dispatch(svc, run)


@router.post("/projects/{project_id}/semantic/search", response_model=list[SemanticMatch])
def semantic_search(
    project_id: str, query: SemanticQuery, user: CurrentUser, svc=Depends(services)
):
    require(user, "read")
    with svc.factory.open() as repo:
        repo.state(project_id)
    if svc.jobs.semantic is None:
        raise CapabilityUnavailable(
            "Semantic retrieval is disabled; structured/local text search remains available"
        )
    return svc.jobs.semantic.search(project_id, query)
