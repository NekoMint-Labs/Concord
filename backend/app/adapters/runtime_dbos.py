"""DBOS 2 runtime: durable workflow identity, checkpoints, messages and cancellation.

SDK imports occur only when this adapter is selected. Missing DBOS is never silently
replaced by an in-process scheduler.
"""

from threading import RLock
from typing import Any, cast
from uuid import NAMESPACE_URL, uuid5

from app.adapters.runtime_identity import bind_execution
from app.domain.errors import (
    CapabilityUnavailable,
    DomainError,
    ExternalSystemUnavailable,
    TransientProviderError,
    WorkflowError,
)
from app.ports.coordination import RepositoryFactory
from app.ports.services import WorkflowDriver

_active: WorkflowDriver | None = None
_registered = False
_workflow = None
_owner = None
_lifecycle_lock = RLock()


def _should_retry(exc: BaseException) -> bool:
    """Retry runtime failures, but let persisted domain failures stay terminal."""
    return not isinstance(exc, DomainError) or isinstance(
        exc, (TransientProviderError, ExternalSystemUnavailable)
    )


def _register() -> None:
    global _registered, _workflow
    if _registered:
        return
    from dbos import DBOS

    @DBOS.step(
        retries_allowed=True,
        max_attempts=3,
        interval_seconds=1,
        backoff_rate=2,
        should_retry=_should_retry,
    )
    def analyze_step(run_id: str, generation: int = 0) -> str:
        assert _active is not None
        return _active.begin(run_id, generation=generation)

    @DBOS.step(
        retries_allowed=True,
        max_attempts=3,
        interval_seconds=1,
        backoff_rate=2,
        should_retry=_should_retry,
    )
    def decision_step(run_id: str, message: dict, generation: int = 0) -> str:
        assert _active is not None
        return _active.advance(run_id, message, generation=generation)

    @DBOS.step(retries_allowed=True, max_attempts=3, should_retry=_should_retry)
    def expire_step(run_id: str, generation: int = 0) -> str:
        assert _active is not None
        return _active.expire(run_id, generation=generation)

    @DBOS.workflow()
    def coordination_workflow(run_id: str, generation: int = 0) -> str:
        status = analyze_step(run_id, generation) if generation else analyze_step(run_id)
        while status == "WAITING_APPROVAL":
            message = DBOS.recv(topic="decision", timeout_seconds=30 * 24 * 3600)
            if message is None:
                return expire_step(run_id, generation) if generation else expire_step(run_id)
            status = (
                decision_step(run_id, message, generation)
                if generation
                else decision_step(run_id, message)
            )
        return status

    _workflow = coordination_workflow
    _registered = True


