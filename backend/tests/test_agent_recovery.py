"""Cancellation, publication fencing and committed outbox recovery with real SQLite."""

import pytest
from app.bootstrap import build_services
from app.domain.agent import AgentRequest, AgentSettings
from app.domain.errors import Conflict
from app.domain.project_sources import CreateProjectSource
from app.settings import Settings
from test_agent_controls import project


def test_revision_and_outbox_survive_failed_dispatch_and_restart(tmp_path, admin, monkeypatch):
    settings = Settings(data_dir=tmp_path, diagnostic_runtime=True, seed_demo=False)
    svc = build_services(settings)
    identity, _ = project(svc, admin)
    source = svc.sources.create(identity, CreateProjectSource(name="Model", kind="BIM"), admin)
    svc.agent.configure(identity, AgentSettings(initiative="auto-investigate"), admin)
    with monkeypatch.context() as patch:

        def interrupted(_):
            raise RuntimeError("dispatch interrupted")

        patch.setattr(svc.runtime, "start", interrupted)
        with pytest.raises(RuntimeError, match="dispatch interrupted"):
            svc.sources.upload(identity, source.id, "model.ifc", b"original", admin)
    with svc.factory.open() as repo:
        notice = repo.agent_notices(identity)[0]
        assert repo.run(notice.run_id).status == "QUEUED"
        assert repo.source_revisions(identity, source.id)[0].id == notice.revision_id
    svc.close()
    reopened = build_services(settings)
    try:
        with reopened.factory.open() as repo:
            assert repo.run(notice.run_id).status == "COMPLETED"
            assert repo.investigation_report(notice.run_id).persisted
            assert len(repo.agent_notices(identity)) == 1
        duplicate = reopened.sources.upload(identity, source.id, "same.ifc", b"original", admin)
        assert duplicate.duplicate
    finally:
        reopened.close()


def test_disabling_auto_cancels_queued_work_but_manual_request_still_works(
    services, admin, monkeypatch
):
    identity, _ = project(services, admin)
    source = services.sources.create(identity, CreateProjectSource(name="Model", kind="BIM"), admin)
    services.agent.configure(identity, AgentSettings(initiative="auto-investigate"), admin)
    with monkeypatch.context() as patch:
        patch.setattr(services.runtime, "start", lambda identity: identity)
        services.sources.upload(identity, source.id, "model.ifc", b"original", admin)
    services.agent.configure(identity, AgentSettings(initiative="manual"), admin)
    with services.factory.open() as repo:
        run = repo.runs(identity)[0]
        assert run.status == "CANCELLED"
    assert services.workflow.begin(run.id) == "CANCELLED"
    explicit = services.agent.enqueue(identity, AgentRequest(instruction="Check project"), admin)
    assert explicit.status == "WAITING_APPROVAL"


def test_cancel_during_tools_cannot_publish_and_resume_keeps_scope(
    services, admin, monkeypatch, client
):
    identity, _ = project(services, admin)
    engine = services.investigations.engine
    original = engine.investigate

    def interrupted(instruction, scope, tools):
        services.coordination.cancel(tools.run_id, admin)
        return original(instruction, scope, tools)

    with monkeypatch.context() as patch:
        patch.setattr(engine, "investigate", interrupted)
        with pytest.raises(Conflict):
            services.agent.enqueue(identity, AgentRequest(instruction="Check only L02"), admin)
    with services.factory.open() as repo:
        run = repo.runs(identity)[0]
        assert run.status == "CANCELLED"
        assert repo.investigation_report(run.id) is None
        assert repo.proposals(run.id) == []
        request = repo.investigation(run.id)
    response = client.post(f"/api/runs/{run.id}/resume")
    assert response.status_code == 202
    with services.factory.open() as repo:
        assert repo.run(run.id).generation == 1
        assert repo.investigation_report(run.id).scope == request.request.scope
    assert services.workflow.begin(run.id, generation=0) == "WAITING_APPROVAL"


def test_project_change_during_tools_retries_with_new_snapshot(services, admin, monkeypatch):
    identity, _ = project(services, admin)
    engine = services.investigations.engine
    original = engine.investigate
    calls = []

    def change_once(instruction, scope, tools):
        calls.append(tools.snapshot.version)
        if len(calls) == 1:
            with services.factory.open(identity, write=True) as repo:
                state = repo.state(identity)
                repo.save_state(state.model_copy(update={"version": state.version + 1}))
        return original(instruction, scope, tools)

    monkeypatch.setattr(engine, "investigate", change_once)
    run = services.agent.enqueue(identity, AgentRequest(instruction="Check only L02"), admin)
    assert len(calls) == 2 and calls[1] == calls[0] + 1
    with services.factory.open() as repo:
        assert repo.analysis(run.analysis_id).snapshot.version == calls[1]
        assert len(repo.proposals(run.id)) == 1
