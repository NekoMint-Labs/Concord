"""Donor-independent, revision-bound engineering locations and dependencies."""

from typing import Annotated, Literal

from pydantic import BaseModel, ConfigDict, Field, model_validator


class EngineeringReference(BaseModel):
    model_config = ConfigDict(frozen=True, extra="forbid", allow_inf_nan=False)
    source_revision_id: str = Field(min_length=1)


class DrawingTarget(EngineeringReference):
    kind: Literal["drawing"] = "drawing"
    page: int = Field(ge=1)
    normalized_bbox: tuple[float, float, float, float] | None = None

    @model_validator(mode="after")
    def bounded_region(self):
        if self.normalized_bbox:
            x0, y0, x1, y1 = self.normalized_bbox
            if not (0 <= x0 < x1 <= 1 and 0 <= y0 < y1 <= 1):
                raise ValueError("Drawing region must be ordered normalized coordinates")
        return self


class CadTarget(EngineeringReference):
    kind: Literal["cad"] = "cad"
    entity_id: str | None = None
    layer: str | None = None
    view_bounds: tuple[float, float, float, float] | None = None


class BimTarget(EngineeringReference):
    kind: Literal["bim"] = "bim"
    global_ids: tuple[str, ...] = ()
    viewpoint: tuple[float, float, float, float, float, float] | None = None


class DocumentTarget(EngineeringReference):
    kind: Literal["document"] = "document"
    page: int | None = Field(default=None, ge=1)
    structural_path: tuple[str, ...] = ()
    location: str | None = None


ViewerTarget = Annotated[
    DrawingTarget | CadTarget | BimTarget | DocumentTarget, Field(discriminator="kind")
]


class FindingDependency(BaseModel):
    model_config = ConfigDict(frozen=True, extra="forbid")
    source_id: str = Field(min_length=1)
    source_revision_id: str = Field(min_length=1)
    capability: str = Field(min_length=1, max_length=100)
    expected_condition: str = Field(min_length=1, max_length=2000)
    target: ViewerTarget
    work_package_ids: tuple[str, ...] = ()
    group_id: str | None = Field(default=None, min_length=1, max_length=100)
    input_role: str | None = Field(default=None, min_length=1, max_length=100)
    requirements_kind: Literal["ids"] | None = None

    @model_validator(mode="after")
    def grouped_role(self):
        if self.group_id and self.group_id.startswith("dependency:"):
            raise ValueError("dependency: is reserved for ungrouped runtime inputs")
        if (self.group_id is None) != (self.input_role is None):
            raise ValueError("Grouped dependencies require both group_id and input_role")
        if self.input_role == "requirements":
            raise ValueError("requirements is reserved for the selected IDS artifact")
        return self
