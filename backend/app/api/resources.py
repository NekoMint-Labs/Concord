from fastapi import APIRouter, Depends, File, Query, Request, UploadFile
from fastapi.responses import Response

from app.api.auth import CurrentUser, services
from app.api.capability_jobs import dispatch, read_upload
from app.api.schemas import CapabilityResponse, ProfileResponse
from app.domain.errors import DomainError
from app.domain.runs import AgentRun
from app.policies.actions import require
from app.ports.providers import BIMElement, DocumentChunk, DocumentMetadata

router = APIRouter(prefix="/api", tags=["resources"])


@router.get("/profile", response_model=ProfileResponse)
def profile(user: CurrentUser, svc=Depends(services)):
    require(user, "read")
    return ProfileResponse(
        profile=svc.settings.profile,
        runtime=svc.runtime.name,
        reasoning=svc.settings.reasoning,
        storage=svc.settings.storage,
        database=svc.factory.engine.dialect.name,
        simulation=True,
        authentication=(
            "Single-project trusted deployment with configured bearer "
            "principals; not multi-tenant identity"
        ),
    )


@router.get("/capabilities", response_model=CapabilityResponse)
def health_capabilities(user: CurrentUser, probe: bool = False, svc=Depends(services)):
    from app.adapters.capabilities import capabilities

    require(user, "read")
    return CapabilityResponse(capabilities=capabilities(svc, probe))


@router.get("/projects/{project_id}/bim/elements", response_model=list[BIMElement])
def bim(
    project_id: str,
    user: CurrentUser,
    element_id: str | None = None,
    kind: str | None = None,
    location: str | None = None,
    svc=Depends(services),
):
    require(user, "read")
    with svc.factory.open() as repo:
        repo.state(project_id)
        index = repo.bim_index(project_id)
    if index is not None:
        elements = [BIMElement.model_validate(item) for item in index.elements]
        return [
            e
            for e in elements
            if (not element_id or e.id == element_id)
            and (not kind or e.type == kind)
            and (not location or location in {e.storey, e.space})
        ]
    # The configured fallback is a sample model, not data belonging to a new project.
    if project_id != "harbor-east":
        return []
    return svc.bim.elements(element_id=element_id, kind=kind, location=location)


@router.get("/projects/{project_id}/geo")
def geo(project_id: str, user: CurrentUser, svc=Depends(services)):
    require(user, "read")
    with svc.factory.open() as repo:
        repo.state(project_id)
    # No real-project geospatial ingestion contract exists yet. Never invent site geometry.
    if project_id != "harbor-east":
        return {"type": "FeatureCollection", "features": []}
    return svc.geo.features(project_id)


@router.get("/projects/{project_id}/documents", response_model=list[DocumentMetadata])
def documents(project_id: str, user: CurrentUser, svc=Depends(services)):
    require(user, "read")
    with svc.factory.open() as repo:
        repo.state(project_id)
    return svc.documents.documents(project_id)


@router.post("/projects/{project_id}/documents", response_model=AgentRun, status_code=202)
async def import_document(
    project_id: str, user: CurrentUser, file: UploadFile = File(...), svc=Depends(services)
):
    import asyncio

    require(user, "ingest")
    content = await read_upload(file, svc.settings.upload_limit(file.filename or ""))
    run = await asyncio.to_thread(
        svc.jobs.upload, project_id, file.filename or "unnamed.txt", content, "document_parse", user
    )
    return await asyncio.to_thread(dispatch, svc, run)


@router.get("/documents/{document_id}/chunks", response_model=list[DocumentChunk])
def chunks(document_id: str, user: CurrentUser, svc=Depends(services)):
    require(user, "read")
    return svc.documents.chunks(document_id)


@router.get("/documents/{document_id}/content")
def download_document(document_id: str, user: CurrentUser, svc=Depends(services)):
    require(user, "read")
    filename, content = svc.documents.content(document_id)
    from urllib.parse import quote

    return Response(
        content,
        media_type="application/octet-stream",
        headers={
            "Content-Disposition": f"attachment; filename*=UTF-8''{quote(filename)}",
            "X-Content-Type-Options": "nosniff",
        },
    )


@router.get("/projects/{project_id}/search", response_model=list[DocumentChunk])
def search(
    project_id: str,
    user: CurrentUser,
    q: str = Query(min_length=1, max_length=200),
    svc=Depends(services),
):
    require(user, "read")
    with svc.factory.open() as repo:
        repo.state(project_id)
    return svc.documents.search(project_id, q)


@router.post("/desktop/shutdown")
def desktop_shutdown(request: "Request", user: CurrentUser, svc=Depends(services)):
    from app.domain.errors import PermissionDenied

    require(user, "reset")
    if svc.settings.profile != "desktop":
        raise PermissionDenied("Native shutdown is only available to the desktop host")
    hook = getattr(request.app.state, "shutdown_hook", None)
    if hook is None:
        raise DomainError("Desktop lifecycle controller is not attached")
    hook()
    return {"status": "shutting-down"}
