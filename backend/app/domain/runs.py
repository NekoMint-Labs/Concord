from typing import Literal

from pydantic import AwareDatetime, Field

from app.domain.models import Model, new_id, utcnow

RunStatus = Literal[
    "QUEUED", "RUNNING", "WAITING_APPROVAL", "COMPLETED", "FAILED", "CANCELLED", "EXPIRED"
]
TERMINAL_STATUSES = {"COMPLETED", "FAILED", "CANCELLED", "EXPIRED"}


class AgentRun(Model):
    id: str = Field(default_factory=new_id)
    project_id: str
    event_id: str | None = None
    status: RunStatus = "QUEUED"
    runtime: str = "dbos"
    # Optional JSON payload field: old checkpoints retain their original run ID.
    runtime_execution_id: str | None = None
    # Fences work that was already in flight when a stopped run is resumed.
    generation: int = Field(default=0, ge=0)
    runtime_generation: int = Field(default=0, ge=0)
    category: Literal[
        "coordination",
        "investigation",
        "document_parse",
        "bim_import",
        "optimization",
        "vision",
        "embedding_index",
    ] = "coordination"
    analysis_id: str | None = None
    error: str | None = None
    created_at: AwareDatetime = Field(default_factory=utcnow)
    updated_at: AwareDatetime = Field(default_factory=utcnow)


class StreamEvent(Model):
    sequence: int
    run_id: str
    payload: dict


class ReasoningProposal(Model):
    summary: str = Field(max_length=4000)
    evidence_ids: tuple[str, ...]
    limitations: tuple[str, ...] = ()
    mode: str = "offline"


class Capability(Model):
    name: str
    implementation: str
    status: Literal[
        "enabled",
        "available_disabled",
        "unavailable_dependency",
        "unavailable_credential",
        "unhealthy",
    ]
    enabled: bool
    dependency_available: bool
    credential_present: bool | None = None
    service_reachable: bool | None = None
    reason: str
    version: str | None = None
