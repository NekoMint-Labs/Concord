"""Project-owned interaction controls, scopes and durable investigation records."""

from typing import Literal, Self

from pydantic import AwareDatetime, Field, model_validator

from app.domain.models import Evidence, Model, utcnow

Initiative = Literal["manual", "suggest", "auto-investigate"]


class AgentSettings(Model):
    initiative: Initiative = "suggest"


class AgentScope(Model):
    source_id: str | None = Field(default=None, max_length=100)
    from_revision_id: str | None = Field(default=None, max_length=100)
    to_revision_id: str | None = Field(default=None, max_length=100)
    work_package_ids: tuple[str, ...] = Field(default=(), max_length=200)
    area_ids: tuple[str, ...] = Field(default=(), max_length=200)
    element_ids: tuple[str, ...] = Field(default=(), max_length=200)

    @model_validator(mode="after")
    def revision_pair(self) -> Self:
        if (self.from_revision_id or self.to_revision_id) and not self.source_id:
            raise ValueError("Revision scope requires its project source")
        if self.from_revision_id and not self.to_revision_id:
            raise ValueError("Comparison requires a target revision")
        return self


class AgentRequest(Model):
    instruction: str = Field(min_length=1, max_length=2000)
    scope: AgentScope = Field(default_factory=AgentScope)


class InvestigationRequest(Model):
    run_id: str
    project_id: str
    requested_by: str
    request: AgentRequest
    automatic: bool = False


class AgentAnswer(Model):
    summary: str = Field(min_length=1, max_length=4000)
    evidence_ids: tuple[str, ...] = Field(default=(), max_length=100)
    limitations: tuple[str, ...] = Field(default=(), max_length=30)


class ToolTrace(Model):
    tool: str
    evidence_ids: tuple[str, ...]
    available: bool


class AgentResponse(Model):
    answer: AgentAnswer
    scope: AgentScope
    evidence: tuple[Evidence, ...]
    tools: tuple[ToolTrace, ...]
    # Ask references a read snapshot without inserting any database records.
    persisted: bool = False


class InvestigationReport(AgentResponse):
    run_id: str
    analysis_id: str
    generation: int
    persisted: bool = True


class AgentNotice(Model):
    id: str  # One notice per immutable revision; retries cannot duplicate it.
    project_id: str
    source_id: str
    revision_id: str
    from_revision_id: str | None = None
    run_id: str | None = None
    created_at: AwareDatetime = Field(default_factory=utcnow)
