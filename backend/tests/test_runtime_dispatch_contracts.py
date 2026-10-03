"""Strict SDK-boundary contracts, NOT substitutes for real durable-engine tests.

Persistence and coordinator invariants execute against real SQLite; SDK calls are
recorded by minimal signature-constrained doubles. Live subprocess tests are separate.
"""

import asyncio
import sys
from concurrent.futures import ThreadPoolExecutor
from contextlib import contextmanager
from enum import Enum
from types import ModuleType, SimpleNamespace

import pytest
from app.adapters import runtime_dbos as module
from app.domain.errors import ProviderError, TransientProviderError, WorkflowError
from app.domain.runs import AgentRun
from app.settings import Settings


@pytest.fixture
def sdk(monkeypatch):
    class SDK:
        records = {}
        starts = []
        generations = []
        sends = []
        resumes = []
        cancels = []
        destroys = 0
        step_options = []
        launch_failure = False
        start_failure = False
        identity = None
        configs = []

        def __init__(self, *, config):
            assert config["run_admin_server"] is False
            assert config["enable_otlp"] is False
            SDK.configs.append(config)

        @staticmethod
        def step(**kwargs):
            SDK.step_options.append(kwargs)
            return lambda function: function

        @staticmethod
        def workflow():
            return lambda function: function

        @classmethod
        def launch(cls):
            if cls.launch_failure:
                raise RuntimeError("launch failed")

        @classmethod
        def destroy(cls, *, workflow_completion_timeout_sec):
            assert workflow_completion_timeout_sec == 2
            cls.destroys += 1

        @classmethod
        def get_workflow_status(cls, identity):
            state = cls.records.get(identity)
            return SimpleNamespace(status=state) if state else None

        @classmethod
        def start_workflow(cls, function, run_id, generation=0):
            assert callable(function)
            if cls.start_failure:
                raise RuntimeError("dispatch interrupted")
            cls.starts.append((cls.identity, run_id))
            cls.generations.append(generation)
            cls.records[cls.identity] = "PENDING"

        @classmethod
        def send(cls, identity, message, *, topic, idempotency_key):
            cls.sends.append((identity, message, topic, idempotency_key))

        @classmethod
        def resume_workflow(cls, identity):
            cls.resumes.append(identity)
            cls.records[identity] = "PENDING"

        @classmethod
        def cancel_workflow(cls, identity):
            cls.cancels.append(identity)
            cls.records[identity] = "CANCELLED"

    @contextmanager
    def identity(value):
        SDK.identity = value
        try:
            yield
        finally:
            SDK.identity = None

    fake = ModuleType("dbos")
    fake.DBOS = SDK
    fake.SetWorkflowID = identity
    monkeypatch.setitem(sys.modules, "dbos", fake)
    for name, value in [
        ("_active", None),
        ("_owner", None),
        ("_registered", False),
        ("_workflow", None),
    ]:
        monkeypatch.setattr(module, name, value)
    yield SDK
    if module._owner is not None:
        module._owner.close()


def create_run(services, **updates):
    run = AgentRun(project_id="harbor-east", **updates)
    with services.factory.open(run.project_id, write=True) as repo:
        repo.save_run(run)
    return run


def runtime(services, coordinator=None, **kwargs):
    return module.DBOSRuntime(
        coordinator or object(), "sqlite:///runtime.sqlite", services.factory, **kwargs
    )


def test_domain_failures_end_dbos_steps_without_retrying(sdk, services):
    adapter = runtime(services)
    try:
        retry = sdk.step_options[0]["should_retry"]
        assert retry(ProviderError("Malformed IFC")) is False
        assert retry(TransientProviderError("Provider unavailable")) is True
        assert retry(RuntimeError("worker interrupted")) is True
    finally:
        adapter.close()


def test_dbos_application_identity_has_a_stable_default_and_validated_override(sdk, services):
    default = runtime(services)
    assert default.app_name == sdk.configs[-1]["name"] == "cca"
    default.close()

    settings = Settings(dbos_app_name="cca-coordinator")
    configured = runtime(services, app_name=settings.dbos_app_name)
    assert configured.app_name == sdk.configs[-1]["name"] == "cca-coordinator"
    configured.close()

    with pytest.raises(ValueError, match="DBOS application name"):
        Settings(dbos_app_name="Construction Coordination Agent")


def test_dbos_start_preserves_business_identity(sdk, services):
    run = create_run(services)
    adapter = runtime(services)
    assert adapter.start(run.id) == run.id
    assert adapter.start(run.id) == run.id
    assert sdk.starts == [(run.id, run.id)]
    assert adapter.status(run.id) == "PENDING"


def test_failed_second_initialization_never_replaces_live_driver(sdk, services):
    first_driver, second_driver = object(), object()
    first = runtime(services, first_driver)
    with pytest.raises(WorkflowError, match="one DBOS"):
        runtime(services, second_driver)
    assert module._active is first_driver
    first.close()
    first.close()
    assert sdk.destroys == 1 and module._active is None
    second = runtime(services, second_driver)
    assert module._active is second_driver
    second.close()
    assert sdk.destroys == 2


