"""An import references immutable source identity; it never rewrites the original."""

from typing import Self

from pydantic import model_validator

from app.domain.models import Model


class SourceReference(Model):
    source_id: str | None = None
    source_revision_id: str | None = None

    @model_validator(mode="after")
    def paired_identity(self) -> Self:
        if bool(self.source_id) != bool(self.source_revision_id):
            raise ValueError("Both source and source revision identities are required")
        return self


class SourceImportLink(Model):
    project_id: str
    source_id: str
    revision_id: str
    run_id: str
