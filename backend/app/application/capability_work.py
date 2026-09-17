"""Prepare capability results outside the project transaction.

This is an explicit dispatch over project-owned requests, not a job framework.
Only the lifecycle service may publish the returned drafts under its run fence.
"""

import hashlib
from dataclasses import dataclass

from app.domain.errors import CapabilityUnavailable, Conflict, ProviderError
from app.domain.jobs import (
    BIMImport,
    BIMIndex,
    CapabilityJob,
    DocumentImport,
    EmbeddingIndexRequest,
    OptimizationRequest,
    VisionRequest,
)
from app.domain.models import Evidence, ProjectSnapshot, utcnow
from app.domain.retrieval import PreparedEmbeddingIndex
from app.ports.providers import (
    DocumentCatalog,
    IFCImporter,
    PreparedDocument,
    SchedulingOptimizer,
    SemanticRetrieval,
    VisionAnalyzer,
)
from app.ports.services import FileStore


@dataclass(frozen=True)
class PreparedCapabilityWork:
    result: dict[str, object]
    evidence: list[Evidence]
    bim_index: BIMIndex | None
    document: PreparedDocument | None
    embeddings: PreparedEmbeddingIndex | None


def read_verified_source(
    storage: FileStore, request: DocumentImport | BIMImport | VisionRequest
) -> bytes:
    content = storage.read(request.object_key)
    if hashlib.sha256(content).hexdigest() != request.content_hash:
        raise ProviderError("Capability source hash changed; refusing stale/corrupt input")
    return content


def prepare_capability_work(
    job: CapabilityJob,
    snapshot: ProjectSnapshot,
    *,
    storage: FileStore,
    documents: DocumentCatalog,
    ifc: IFCImporter,
    optimizer: SchedulingOptimizer,
    vision: VisionAnalyzer,
    semantic: SemanticRetrieval | None,
) -> PreparedCapabilityWork:
    request = job.request
    evidence = []
    bim_index = None
    prepared_document = None
    prepared_embeddings = None
    if isinstance(request, DocumentImport):
        prepared_document = documents.prepare_file(
            job.project_id,
            request.filename,
            read_verified_source(storage, request),
            request.document_id,
        )
        result = prepared_document.metadata.model_dump(mode="json")
    elif isinstance(request, BIMImport):
        elements = ifc.parse(read_verified_source(storage, request))
        bim_index = BIMIndex(
            source_id=request.source_id,
            source_revision_id=request.source_revision_id,
            project_id=job.project_id,
            revision=request.content_hash,
            object_key=request.object_key,
            filename=request.filename,
            elements=tuple(e.model_dump(mode="json") for e in elements),
        )
        result = {
            "element_count": len(elements),
            "revision": request.content_hash,
            "mapping_note": (
                "Existing synthetic work-package IDs are not automatically "
                "mapped to uploaded IFC GlobalIds."
            ),
        }
        evidence.append(
            Evidence(
                snapshot_id=snapshot.id,
                provider="ifcopenshell",
                source_id=request.source_id or request.object_key,
                source_revision=request.content_hash,
                observed_at=utcnow(),
                work_package_id=None,
                fact=(
                    f"Parsed {len(elements)} bounded IFC elements and "
                    "spatial/property relationships."
                ),
            )
        )
    elif isinstance(request, OptimizationRequest):
        result = optimizer.solve(request.problem).model_dump(mode="json")
        result["snapshot_id"] = snapshot.id
        result["input_binding"] = (
            "Explicit submitted scheduling fixture, not an automatic project schedule write"
        )
    elif isinstance(request, EmbeddingIndexRequest):
        if semantic is None:
            raise CapabilityUnavailable("Semantic retrieval is disabled")
        prepared_embeddings = semantic.prepare_index(
            job.project_id, request.document_id, request.chunk_ids, request.consent
        )
        result = prepared_embeddings.result()
    elif isinstance(request, VisionRequest):
        observation_result = vision.analyze(
            read_verified_source(storage, request),
            request.media_type,
            request.source_id,
            request.consent,
        )
        result = observation_result.model_dump(mode="json")
        for observation in observation_result.observations:
            evidence.append(
                Evidence(
                    snapshot_id=snapshot.id,
                    provider="vision_model",
                    source_id=request.source_id,
                    source_revision=request.content_hash,
                    observed_at=utcnow(),
                    work_package_id=None,
                    fact=observation,
                    quality="inferred",
                )
            )
    else:
        raise Conflict("Unrecognized capability job type")
    return PreparedCapabilityWork(
        result, evidence, bim_index, prepared_document, prepared_embeddings
    )
