"""Project-owned immutable contracts; persistence and SDK types never enter this module."""

from datetime import UTC, datetime
from typing import Literal
from uuid import uuid4

from pydantic import AwareDatetime, BaseModel, ConfigDict, Field

from app.domain.engineering_refs import FindingDependency, ViewerTarget


def utcnow() -> datetime:
    return datetime.now(UTC)


def new_id() -> str:
    return str(uuid4())


class Model(BaseModel):
    model_config = ConfigDict(
        frozen=True, extra="forbid", json_schema_serialization_defaults_required=True
    )


class SourceRevision(Model):
    source: str
    revision: str
    observed_at: AwareDatetime = Field(default_factory=utcnow)


class Project(Model):
    id: str
    name: str
    description: str = ""
    timezone: str = "UTC"


class Area(Model):
    id: str
    name: str
    floor: str


class WorkPackage(Model):
    id: str
    name: str
    area_id: str
    discipline: str
    element_ids: tuple[str, ...] = ()
    predecessors: tuple[str, ...] = ()
    complete: bool = False
    design_revision: str = "V16"
    accepted_revision: str = "V16"
    required_workers: int = Field(default=2, ge=0, le=10000)
    available_workers: int = Field(default=2, ge=0, le=10000)
    required_qualifications: tuple[str, ...] = ()
    qualifications: tuple[str, ...] = ()
    materials: dict[str, bool] = Field(default_factory=dict)
    equipment: dict[str, bool] = Field(default_factory=dict)
    inspection_passed: bool = True
    owner: str = "Coordination team"


class ProjectState(Model):
    project: Project
    version: int = Field(default=1, ge=1)
    areas: tuple[Area, ...]
    work_packages: tuple[WorkPackage, ...]
    sources: tuple[SourceRevision, ...]

    def package(self, package_id: str) -> WorkPackage:
        from app.domain.errors import NotFound

        for package in self.work_packages:
            if package.id == package_id:
                return package
        raise NotFound(f"Work package {package_id} not found")

    def source(self, name: str) -> SourceRevision:
        return next(source for source in self.sources if source.source == name)


class ProjectSnapshot(Model):
    id: str = Field(default_factory=new_id)
    project_id: str
    version: int
    sources: tuple[SourceRevision, ...]
    captured_at: AwareDatetime = Field(default_factory=utcnow)


class Evidence(Model):
    id: str = Field(default_factory=new_id)
    snapshot_id: str
    provider: str
    source_id: str
    source_revision: str
    observed_at: AwareDatetime
    work_package_id: str | None = None
    element_ids: tuple[str, ...] = ()
    page: int | None = None
    location: str | None = None
    fact: str
    quality: Literal["structured", "extracted", "inferred"] = "structured"
    source_revision_id: str | None = None
    viewer_target: ViewerTarget | None = None


class Impact(Model):
    work_package_ids: tuple[str, ...]
    area_ids: tuple[str, ...]
    element_ids: tuple[str, ...]
    disciplines: tuple[str, ...]


class Finding(Model):
    id: str = Field(default_factory=new_id)
    snapshot_id: str
    work_package_id: str
    conclusion: str
    evidence_ids: tuple[str, ...]
    reasoning_summary: str
    confidence: float = Field(default=1, ge=0, le=1)
    limitations: tuple[str, ...] = ()
    created_at: AwareDatetime = Field(default_factory=utcnow)
    project_id: str | None = None
    impact: Impact | None = None
    title: str = ""
    what_changed: str = ""
    why_it_matters: str = ""
    change_ids: tuple[str, ...] = ()
    dependencies: tuple[FindingDependency, ...] = ()
    suggested_discipline: str | None = None
    suggested_action: str | None = None
    state: Literal["PROPOSED", "CONFIRMED", "DISMISSED", "CLOSED"] = "PROPOSED"
    updated_at: AwareDatetime = Field(default_factory=utcnow)


ConstraintKind = Literal[
    "design", "predecessor", "workforce", "qualification", "material", "equipment", "inspection"
]


class Constraint(Model):
    id: str = Field(default_factory=new_id)
    snapshot_id: str
    work_package_id: str
    kind: ConstraintKind
    description: str
    evidence_ids: tuple[str, ...]
    resource_id: str | None = None
    blocking: bool = True


class Readiness(Model):
    work_package_id: str
    status: Literal["READY", "BLOCKED"]
    constraint_ids: tuple[str, ...]
    snapshot_id: str


class Analysis(Model):
    id: str = Field(default_factory=new_id)
    run_id: str
    snapshot: ProjectSnapshot
    impact: Impact
    evidence: tuple[Evidence, ...]
    findings: tuple[Finding, ...]
    constraints: tuple[Constraint, ...]
    readiness: tuple[Readiness, ...]
    reasoning_summary: str
    reasoning_mode: str
    created_at: AwareDatetime = Field(default_factory=utcnow)
