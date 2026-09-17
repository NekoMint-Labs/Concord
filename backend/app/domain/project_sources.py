"""Engineering artifacts, distinct from the run/freshness SourceRevision token."""

from typing import Literal

from pydantic import AwareDatetime, Field

from app.domain.models import Model, new_id, utcnow
from app.domain.project_lifecycle import Name

SourceKind = Literal["BIM", "DOCUMENT", "DRAWING", "SCHEDULE"]


class CreateProjectSource(Model):
    name: Name
    kind: SourceKind


class ProjectSource(Model):
    id: str = Field(default_factory=new_id)
    project_id: str
    name: Name
    kind: SourceKind
    created_at: AwareDatetime = Field(default_factory=utcnow)


class ProjectSourceRevision(Model):
    id: str = Field(default_factory=new_id)
    project_id: str
    source_id: str
    sequence: int = Field(ge=1)
    external_label: str | None = Field(default=None, max_length=180)
    original_filename: str = Field(min_length=1, max_length=180, pattern=r"^[^/\\\x00-\x1f]+$")
    sha256: str = Field(pattern=r"^[0-9a-f]{64}$")
    media_type: str | None = Field(default=None, max_length=180)
    size_bytes: int = Field(gt=0)
    storage_key: str
    # STORED means durable original bytes, not a successful IFC/document parse.
    import_status: Literal["STORED"] = "STORED"
    imported_at: AwareDatetime = Field(default_factory=utcnow)


class RevisionUploadResult(Model):
    revision: ProjectSourceRevision
    duplicate: bool


class ProjectSourceStatus(Model):
    source: ProjectSource
    latest_revision_id: str | None
    accepted_revision_id: str | None
    baseline_id: str | None
    has_pending_revision: bool
