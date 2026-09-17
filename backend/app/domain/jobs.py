from typing import Annotated, Literal

from pydantic import Field

from app.domain.models import Model, new_id
from app.domain.scheduling import SchedulingProblem
from app.domain.source_imports import SourceReference


class DocumentImport(SourceReference):
    kind: Literal["document_parse"] = "document_parse"
    filename: str
    object_key: str
    content_hash: str
    document_id: str = Field(default_factory=new_id)


class BIMImport(SourceReference):
    kind: Literal["bim_import"] = "bim_import"
    filename: str
    object_key: str
    content_hash: str
    # Active model observed when accepting the import, not when parsing finishes.
    base_revision: str | None = None
    base_revision_bound: bool = False  # Legacy queued checkpoints bind once on first execution.


class OptimizationRequest(Model):
    kind: Literal["optimization"] = "optimization"
    problem: SchedulingProblem


class VisionRequest(Model):
    kind: Literal["vision"] = "vision"
    object_key: str
    content_hash: str
    media_type: str
    source_id: str
    consent: bool = False


class EmbeddingIndexRequest(Model):
    kind: Literal["embedding_index"] = "embedding_index"
    document_id: str
    chunk_ids: tuple[str, ...] = Field(default=(), max_length=128)
    consent: bool = False


JobInput = Annotated[
    DocumentImport | BIMImport | OptimizationRequest | VisionRequest | EmbeddingIndexRequest,
    Field(discriminator="kind"),
]


class CapabilityJob(Model):
    id: str
    project_id: str
    requested_by: str
    request: JobInput
    snapshot_id: str | None = None
    result: dict | None = None


class BIMIndex(SourceReference):
    project_id: str
    revision: str
    object_key: str
    filename: str
    elements: tuple[dict, ...]
