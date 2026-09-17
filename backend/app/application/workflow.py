"""Runtime-independent transitions invoked by DBOS steps or Temporal activities."""

from typing import TYPE_CHECKING

from app.application.actions import ActionService
from app.application.analysis import AnalysisService
from app.application.coordination import CoordinationService

if TYPE_CHECKING:
    from app.application.capability_jobs import CapabilityJobService


from app.domain.actions import Principal
from app.domain.errors import DomainError, PermissionDenied, StaleSnapshotError
from app.domain.runs import TERMINAL_STATUSES
from app.policies.actions import check_fresh
from app.ports.coordination import RepositoryFactory


class WorkflowCoordinator:
    def __init__(
        self,
        factory: RepositoryFactory,
        analysis: AnalysisService,
        coordination: CoordinationService,
        actions: ActionService,
    ) -> None:
        self.factory, self.analysis = factory, analysis
        self.coordination, self.actions = coordination, actions
        self.capabilities: CapabilityJobService | None = None

    def begin(self, run_id: str, *, generation: int | None = None) -> str:
        with self.factory.open() as repo:
            run = repo.run(run_id)
        if generation is not None and run.generation != generation:
            return run.status
        if run.status in TERMINAL_STATUSES - {"FAILED"}:
            return run.status
        if run.status == "WAITING_APPROVAL" and run.analysis_id:
            with self.factory.open() as repo:
                analysis = repo.analysis(run.analysis_id)
                state = repo.state(run.project_id)
            try:
                check_fresh(analysis.snapshot, state)
            except StaleSnapshotError:
                pass
            else:
                # A runtime step can retry after the DB commit but before its checkpoint.
                # Keep the exact proposal/approval identity when authoritative facts match.
                return run.status
        try:
            if run.category not in {"coordination", "investigation"}:
                if self.capabilities is None:
                    raise PermissionDenied("Capability worker is not initialized")
                return self.capabilities.process(run_id, generation=run.generation)
            return self.analysis.analyze(run_id, generation=run.generation).status
        except DomainError as exc:
            self.coordination.fail(
                run_id,
                exc.code,
                str(exc),
                generation=run.generation,
                previous_analysis_id=run.analysis_id,
            )
            raise
        except Exception:
            self.coordination.fail(
                run_id,
                "INTERNAL_ERROR",
                "Analysis failed; inspect server diagnostics",
                generation=run.generation,
                previous_analysis_id=run.analysis_id,
            )
            raise

    def advance(self, run_id: str, message: dict, *, generation: int | None = None) -> str:
        with self.factory.open() as repo:
            run = repo.run(run_id)
        if run.status in {"CANCELLED", "EXPIRED"} or (
            generation is not None and run.generation != generation
        ):
            return run.status
        if message.get("kind") == "refresh":
            return self.begin(run_id, generation=run.generation)
        if message.get("kind") != "execute":
            raise PermissionDenied("Unknown workflow message")
        generation = message.get("generation", 0)
        if type(generation) is not int or generation < 0:
            raise PermissionDenied("Invalid workflow message generation")
        if generation != run.generation:
            return run.status  # A pre-cancellation execution message has no authority.
        principal = Principal.model_validate(message.get("principal"))
        proposal_id = str(message.get("proposal_id", ""))
        with self.factory.open() as repo:
            if repo.proposal(proposal_id).run_id != run_id:
                raise PermissionDenied("Proposal does not belong to this run")
        try:
            self.actions.execute(proposal_id, principal, generation=generation)
        except StaleSnapshotError:
            pass  # ActionService already persisted rejection and performed a fresh analysis.
        except DomainError as exc:
            if exc.status >= 500:
                self.coordination.fail(
                    run_id,
                    exc.code,
                    str(exc),
                    generation=run.generation,
                    previous_analysis_id=run.analysis_id,
                )
                raise
            # Invalid decisions remain inspectable; they never end the durable approval wait.
        except Exception:
            self.coordination.fail(
                run_id,
                "INTERNAL_ERROR",
                "Action failed; inspect server diagnostics",
                generation=run.generation,
                previous_analysis_id=run.analysis_id,
            )
            raise
        with self.factory.open() as repo:
            return repo.run(run_id).status

    def expire(self, run_id: str, *, generation: int | None = None) -> str:
        self.coordination.expire(run_id, generation=generation)
        return self.status(run_id)

    def status(self, run_id: str) -> str:
        with self.factory.open() as repo:
            return repo.run(run_id).status
