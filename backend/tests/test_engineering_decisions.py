"""Human decisions preserve revision freshness and explicit Finding transitions."""

import pytest
from app.bootstrap import build_services
from app.domain.engineering import FindingDecision
from app.domain.engineering_refs import BimTarget, FindingDependency
from app.domain.errors import Conflict
from app.settings import Settings
from test_engineering_coordination import CheckEngine, setup_finding


def test_confirm_old_proposal_checks_latest_revision_only(services, admin):
    project, source, r1, finding, _, draft = setup_finding(services, admin, confirm=False)
    other = services.findings.create(project.id, draft, admin)
    engine = CheckEngine(services)
    services.rechecks.capabilities[engine.name] = engine
    services.sources.upload(project.id, source.id, "r2.ifc", b"r2", admin)
    r3 = services.sources.upload(project.id, source.id, "r3.ifc", b"r3", admin).revision
    with services.factory.open() as repo:
        assert not repo.rechecks(project.id, finding.id)
    confirmed = services.findings.decide(
        project.id, finding.id, FindingDecision(decision="CONFIRMED"), admin
    )
    with services.factory.open() as repo:
        checks = repo.rechecks(project.id, finding.id)
        assert len(checks) == 1
        check = checks[0]
        assert check.source_revision_id == r3.id
        assert check.dependencies[0].source_revision_id == r1.id
        assert check.finding_updated_at == confirmed.updated_at
        assert check.outcome == "RESOLVED"
        assert repo.run(check.id).status == "COMPLETED"
        assert repo.evidence_by_ids(project.id, check.evidence_ids)[0].source_revision_id == r3.id
        assert repo.finding(project.id, other.id).state == "PROPOSED"
        assert not repo.rechecks(project.id, other.id)
    assert engine.calls == 1
    assert (
        services.findings.decide(
            project.id, finding.id, FindingDecision(decision="CLOSED", recheck_id=check.id), admin
        ).state
        == "CLOSED"
    )


def test_confirm_current_proposal_does_not_schedule_unnecessary_check(services, admin):
    project, _, _, finding, _, _ = setup_finding(services, admin, confirm=False)
    services.findings.decide(project.id, finding.id, FindingDecision(decision="CONFIRMED"), admin)
    with services.factory.open() as repo:
        assert not repo.rechecks(project.id, finding.id)


def test_confirmation_catches_up_each_dependency_source(services, admin):
    from app.domain.project_sources import CreateProjectSource

    project, source, _, _, publication, draft = setup_finding(services, admin, confirm=False)
    other = services.sources.create(
        project.id, CreateProjectSource(name="Other", kind="BIM"), admin
    )
    other_r1 = services.sources.upload(
        project.id, other.id, "other1.ifc", b"other1", admin
    ).revision
    evidence = publication.evidence[0].model_copy(
        update={
            "id": "other-evidence",
            "source_id": other.id,
            "source_revision_id": other_r1.id,
            "source_revision": other_r1.sha256,
            "viewer_target": BimTarget(source_revision_id=other_r1.id, global_ids=("other",)),
        }
    )
    services.engineering.publish(
        project.id,
        publication.model_copy(
            update={"operation_id": "other", "changes": (), "evidence": (evidence,)}
        ),
    )
    draft = draft.model_copy(
        update={
            "evidence_ids": (*draft.evidence_ids, evidence.id),
            "dependencies": (
                *draft.dependencies,
                FindingDependency(
                    source_id=other.id,
                    source_revision_id=other_r1.id,
                    capability="fixture-clearance",
                    expected_condition="Clearance >= 100mm",
                    target=evidence.viewer_target,
                ),
            ),
        }
    )
    finding = services.findings.create(project.id, draft, admin)
    r2 = services.sources.upload(project.id, source.id, "r2.ifc", b"r2", admin).revision
    other_r2 = services.sources.upload(
        project.id, other.id, "other2.ifc", b"other2", admin
    ).revision
    services.findings.decide(project.id, finding.id, FindingDecision(decision="CONFIRMED"), admin)
    with services.factory.open() as repo:
        checks = repo.rechecks(project.id, finding.id)
        assert {(c.source_id, c.source_revision_id) for c in checks} == {
            (source.id, r2.id),
            (other.id, other_r2.id),
        }
        assert all(c.outcome == "NEEDS_REVIEW" for c in checks)


def test_enqueue_failure_rolls_back_confirmation(services, admin, monkeypatch):
    project, source, _, finding, _, _ = setup_finding(services, admin, confirm=False)
    services.sources.upload(project.id, source.id, "r2.ifc", b"r2", admin)
    original = services.rechecks.record_revision

    def fail(*args, **kwargs):
        original(*args, **kwargs)
        raise RuntimeError("outbox failed")

    monkeypatch.setattr(services.rechecks, "record_revision", fail)
    with pytest.raises(RuntimeError, match="outbox failed"):
        services.findings.decide(
            project.id, finding.id, FindingDecision(decision="CONFIRMED"), admin
        )
    with services.factory.open() as repo:
        assert repo.finding(project.id, finding.id) == finding
        assert not repo.coordination_records(project.id, finding.id)
        assert not repo.rechecks(project.id, finding.id)


