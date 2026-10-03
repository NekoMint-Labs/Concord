"""Internal engineering adapter results for pre-integration qualification.

These are adapter-local staging records, not a competing domain or publication
contract. Map them to the A-owned contract when its foundation is merged.
"""

from datetime import datetime
from typing import Literal
from uuid import UUID

from pydantic import Field

from app.domain.models import Model

EngineeringKind = Literal["added", "deleted", "changed", "clash", "ids_violation"]


class EngineeringChange(Model):
    source_id: str
    source_revision_id: str
    from_revision_id: str | None = None
    to_revision_id: str | None = None
    subject_type: Literal["pdf", "cad", "bim", "document"]
    subject_id: str
    kind: EngineeringKind
    aspects: tuple[str, ...] = ()
    location: tuple[float, ...] = ()
    engine: str
    engine_version: str
    quality: Literal["structured", "extracted", "inferred"] = "structured"


class EngineeringEvidence(Model):
    source_id: str
    source_revision_id: str
    against_source_id: str | None = None
    against_source_revision_id: str | None = None
    provider: str
    engine_version: str
    element_ids: tuple[str, ...] = ()
    location: tuple[float, ...] = ()
    page: int | None = None
    structural_path: tuple[str, ...] = ()
    fact: str
    quality: Literal["structured", "extracted", "inferred"] = "structured"


class ClashRunResult(Model):
    source_id: str
    source_revision_id: str
    comparison_revision_id: str
    comparison_source_id: str
    engine: str
    engine_version: str
    mode: Literal["intersection", "collision", "clearance"]
    elapsed_seconds: float = Field(ge=0)
    changes: tuple[EngineeringChange, ...] = ()
    evidence: tuple[EngineeringEvidence, ...] = ()


class IDSViolation(Model):
    specification: str
    global_id: str | None = None
    reason: str
    source_id: str
    source_revision_id: str
    engine: str
    engine_version: str


class IDSValidationResult(Model):
    source_id: str
    source_revision_id: str
    engine: str
    engine_version: str
    specifications: int
    passed_specifications: int
    failed_specifications: int
    skipped_specifications: int = 0
    violations: tuple[IDSViolation, ...] = ()


class BCFComment(Model):
    guid: UUID
    author: str = Field(min_length=1)
    date: datetime
    text: str
    viewpoint_guid: UUID | None = None
    modified_author: str | None = None
    modified_date: datetime | None = None


class BCFClippingPlane(Model):
    location: tuple[float, float, float]
    direction: tuple[float, float, float]


class BCFViewpoint(Model):
    source_id: str
    source_revision_id: str
    title: str
    topic_guid: UUID | None = None
    viewpoint_guid: UUID | None = None
    comments: tuple[BCFComment, ...] = ()
    selected_global_ids: tuple[str, ...] = ()
    clipping_planes: tuple[BCFClippingPlane, ...] = ()
    position: tuple[float, float, float] | None = None
    direction: tuple[float, float, float] | None = None
    up: tuple[float, float, float] | None = None
    snapshot_png: bytes | None = None
    camera_kind: Literal["perspective", "orthogonal"] = "perspective"
    field_of_view: float = Field(default=60.0, gt=0, lt=180)
    view_to_world_scale: float = Field(default=1.0, gt=0, allow_inf_nan=False)
    description: str | None = None
    topic_type: str = "Engineering"
    topic_status: str = "Open"
