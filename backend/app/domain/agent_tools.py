"""Narrow read-tool contracts; no SDK objects, storage keys or mutation commands."""

from pydantic import Field

from app.domain.models import Evidence, Model
from app.domain.project_sources import ProjectSourceStatus


class RevisionQuery(Model):
    source_id: str
    from_revision_id: str | None = None
    to_revision_id: str


class WorkPackageQuery(Model):
    work_package_ids: tuple[str, ...] = Field(default=(), max_length=200)


class SearchQuery(Model):
    query: str = Field(min_length=1, max_length=200)


class WorkPackageFact(Model):
    id: str
    area_id: str
    discipline: str
    blocker_count: int


class ElementChange(Model):
    global_id: str
    kind: str
    aspects: tuple[str, ...] = ()


class BindingFact(Model):
    work_package_id: str
    source_id: str
    global_id: str


class ReadResult(Model):
    available: bool = True
    evidence: tuple[Evidence, ...] = ()
    work_packages: tuple[WorkPackageFact, ...] = ()
    sources: tuple[ProjectSourceStatus, ...] = ()
    changes: tuple[ElementChange, ...] = ()
    bindings: tuple[BindingFact, ...] = ()
    limitations: tuple[str, ...] = ()