def test_api_rejects_terminal_mutation_and_exposes_explicit_reopen(client, services, admin):
    project, _, _, finding, _, _ = setup_finding(services, admin, confirm=False)
    url = f"/api/projects/{project.id}/engineering/findings/{finding.id}/decisions"
    assert client.post(url, json={"decision": "DISMISSED"}).status_code == 200
    assert client.post(url, json={"decision": "CONFIRMED"}).status_code == 409
    client.headers["Authorization"] = "Bearer local-demo-viewer"
    assert client.post(url, json={"decision": "REOPENED"}).status_code == 403
    client.headers["Authorization"] = "Bearer local-demo-admin"
    response = client.post(url, json={"decision": "REOPENED"})
    assert response.status_code == 200 and response.json()["state"] == "PROPOSED"
    assert client.post(url, json={"decision": "CONFIRMED"}).json()["state"] == "CONFIRMED"


@pytest.mark.parametrize(
    "state,decision",
    [
        ("PROPOSED", "CLOSED"),
        ("PROPOSED", "REOPENED"),
        ("CONFIRMED", "CONFIRMED"),
        ("CONFIRMED", "REOPENED"),
        *[
            (state, decision)
            for state in ("DISMISSED", "CLOSED")
            for decision in ("CONFIRMED", "DISMISSED", "CLOSED", "EDITED")
        ],
    ],
)
def test_invalid_decision_preserves_finding_and_history(services, admin, state, decision):
    project, source, _, finding, _, _ = setup_finding(
        services, admin, confirm=state in {"CONFIRMED", "CLOSED"}
    )
    if state == "DISMISSED":
        services.findings.decide(
            project.id, finding.id, FindingDecision(decision="DISMISSED"), admin
        )
    elif state == "CLOSED":
        engine = CheckEngine(services)
        services.rechecks.capabilities[engine.name] = engine
        services.sources.upload(project.id, source.id, "r2.ifc", b"r2", admin)
        with services.factory.open() as repo:
            check = repo.rechecks(project.id, finding.id)[0]
        services.findings.decide(
            project.id, finding.id, FindingDecision(decision="CLOSED", recheck_id=check.id), admin
        )
    with services.factory.open() as repo:
        before = repo.finding(project.id, finding.id)
        history = repo.coordination_records(project.id, finding.id)
        checks = repo.rechecks(project.id, finding.id)
    with pytest.raises(Conflict):
        services.findings.decide(
            project.id, finding.id, FindingDecision(decision=decision, title="Invalid"), admin
        )
    with services.factory.open() as repo:
        assert repo.finding(project.id, finding.id) == before
        assert repo.coordination_records(project.id, finding.id) == history
        assert repo.rechecks(project.id, finding.id) == checks


@pytest.mark.parametrize("terminal", ["DISMISSED", "CLOSED"])
def test_reopen_requires_new_confirmation_and_fresh_checks(services, admin, terminal):
    project, source, _, finding, _, _ = setup_finding(services, admin)
    engine = CheckEngine(services)
    services.rechecks.capabilities[engine.name] = engine
    r2 = services.sources.upload(project.id, source.id, "r2.ifc", b"r2", admin).revision
    with services.factory.open() as repo:
        old = repo.rechecks(project.id, finding.id)[0]
    services.findings.decide(
        project.id, finding.id, FindingDecision(decision=terminal, recheck_id=old.id), admin
    )
    reopened = services.findings.decide(
        project.id, finding.id, FindingDecision(decision="REOPENED", note="Reassess"), admin
    )
    assert reopened.state == "PROPOSED"
    with pytest.raises(Conflict):
        services.rechecks.request(project.id, finding.id, admin)
    confirmed = services.findings.decide(
        project.id, finding.id, FindingDecision(decision="CONFIRMED"), admin
    )
    with services.factory.open() as repo:
        checks = repo.rechecks(project.id, finding.id)
        assert len(checks) == 2
        current = next(c for c in checks if c.finding_updated_at == confirmed.updated_at)
        assert current.source_revision_id == r2.id
        assert current.outcome == "RESOLVED"
        decisions = {c.decision for c in repo.coordination_records(project.id, finding.id)}
        assert "REOPENED" in decisions
    with pytest.raises(Conflict, match="current resolved"):
        services.findings.decide(
            project.id, finding.id, FindingDecision(decision="CLOSED", recheck_id=old.id), admin
        )


def test_confirmation_and_outbox_survive_dispatch_failure(tmp_path, admin, monkeypatch):
    settings = Settings(data_dir=tmp_path, diagnostic_runtime=True, seed_demo=False)
    svc = build_services(settings)
    try:
        project, source, _, finding, _, _ = setup_finding(svc, admin, confirm=False)
        r2 = svc.sources.upload(project.id, source.id, "r2.ifc", b"r2", admin).revision
        with monkeypatch.context() as patch:
            patch.setattr(
                svc.runtime, "start", lambda _: (_ for _ in ()).throw(RuntimeError("interrupted"))
            )
            with pytest.raises(RuntimeError, match="interrupted"):
                svc.findings.decide(
                    project.id, finding.id, FindingDecision(decision="CONFIRMED"), admin
                )
        with svc.factory.open() as repo:
            assert repo.finding(project.id, finding.id).state == "CONFIRMED"
            check = repo.rechecks(project.id, finding.id)[0]
            assert check.source_revision_id == r2.id
            assert repo.run(check.id).status == "QUEUED"
    finally:
        svc.close()
    reopened = build_services(settings)
    try:
        with reopened.factory.open() as repo:
            check = repo.rechecks(project.id, finding.id)[0]
            assert repo.run(check.id).status == "COMPLETED"
            assert check.outcome == "NEEDS_REVIEW"
    finally:
        reopened.close()
