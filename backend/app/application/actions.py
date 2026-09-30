from app.application.analysis import AnalysisService
from app.application.streaming import custom, emit
from app.domain.actions import ActionExecution, ActionProposal, Approval, AuditRecord, Principal
from app.domain.errors import Conflict, DomainError, PermissionDenied, StaleSnapshotError
from app.domain.runs import TERMINAL_STATUSES
from app.policies.actions import (
    check_approval,
    check_business_rules,
    check_fresh,
    check_proposal_generation,
    require,
)
from app.ports.coordination import RepositoryFactory
from app.ports.services import ActionExecutor


class ActionService:
    def __init__(
        self, factory: RepositoryFactory, analysis: AnalysisService, executor: ActionExecutor
    ) -> None:
        self.factory, self.analysis, self.executor = factory, analysis, executor

    def approve(
        self, proposal_id: str, principal: Principal, strong: bool = False, confirmation: str = ""
    ) -> Approval:
        require(principal, "approve")
        with self.factory.open() as repo:
            proposal = repo.proposal(proposal_id)
        with self.factory.open(proposal.project_id, write=True) as repo:
            proposal = repo.proposal(proposal_id)
            self._check_not_rejected(repo, proposal)
            check_business_rules(proposal)
            run = repo.run(proposal.run_id)
            check_proposal_generation(proposal, run)
            check_fresh(repo.snapshot(proposal.snapshot_id), repo.state(proposal.project_id))
            if run.status in TERMINAL_STATUSES:
                raise Conflict("Run is no longer awaiting approval")
            if proposal.risk >= 4 and (
                not strong
                or principal.role not in {"admin", "safety_approver"}
                or confirmation != "APPROVE R4"
            ):
                raise PermissionDenied(
                    "R4 requires a safety approver and the exact confirmation APPROVE R4"
                )
            # Retries and double-clicks must not create new approval/audit identities.
            # The project write transaction serializes concurrent requests.
            level = "strong" if strong else "standard"
            for previous in repo.approvals(proposal.id):
                if (
                    previous.principal_id == principal.id
                    and previous.principal_role == principal.role
                    and previous.level == level
                    and previous.confirmation == confirmation
                ):
                    return previous
            approval = Approval(
                proposal_id=proposal.id,
                principal_id=principal.id,
                principal_role=principal.role,
                level="strong" if strong else "standard",
                confirmation=confirmation,
            )
            repo.save_approval(approval)
            repo.audit(
                AuditRecord(
                    project_id=proposal.project_id,
                    action="ACTION_APPROVED",
                    actor=principal.id,
                    run_id=proposal.run_id,
                    snapshot_id=proposal.snapshot_id,
                    operation_id=proposal.operation_id,
                    detail={"level": approval.level},
                )
            )
            custom(
                repo,
                proposal.run_id,
                "action-approved",
                {"proposal_id": proposal_id, "level": approval.level},
            )
            return approval

    def reject(self, proposal_id: str, principal: Principal, reason: str = "") -> AuditRecord:
        require(principal, "approve")
        with self.factory.open() as repo:
            proposal = repo.proposal(proposal_id)
        with self.factory.open(proposal.project_id, write=True) as repo:
            proposal = repo.proposal(proposal_id)
            run = repo.run(proposal.run_id)
            check_proposal_generation(proposal, run)
            if run.status in TERMINAL_STATUSES:
                raise Conflict("Run is no longer awaiting approval")
            check_fresh(repo.snapshot(proposal.snapshot_id), repo.state(proposal.project_id))
            if repo.execution(proposal.operation_id):
                raise Conflict("Executed proposals cannot be rejected")
            previous = self._proposal_rejection(repo, proposal)
            if previous is not None:
                return previous
            record = AuditRecord(
                project_id=proposal.project_id,
                action="ACTION_PROPOSAL_REJECTED",
                actor=principal.id,
                run_id=proposal.run_id,
                snapshot_id=proposal.snapshot_id,
                operation_id=proposal.operation_id,
                detail={
                    "proposal_id": proposal.id,
                    "work_package_id": proposal.work_package_id,
                    "generation": proposal.generation,
                    "reason": reason,
                },
            )
            repo.audit(record)
            custom(
                repo,
                proposal.run_id,
                "action-rejected",
                {"proposal_id": proposal.id, "work_package_id": proposal.work_package_id},
            )
            return record

    def authorize_execution(self, proposal_id: str, principal: Principal) -> int:
        require(principal, "execute")
        with self.factory.open() as repo:
            proposal = repo.proposal(proposal_id)
            self._check_not_rejected(repo, proposal)
            check_business_rules(proposal)
            # Bind this authorization to the generation observed here, never to
            # a later post-authorization read in the HTTP dispatch path.
            run = repo.run(proposal.run_id)
            if repo.execution(proposal.operation_id):
                return run.generation
            check_proposal_generation(proposal, run)
            if run.status in TERMINAL_STATUSES:
                raise Conflict("Cannot execute actions from a terminal run")
            check_approval(proposal, repo.approvals(proposal_id))
            return run.generation

    def execute(
        self, proposal_id: str, principal: Principal, *, generation: int | None = None
    ) -> ActionExecution:
        require(principal, "execute")
        with self.factory.open() as repo:
            proposal = repo.proposal(proposal_id)
        try:
            receipt = self._execute_locked(
                proposal_id, proposal.project_id, principal, generation=generation
            )
            # A crash can happen after the receipt commits but before the fresh re-check.
            # Replaying that operation must recover the re-check, not repeat the effect.
            with self.factory.open() as repo:
                run = repo.run(proposal.run_id)
                previous = repo.analysis(run.analysis_id) if run.analysis_id else None
            same_generation = generation is None or run.generation == generation
            if (
                same_generation
                and run.status not in {"CANCELLED", "EXPIRED"}
                and (previous is None or previous.snapshot.version < receipt.after_version)
            ):
                self.analysis.analyze(proposal.run_id, generation=generation)
            return receipt
        except DomainError as exc:
            with self.factory.open(proposal.project_id, write=True) as repo:
                if self._proposal_rejection(repo, proposal) is None:
                    repo.audit(
                        AuditRecord(
                            project_id=proposal.project_id,
                            action="ACTION_REJECTED",
                            actor=principal.id,
                            run_id=proposal.run_id,
                            operation_id=proposal.operation_id,
                            detail={"code": exc.code},
                        )
                    )
                    custom(
                        repo,
                        proposal.run_id,
                        "action-rejected",
                        {"code": exc.code, "proposal_id": proposal_id},
                    )
            if isinstance(exc, StaleSnapshotError):
                self.analysis.analyze(proposal.run_id, generation=generation)
            raise

    def _execute_locked(
        self,
        proposal_id: str,
        project_id: str,
        principal: Principal,
        *,
        generation: int | None = None,
    ) -> ActionExecution:
        with self.factory.open(project_id, write=True) as repo:
            proposal = repo.proposal(proposal_id)
            self._check_not_rejected(repo, proposal)
            # Completed operations return their original receipt, not a second side effect.
            check_business_rules(proposal)
            receipt = repo.execution(proposal.operation_id)
            if receipt:
                return receipt
            run = repo.run(proposal.run_id)
            check_proposal_generation(proposal, run)
            # Only a previously authorized, generation-bound durable message
            # may retry a failed effect. HTTP authorization still rejects FAILED;
            # cancellation, expiry and successful completion remain terminal.
            activity_retry = run.status == "FAILED" and generation is not None
            if run.status in TERMINAL_STATUSES and not activity_retry:
                raise Conflict("Cannot execute actions from a terminal run")
            if generation is not None and run.generation != generation:
                raise Conflict("Execution request belongs to a superseded run generation")
            state = repo.state(project_id)
            check_fresh(repo.snapshot(proposal.snapshot_id), state)
            check_approval(proposal, repo.approvals(proposal_id))
            if proposal.execution_mode != self.executor.mode:
                raise PermissionDenied("Configured executor does not match proposal mode")
            emit(repo, run.id, "STEP_STARTED", stepName="execute-and-verify")
            updated = self.executor.apply(state, proposal.resolution.effects, proposal.operation_id)
            if not self.executor.verify(state, updated, proposal.resolution.effects):
                raise Conflict("Action verification failed; no authoritative state was changed")
            repo.save_state(updated)
            receipt = ActionExecution(
                operation_id=proposal.operation_id,
                proposal_id=proposal.id,
                project_id=project_id,
                before_version=state.version,
                after_version=updated.version,
                mode=proposal.execution_mode,
                principal_id=principal.id,
                result="Simulated external confirmations applied and verified",
            )
            repo.save_execution(receipt)
            repo.audit(
                AuditRecord(
                    project_id=project_id,
                    action="ACTION_VERIFIED",
                    actor=principal.id,
                    run_id=run.id,
                    snapshot_id=proposal.snapshot_id,
                    operation_id=proposal.operation_id,
                    detail={
                        "before": state.version,
                        "after": updated.version,
                        "mode": proposal.execution_mode,
                    },
                )
            )
            custom(repo, run.id, "action-result", receipt.model_dump(mode="json"))
            emit(repo, run.id, "STEP_FINISHED", stepName="execute-and-verify")
        return receipt

    @staticmethod
    def _proposal_rejection(repo, proposal: ActionProposal) -> AuditRecord | None:
        for record in repo.audits(proposal.project_id):
            if (
                record.action == "ACTION_PROPOSAL_REJECTED"
                and record.operation_id == proposal.operation_id
                and record.detail.get("proposal_id") == proposal.id
            ):
                return record
        return None

    @classmethod
    def _check_not_rejected(cls, repo, proposal: ActionProposal) -> None:
        if cls._proposal_rejection(repo, proposal) is not None:
            raise Conflict("Proposal has been rejected")
