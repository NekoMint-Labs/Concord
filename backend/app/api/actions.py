"""Approval and execution HTTP dispatch; policy and effects remain in application services."""

from fastapi import APIRouter, Depends

from app.api.auth import CurrentUser, services
from app.api.schemas import ApprovalRequest, ExecuteResponse, RejectionRequest
from app.domain.actions import ActionExecution, Approval, AuditRecord
from app.domain.errors import NotFound, StaleSnapshotError
from app.domain.models import utcnow
from app.policies.actions import require

router = APIRouter()


@router.post("/proposals/{proposal_id}/approve", response_model=Approval)
def approve(proposal_id: str, body: ApprovalRequest, user: CurrentUser, svc=Depends(services)):
    try:
        return svc.actions.approve(proposal_id, user, body.strong, body.confirmation)
    except StaleSnapshotError:
        # Refresh is a durable workflow message, not a model call in the request handler.
        with svc.factory.open() as repo:
            proposal = repo.proposal(proposal_id)
            version = repo.state(proposal.project_id).version
        svc.runtime.signal(
            proposal.run_id, {"kind": "refresh"}, f"stale-approval:{proposal_id}:{version}"
        )
        raise


@router.post("/proposals/{proposal_id}/reject", response_model=AuditRecord)
def reject(
    proposal_id: str,
    user: CurrentUser,
    body: RejectionRequest | None = None,
    svc=Depends(services),
):
    return svc.actions.reject(proposal_id, user, body.reason if body else "")


@router.post("/proposals/{proposal_id}/execute", response_model=ExecuteResponse, status_code=202)
def execute(proposal_id: str, user: CurrentUser, svc=Depends(services)):
    generation = svc.actions.authorize_execution(proposal_id, user)
    with svc.factory.open() as repo:
        proposal = repo.proposal(proposal_id)
        receipt = repo.execution(proposal.operation_id)
    if receipt:
        dispatch = None
        # The receipt is immutable, but run state and recheck progress are not.
        # Decide under the same project lock used by cancel/expire/analysis so a
        # retry cannot resurrect a stopped run or overwrite a completed recheck.
        with svc.factory.open(proposal.project_id, write=True) as repo:
            run = repo.run(proposal.run_id)
            analysis = repo.analysis(run.analysis_id) if run.analysis_id else None
            missing_recheck = analysis is None or analysis.snapshot.version < receipt.after_version
            if missing_recheck and run.status not in {"CANCELLED", "EXPIRED"}:
                if run.status in {"FAILED", "COMPLETED", "QUEUED"}:
                    if run.status != "QUEUED":
                        repo.save_run(
                            run.model_copy(
                                update={
                                    "status": "QUEUED",
                                    "error": None,
                                    "generation": run.generation + 1,
                                    "updated_at": utcnow(),
                                }
                            )
                        )
                    # QUEUED also covers an interrupted commit-to-dispatch gap.
                    dispatch = "resume"
                else:
                    dispatch = "signal"
        if dispatch == "resume":
            svc.runtime.resume(run.id)
        elif dispatch == "signal":
            svc.runtime.signal(
                run.id, {"kind": "refresh"}, f"receipt-recheck:{receipt.operation_id}"
            )
        return ExecuteResponse(
            run_id=proposal.run_id, operation_id=proposal.operation_id, queued=dispatch is not None
        )
    svc.runtime.signal(
        proposal.run_id,
        {
            "kind": "execute",
            "proposal_id": proposal_id,
            "principal": user.model_dump(),
            "generation": generation,
        },
        f"execute:{proposal.operation_id}:{generation}",
    )
    return ExecuteResponse(run_id=proposal.run_id, operation_id=proposal.operation_id, queued=True)


@router.get("/operations/{operation_id}", response_model=ActionExecution)
def execution_receipt(operation_id: str, user: CurrentUser, svc=Depends(services)):
    require(user, "read")
    with svc.factory.open() as repo:
        receipt = repo.execution(operation_id)
    if receipt is None:
        raise NotFound("No verified execution receipt exists for this operation")
    return receipt
