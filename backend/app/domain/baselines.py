"""Immutable, explicitly accepted engineering revision sets; never run snapshots."""

from typing import Self

from pydantic import AwareDatetime, Field, model_validator

from app.domain.models import Model, new_id, utcnow
from app.domain.project_lifecycle import Name


class BaselineEntry(Model):
    source_id: str = Field(min_length=1, max_length=100)
    revision_id: str = Field(min_length=1, max_length=100)


class CreateBaseline(Model):
    name: Name
    entries: tuple[BaselineEntry, ...] = Field(min_length=1, max_length=1000)

    @model_validator(mode="after")
    def unique_sources(self) -> Self:
        if len({entry.source_id for entry in self.entries}) != len(self.entries):
            raise ValueError("A baseline can accept only one revision of each source")
        return self


class Baseline(CreateBaseline):
    id: str = Field(default_factory=new_id)
    project_id: str
    sequence: int = Field(ge=1)
    accepted_by: str
    created_at: AwareDatetime = Field(default_factory=utcnow)