def test_dbos_launch_failure_releases_owner_and_sdk(sdk, services):
    sdk.launch_failure = True
    with pytest.raises(RuntimeError, match="launch failed"):
        runtime(services)
    assert module._active is None and module._owner is None
    assert sdk.destroys == 1
    sdk.launch_failure = False
    runtime(services).close()
    assert sdk.destroys == 2


@pytest.mark.parametrize("state", ["ERROR", "SUCCESS"])
def test_terminal_execution_retry_commits_new_identity_without_deleting_history(
    sdk, services, state
):
    run = create_run(services)
    sdk.records[run.id] = state
    adapter = runtime(services)
    adapter.resume(run.id)
    with services.factory.open() as repo:
        updated = repo.run(run.id)
    assert updated.id == run.id
    assert updated.runtime_execution_id != run.id
    assert sdk.records[run.id] == state
    assert sdk.starts == [(updated.runtime_execution_id, run.id)]
    assert not sdk.resumes
    adapter.signal(run.id, {"kind": "refresh"}, "message-stable")
    assert sdk.sends[-1] == (
        updated.runtime_execution_id,
        {"kind": "refresh"},
        "decision",
        "message-stable",
    )
    adapter.cancel(run.id)
    assert sdk.cancels == [updated.runtime_execution_id]


def test_terminal_run_is_not_restarted_without_explicit_queued_intent(sdk, services):
    run = create_run(services, status="COMPLETED")
    sdk.records[run.id] = "SUCCESS"
    runtime(services).start(run.id)
    assert sdk.starts == [] and sdk.sends == []


def test_crash_after_retry_identity_commit_recovers_same_identity(sdk, services):
    run = create_run(services)
    sdk.records[run.id] = "ERROR"
    adapter = runtime(services)
    sdk.start_failure = True
    with pytest.raises(RuntimeError, match="dispatch interrupted"):
        adapter.resume(run.id)
    with services.factory.open() as repo:
        committed_id = repo.run(run.id).runtime_execution_id
    assert committed_id and committed_id != run.id
    adapter.close()
    sdk.start_failure = False
    recovered = runtime(services)
    recovered.start(run.id)
    assert sdk.starts == [(committed_id, run.id)]
    with services.factory.open() as repo:
        assert repo.run(run.id).runtime_execution_id == committed_id


def test_concurrent_resume_converges_on_one_persisted_retry(sdk, services):
    run = create_run(services)
    sdk.records[run.id] = "ERROR"
    adapter = runtime(services)
    with ThreadPoolExecutor(max_workers=8) as pool:
        list(pool.map(lambda _: adapter.resume(run.id), range(8)))
    assert len(sdk.starts) == 1
    assert len({message[3] for message in sdk.sends}) == 1


def test_cancelled_execution_is_resumed_without_replacing_checkpoints(sdk, services):
    run = create_run(services)
    sdk.records[run.id] = "CANCELLED"
    adapter = runtime(services)
    adapter.resume(run.id)
    assert sdk.resumes == [run.id] and not sdk.starts
    assert sdk.sends[0][1] == {"kind": "refresh"}


def test_closed_dbos_rejects_dispatch(sdk, services):
    adapter = runtime(services)
    adapter.close()
    with pytest.raises(WorkflowError, match="closed"):
        adapter.start("not-dispatched")


@pytest.mark.parametrize("resume", [False, True])
def test_temporal_resume_uses_atomic_signal_with_start(monkeypatch, resume):
    from app.adapters.runtime_temporal import TemporalRuntime

    class Conflict(Enum):
        USE_EXISTING = 1

    class Reuse(Enum):
        ALLOW_DUPLICATE = 1
        REJECT_DUPLICATE = 2

    common = ModuleType("temporalio.common")
    common.WorkflowIDConflictPolicy = Conflict
    common.WorkflowIDReusePolicy = Reuse
    errors = ModuleType("temporalio.exceptions")
    errors.WorkflowAlreadyStartedError = type("WorkflowAlreadyStartedError", (Exception,), {})
    monkeypatch.setitem(sys.modules, "temporalio", ModuleType("temporalio"))
    monkeypatch.setitem(sys.modules, "temporalio.common", common)
    monkeypatch.setitem(sys.modules, "temporalio.exceptions", errors)
    calls = []

    class Client:
        async def start_workflow(
            self,
            name,
            arg=None,
            *,
            args=(),
            id,
            task_queue,
            id_conflict_policy,
            id_reuse_policy,
            rpc_timeout,
            start_signal=None,
            start_signal_args=(),
        ):
            run_id = arg if not args else args[0]
            calls.append(
                (
                    name,
                    run_id,
                    id,
                    task_queue,
                    id_conflict_policy,
                    id_reuse_policy,
                    start_signal,
                    start_signal_args,
                )
            )

    adapter = TemporalRuntime.__new__(TemporalRuntime)
    adapter.client, adapter.task_queue = Client(), "test-queue"
    asyncio.run(adapter._start("business-run", resume=resume))
    call = calls[0]
    assert call[:5] == (
        "cca-coordination",
        "business-run",
        "business-run",
        "test-queue",
        Conflict.USE_EXISTING,
    )
    if resume:
        assert call[5] == Reuse.ALLOW_DUPLICATE and call[6] == "decision"
        assert call[7][0]["payload"] == {"kind": "refresh"}
        assert call[7][0]["id"].startswith("resume:")
    else:
        assert call[5] == Reuse.REJECT_DUPLICATE and call[6] is None


