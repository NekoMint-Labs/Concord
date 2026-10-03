from pydantic import BaseModel, ConfigDict, Field

from app.domain.actions import ActionProposal, Approval, AuditRecord
from app.domain.events import ProjectEvent
from app.domain.models import Analysis, ProjectState
from app.domain.runs import AgentRun, Capability


class APIModel(BaseModel):
    model_config = ConfigDict(extra="forbid")


class WorkspaceResponse(APIModel):
    state: ProjectState
    analysis: Analysis | None
    run: AgentRun | None
    analysis_run: AgentRun | None
    proposals: list[ActionProposal]
    approvals: list[Approval]
    events: list[ProjectEvent]
    audit: list[AuditRecord]
    stale: bool


class ApprovalRequest(APIModel):
    strong: bool = False
    confirmation: str = Field(default="", max_length=80)


class RejectionRequest(APIModel):
    reason: str = Field(default="", max_length=500)


class ExecuteResponse(APIModel):
    run_id: str
    operation_id: str
    queued: bool


class ProfileResponse(APIModel):
    profile: str
    runtime: str
    reasoning: str
    storage: str
    database: str
    simulation: bool
    authentication: str


class CapabilityResponse(APIModel):
    capabilities: list[Capability]