class DBOSRuntime:
    name = "dbos"

    def __init__(
        self,
        coordinator: WorkflowDriver,
        database_url: str,
        factory: RepositoryFactory,
        *,
        app_name: str = "cca",
    ) -> None:
        global _active, _owner
        try:
            from dbos import DBOS
        except ImportError as exc:
            raise CapabilityUnavailable(
                "DBOS is not installed. Run uv sync. For isolated checks "
                "only, use --diagnostic-runtime; it does not provide "
                "durability."
            ) from exc
        self.factory = factory
        self.app_name = app_name
        self._dispatch_lock = RLock()
        self._closed = True
        # DBOS is process-global. Never replace a live runtime's driver when a
        # second application is constructed or initialization fails.
        with _lifecycle_lock:
            if _owner is not None:
                raise WorkflowError("Only one DBOS runtime may own this process")
            _owner, _active = self, coordinator
            constructed = False
            try:
                _register()
                DBOS(
                    config={
                        "name": self.app_name,
                        "system_database_url": database_url,
                        "run_admin_server": False,
                        "enable_otlp": False,
                    }
                )
                constructed = True
                DBOS.launch()
                self._closed = False
            except BaseException:
                try:
                    if constructed:
                        DBOS.destroy(workflow_completion_timeout_sec=2)
                finally:
                    _active, _owner = None, None
                raise

    def _check_open(self) -> None:
        if self._closed or _owner is not self:
            raise WorkflowError("DBOS runtime is closed")

    def _run(self, run_id: str):
        with self.factory.open() as repo:
            return repo.run(run_id)

    def _execution_id(self, run_id: str) -> str:
        run = self._run(run_id)
        return run.runtime_execution_id or run.id

    def _dispatch(self, run_id: str, *, resume: bool) -> str:
        from dbos import DBOS, SetWorkflowID

        # Serializes dispatch within this process; project transactions and
        # deterministic execution IDs also make concurrent processes converge.
        with self._dispatch_lock:
            self._check_open()
            while True:
                run = bind_execution(self.factory, run_id, self.name)
                execution_id = run.runtime_execution_id or run.id
                status = DBOS.get_workflow_status(execution_id)
                state = str(status.status) if status else "NOT_FOUND"
                if state in {"SUCCESS", "ERROR"} and run.status == "QUEUED":
                    # DBOS cannot resume completed/errored executions. Preserve
                    # their histories and commit a new identity BEFORE dispatch.
                    # A crash here is recovered by bootstrap's QUEUED scan.
                    with self.factory.open(run.project_id, write=True) as repo:
                        current = repo.run(run_id)
                        if (current.runtime_execution_id or current.id) != execution_id:
                            continue
                        if current.status != "QUEUED":
                            return execution_id
                        execution_id = str(uuid5(NAMESPACE_URL, f"cca:dbos:retry:{execution_id}"))
                        repo.save_run(
                            current.model_copy(update={"runtime_execution_id": execution_id})
                        )
                    status = DBOS.get_workflow_status(execution_id)
                    state = str(status.status) if status else "NOT_FOUND"
                if state == "NOT_FOUND":
                    assert _workflow is not None
                    with SetWorkflowID(execution_id):
                        start_workflow = cast(Any, DBOS.start_workflow)
                        if run.generation:
                            start_workflow(_workflow, run_id, run.generation)
                        else:
                            start_workflow(_workflow, run_id)
                elif run.status == "QUEUED":
                    if state in {
                        "CANCELLED",
                        "MAX_RECOVERY_ATTEMPTS_EXCEEDED",
                        "ENQUEUED",
                        "DELAYED",
                    }:
                        DBOS.resume_workflow(execution_id)
                    if resume or run.analysis_id:
                        DBOS.send(
                            execution_id,
                            {"kind": "refresh"},
                            topic="decision",
                            idempotency_key=f"resume:{execution_id}:{run.updated_at.isoformat()}",
                        )
                return execution_id

    def start(self, run_id: str) -> str:
        self._dispatch(run_id, resume=False)
        return run_id

    def signal(self, run_id: str, message: dict, message_id: str) -> None:
        from dbos import DBOS

        with self._dispatch_lock:
            self._check_open()
            DBOS.send(
                self._execution_id(run_id), message, topic="decision", idempotency_key=message_id
            )

    def status(self, run_id: str) -> str:
        from dbos import DBOS

        with self._dispatch_lock:
            self._check_open()
            status = DBOS.get_workflow_status(self._execution_id(run_id))
            return str(status.status) if status else "NOT_FOUND"

    def cancel(self, run_id: str, *, generation: int | None = None) -> None:
        from dbos import DBOS

        with self._dispatch_lock:
            self._check_open()
            run = self._run(run_id)
            if generation is not None and run.generation != generation:
                return
            DBOS.cancel_workflow(run.runtime_execution_id or run.id)

    def resume(self, run_id: str) -> None:
        self._dispatch(run_id, resume=True)

    def close(self) -> None:
        global _active, _owner
        from dbos import DBOS

        with _lifecycle_lock, self._dispatch_lock:
            if self._closed:
                return
            try:
                DBOS.destroy(workflow_completion_timeout_sec=2)
            finally:
                self._closed = True
                if _owner is self:
                    _active, _owner = None, None
