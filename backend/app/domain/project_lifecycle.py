"""Commands for creating user-owned project structure without demo facts."""

from typing import Annotated
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from pydantic import Field, StringConstraints, field_validator

from app.domain.models import Model

Name = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=180)]


class CreateProject(Model):
    name: Name
    description: str = Field(default="", max_length=2000)
    timezone: str = "UTC"

    @field_validator("timezone")
    @classmethod
    def valid_timezone(cls, value: str) -> str:
        try:
            ZoneInfo(value)
        except (ZoneInfoNotFoundError, ValueError) as exc:
            raise ValueError("Use an IANA timezone, for example Asia/Shanghai") from exc
        return value


class CreateArea(Model):
    name: Name
    floor: str = Field(default="", max_length=180)


class CreateWorkPackage(Model):
    name: Name
    area_id: str = Field(min_length=1, max_length=100)
    discipline: Name
    owner: str = Field(default="", max_length=180)
