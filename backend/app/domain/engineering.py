"""Canonical contracts shared by platform, product and engineering adapters."""

from typing import Literal

from pydantic import AwareDatetime, Field

from app.domain.engineering_refs import FindingDependency, ViewerTarget
from app.domain.models import Evidence, Impact, Model, new_id, utcnow


class Change(Model):
    id: str = Field(default_factory=new_id)
    project_id: str
    source_id: str
    from_revision_id: str | None = None
    to_revision_id: str
    subject: ViewerTarget
    kind: str = Field(min_length=1, max_length=100)
    aspects: tuple[str, ...] = ()
    detector: str = Field(min_length=1, max_length=100)
    detector_version: str | None = None
    raw_artifact_key: str | None = None
    created_at: AwareDatetime = Field(default_factory=utcnow)


class Coordination(Model):
    id: str = Field(default_factory=new_id)
    project_id: str
    finding_id: str
    actor: str
    decision: Literal["CONFIRMED", "DISMISSED", "CLOSED", "EDITED", "REOPENED"]
    note: str = Field(default="", max_length=4000)
    recheck_id: str | None = None
    created_at: AwareDatetime = Field(default_factory=utcnow)


ReCheckOutcome = Literal["RESOLVED", "STILL_OPEN", "CHANGED", "NEEDS_REVIEW"]


class ReCheck(Model):
    id: str = Field(default_factory=new_id)
    project_id: str
    finding_id: str
    source_id: str
    source_revision_id: str
    dependencies: tuple[FindingDependency, ...]
    finding_updated_at: AwareDatetime
    request_id: str = "revision"
    outcome: ReCheckOutcome | None = None
    evidence_ids: tuple[str, ...] = ()
    explanation: str = ""
    created_at: AwareDatetime = Field(default_factory=utcnow)
    completed_at: AwareDatetime | None = None


class EngineeringPublication(Model):
    operation_id: str = Field(min_length=1, max_length=100)
    changes: tuple[Change, ...] = Field(default=(), max_length=1000)
    evidence: tuple[Evidence, ...] = Field(default=(), max_length=1000)


class FindingDraft(Model):
    title: str = Field(min_length=1, max_length=240)
    what_changed: str = Field(min_length=1, max_length=4000)
    why_it_matters: str = Field(min_length=1, max_length=4000)
    evidence_ids: tuple[str, ...] = Field(min_length=1, max_length=1000)
    change_ids: tuple[str, ...] = Field(default=(), max_length=1000)
    dependencies: tuple[FindingDependency, ...] = Field(min_length=1, max_length=100)
    impact: Impact
    suggested_discipline: str | None = None
    suggested_action: str | None = None
    confidence: float = Field(default=1, ge=0, le=1)
    limitations: tuple[str, ...] = ()


class FindingDecision(Model):
    decision: Literal["CONFIRMED", "DISMISSED", "CLOSED", "EDITED", "REOPENED"]
    note: str = Field(default="", max_length=4000)
    recheck_id: str | None = None
    title: str | None = Field(default=None, min_length=1, max_length=240)
    suggested_action: str | None = None


class ReCheckRequest(Model):
    operation_id: str = Field(min_length=1, max_length=100)


class CapabilityCheck(Model):
    project_id: str
    source_id: str
    from_revision_id: str
    to_revision_id: str
    dependency: FindingDependency


class CapabilityCheckResult(Model):
    outcome: ReCheckOutcome
    explanation: str = Field(min_length=1, max_length=4000)
    # Engine drafts: platform assigns snapshot and evidence identities on publication.
    evidence: tuple[Evidence, ...] = Field(default=(), max_length=1000)
