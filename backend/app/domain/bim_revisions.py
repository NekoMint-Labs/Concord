"""Revision-aware BIM facts owned by Concord, independent of IFC SDK types."""

from typing import Literal

from pydantic import AwareDatetime, Field

from app.domain.models import Model, new_id, utcnow


class BimElementSnapshot(Model):
    revision_id: str
    global_id: str = Field(min_length=1, max_length=100)
    ifc_class: str = Field(min_length=1, max_length=100)
    name: str | None = Field(default=None, max_length=500)
    storey: str | None = Field(default=None, max_length=500)
    space: str | None = Field(default=None, max_length=500)
    properties: dict = Field(default_factory=dict)


class BimRevisionSnapshot(Model):
    project_id: str
    source_id: str
    revision_id: str
    ifc_schema: str | None = None
    imported_at: AwareDatetime = Field(default_factory=utcnow)
    import_seconds: float = Field(default=0, ge=0)
    elements: tuple[BimElementSnapshot, ...]


class BindingInput(Model):
    work_package_id: str
    global_ids: tuple[str, ...] = Field(min_length=1, max_length=1000)


class ConfirmBimBindings(Model):
    revision_id: str
    bindings: tuple[BindingInput, ...] = Field(min_length=1, max_length=1000)


class WorkPackageBimBinding(Model):
    id: str = Field(default_factory=new_id)
    project_id: str
    work_package_id: str
    source_id: str
    global_id: str
    confirmation_revision_id: str
    evidence_id: str
    origin: Literal["human_confirmed"] = "human_confirmed"
    confirmed_by: str
    created_at: AwareDatetime = Field(default_factory=utcnow)
    retired_at: AwareDatetime | None = None


class BimBindingStatus(Model):
    binding: WorkPackageBimBinding
    revision_id: str | None
    element: BimElementSnapshot | None
    state: Literal["present", "missing", "not_imported"]


class BimElementChange(Model):
    comparison_id: str
    global_id: str
    change_kind: Literal["added", "deleted", "changed"]
    changed_aspects: tuple[str, ...] = ()


class ComparisonSummary(Model):
    added: int = Field(ge=0)
    deleted: int = Field(ge=0)
    changed: int = Field(ge=0)
    from_elements: int = Field(ge=0)
    to_elements: int = Field(ge=0)
    common_global_ids: int = Field(ge=0)
    global_id_continuity: float = Field(ge=0, le=1)
    warnings: tuple[str, ...] = ()
    compare_seconds: float = Field(default=0, ge=0)


class RevisionComparison(Model):
    id: str = Field(default_factory=new_id)
    project_id: str
    source_id: str
    from_revision_id: str
    to_revision_id: str
    engine: str
    engine_version: str
    status: Literal["COMPLETED"] = "COMPLETED"
    summary: ComparisonSummary
    raw_result_key: str
    evidence_ids: tuple[str, ...] = ()
    created_at: AwareDatetime = Field(default_factory=utcnow)


class CompareBimRevisions(Model):
    from_revision_id: str
    to_revision_id: str


class AffectedWorkPackage(Model):
    work_package_id: str
    changes: tuple[BimElementChange, ...]


class RevisionComparisonDetail(Model):
    comparison: RevisionComparison
    changes: tuple[BimElementChange, ...]
    affected_work_packages: tuple[AffectedWorkPackage, ...]