def test_postgres_standard_url_uses_installed_psycopg3_driver(monkeypatch):
    from app.adapters.persistence import database

    calls = []
    monkeypatch.setattr(
        database,
        "create_engine",
        lambda url, **kwargs: (
            calls.append((url, kwargs))
            or SimpleNamespace(dialect=SimpleNamespace(name="postgresql"))
        ),
    )
    database.make_engine("postgresql://user:pass@localhost/cca")
    assert calls[0][0] == "postgresql+psycopg://user:pass@localhost/cca"
    assert calls[0][1]["hide_parameters"] is True
    database.make_engine("postgresql+psycopg://user:pass@localhost/cca")
    assert calls[1][0] == calls[0][0]


def test_expiring_completed_run_reports_actual_terminal_state(services):
    run = create_run(services, status="COMPLETED")
    assert services.workflow.expire(run.id) == "COMPLETED"


@pytest.mark.parametrize("operation", ["start", "signal", "cancel", "status"])
def test_dbos_close_wins_against_a_dispatch_waiting_for_the_lock(sdk, services, operation):
    from threading import Event, get_ident

    run = create_run(services)
    adapter = runtime(services)
    lock = adapter._dispatch_lock
    attempting = Event()
    owner_thread = get_ident()

    class ObservedLock:
        def __enter__(self):
            if get_ident() != owner_thread:
                attempting.set()
            lock.acquire()
            return self

        def __exit__(self, *_):
            lock.release()

    adapter._dispatch_lock = ObservedLock()
    args = (run.id, {"kind": "refresh"}, "waiting-message") if operation == "signal" else (run.id,)
    with ThreadPoolExecutor(max_workers=1) as pool:
        with lock:
            future = pool.submit(getattr(adapter, operation), *args)
            assert attempting.wait(timeout=2), "Operation did not serialize with runtime shutdown"
            adapter.close()
        with pytest.raises(WorkflowError, match="closed"):
            future.result(timeout=2)
    assert sdk.starts == [] and sdk.sends == [] and sdk.cancels == []


@pytest.mark.parametrize("previous_state", ["PENDING", "CANCELLED", "ERROR", "SUCCESS"])
def test_new_generation_never_joins_or_replays_previous_execution(sdk, services, previous_state):
    run = create_run(services, generation=1)
    sdk.records[run.id] = previous_state
    adapter = runtime(services)
    adapter.resume(run.id)
    with services.factory.open() as repo:
        current = repo.run(run.id)
    assert current.runtime_generation == current.generation == 1
    assert current.runtime_execution_id != run.id
    assert sdk.records[run.id] == previous_state
    assert sdk.starts == [(current.runtime_execution_id, run.id)]
    assert sdk.generations == [1]
    assert sdk.resumes == []
    adapter.cancel(run.id, generation=0)
    assert sdk.cancels == []  # A delayed cancellation cannot target the new execution.
    adapter.cancel(run.id, generation=1)
    assert sdk.cancels == [current.runtime_execution_id]


def test_generation_identity_is_stable_across_an_interrupted_dispatch(sdk, services):
    run = create_run(services, generation=2)
    adapter = runtime(services)
    sdk.start_failure = True
    with pytest.raises(RuntimeError, match="interrupted"):
        adapter.resume(run.id)
    with services.factory.open() as repo:
        identity = repo.run(run.id).runtime_execution_id
    assert identity and identity != run.id
    sdk.start_failure = False
    adapter.resume(run.id)
    assert sdk.starts == [(identity, run.id)] and sdk.generations == [2]


def test_temporal_generation_dispatch_and_delayed_cancel_target_exact_identity(services):
    from threading import RLock

    from app.adapters.runtime_temporal import TemporalRuntime

    run = create_run(services, runtime="temporal", generation=1)
    adapter = TemporalRuntime.__new__(TemporalRuntime)
    adapter.factory, adapter._closed, adapter._lifecycle_lock = services.factory, False, RLock()
    calls, cancelled = [], []

    async def start(run_id, resume=False, *, execution_id=None, generation=0):
        calls.append((run_id, resume, execution_id, generation))

    class Handle:
        def __init__(self, identity):
            self.identity = identity

        async def cancel(self, *, rpc_timeout):
            cancelled.append(self.identity)

    adapter._start, adapter._call = start, asyncio.run
    adapter.client = SimpleNamespace(get_workflow_handle=Handle)
    adapter.resume(run.id)
    adapter.resume(run.id)
    assert calls[0] == calls[1]
    assert calls[0][0] == run.id and calls[0][2] != run.id and calls[0][3] == 1
    adapter.cancel(run.id, generation=0)
    assert not cancelled
    adapter.cancel(run.id, generation=1)
    assert cancelled == [calls[0][2]]
