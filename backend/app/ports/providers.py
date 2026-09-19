from typing import Protocol

from pydantic import AwareDatetime, Field

from app.domain.models import Model, ProjectState, WorkPackage
from app.domain.retrieval import (
    EmbeddingDescriptor,
    PreparedEmbeddingIndex,
    SemanticMatch,
    SemanticQuery,
)
from app.domain.scheduling import ScheduleResult, SchedulingProblem


class BIMElement(Model):
    id: str
    name: str
    type: str
    storey: str | None = None
    space: str | None = None
    properties: dict = Field(default_factory=dict)
    related_ids: tuple[str, ...] = ()
    revision: str
    ifc_schema: str | None = None


class DocumentChunk(Model):
    id: str
    text: str
    page: int | None = None
    location: str | None = None
    source_hash: str
    parser: str


class BIMProvider(Protocol):
    def elements(
        self, *, element_id: str | None = None, kind: str | None = None, location: str | None = None
    ) -> list[BIMElement]: ...


class ScheduleReader(Protocol):
    def dependencies(
        self, state: ProjectState, work_package_id: str
    ) -> tuple[WorkPackage, ...]: ...


class ScheduleWriter(Protocol):
    def confirm_complete(self, state: ProjectState, work_package_id: str) -> ProjectState: ...


class WorkforceReader(Protocol):
    def availability(self, state: ProjectState, work_package_id: str) -> dict: ...


class MaterialReader(Protocol):
    def materials(self, state: ProjectState, work_package_id: str) -> dict[str, bool]: ...


class EquipmentReader(Protocol):
    def equipment(self, state: ProjectState, work_package_id: str) -> dict[str, bool]: ...


class InspectionReader(Protocol):
    def accepted(self, state: ProjectState, work_package_id: str) -> bool: ...


class DocumentParser(Protocol):
    def parse(self, content: bytes, filename: str) -> list[DocumentChunk]: ...


class GeoProvider(Protocol):
    def features(self, project_id: str) -> dict: ...


class SearchProvider(Protocol):
    def search(
        self,
        project_id: str,
        query: str,
        limit: int = 20,
        *,
        source_hashes: tuple[str, ...] | None = None,
    ) -> list[DocumentChunk]: ...


class VisionResult(Model):
    observations: tuple[str, ...]
    evidence_source_id: str
    limitations: tuple[str, ...]
    mode: str


class VisionAnalyzer(Protocol):
    def analyze(
        self, content: bytes, media_type: str, source_id: str, consent: bool
    ) -> VisionResult: ...


class SchedulingOptimizer(Protocol):
    def solve(
        self, problem: "SchedulingProblem", timeout_seconds: float = 8
    ) -> "ScheduleResult": ...


class DocumentCatalog(Protocol):
    def prepare_file(
        self, project_id: str, filename: str, content: bytes, document_id: str | None = None
    ) -> "PreparedDocument": ...
    def import_file(
        self, project_id: str, filename: str, content: bytes, document_id: str | None = None
    ) -> dict: ...
    def chunks(self, document_id: str) -> list[DocumentChunk]: ...


class IFCImporter(Protocol):
    def parse(self, content: bytes) -> list[BIMElement]: ...


class DocumentMetadata(Model):
    id: str
    project_id: str
    filename: str
    content_hash: str
    parser: str
    created_at: AwareDatetime


class PreparedDocument(Model):
    """Parsed source staged outside a write transaction; not yet published facts."""

    metadata: DocumentMetadata
    object_key: str
    chunks: tuple[DocumentChunk, ...]


class EmbeddingProvider(Protocol):
    @property
    def descriptor(self) -> "EmbeddingDescriptor": ...
    def embed(self, texts: list[str], consent: bool = False) -> list[tuple[float, ...]]: ...


class SemanticRetrieval(Protocol):
    def prepare_index(
        self, project_id: str, document_id: str, chunk_ids: tuple[str, ...], consent: bool
    ) -> "PreparedEmbeddingIndex": ...
    def index_document(
        self, project_id: str, document_id: str, chunk_ids: tuple[str, ...], consent: bool
    ) -> dict: ...
    def search(self, project_id: str, query: "SemanticQuery") -> list["SemanticMatch"]: ...
    def health(self) -> tuple[bool, str]: ...
