"""Versioned IDS selection, original byte delivery and stale-configuration rejection."""

import pytest
from app.domain.engineering import FindingDecision, IDSRequirementsRequest
from app.domain.errors import Conflict, DomainError, NotFound
from app.domain.project_sources import CreateProjectSource
from test_engineering_coordination import setup_finding
from test_engineering_multisource import PairedEngine, checks, paired_finding


def ids_finding(svc, admin):
    project, model, _, _, _, draft = setup_finding(svc, admin, confirm=False)
    finding = svc.findings.create(
        project.id,
        draft.model_copy(
            update={
                "dependencies": (
                    draft.dependencies[0].model_copy(update={"requirements_kind": "ids"}),
                )
            }
        ),
        admin,
    )
    finding = svc.findings.decide(
        project.id, finding.id, FindingDecision(decision="CONFIRMED"), admin
    )
    rules = svc.sources.create(
        project.id, CreateProjectSource(name="Rules", kind="DOCUMENT"), admin
    )
    revision = svc.sources.upload(
        project.id, rules.id, "rules.ids", b"<ids>v1</ids>", admin
    ).revision
    return project, model, rules, revision, finding


def select(svc, admin, project, source, revision):
    return svc.ids_requirements.select(
        project.id, IDSRequirementsRequest(source_id=source.id, revision_id=revision.id), admin
    )


def test_ids_selection_enqueues_each_pair_once_before_execution(services, admin, monkeypatch):
    project, first, second, _, _, finding = paired_finding(services, admin, requirements_kind="ids")
    engine = PairedEngine()
    services.rechecks.register(engine)
    rules = services.sources.create(
        project.id, CreateProjectSource(name="Rules", kind="DOCUMENT"), admin
    )
    r1 = services.sources.upload(
        project.id, rules.id, "rules.ids", b"<ids>v1</ids>", admin
    ).revision
    monkeypatch.setattr(services.rechecks, "dispatch", lambda _: None)

    selection = select(services, admin, project, rules, r1)
    queued = checks(services, project, finding)
    assert len(queued) == 1
    assert queued[0].ids_requirements == selection
    assert {i.source_id for i in queued[0].inputs} == {first.id, second.id, rules.id}
    assert select(services, admin, project, rules, r1) == selection
    with services.factory.open() as repo:
        pending = [r for r in repo.pending_runs(project.id) if r.category == "engineering_recheck"]
        assert [r.id for r in pending] == [queued[0].id]
        assert pending[0].status == "QUEUED"
    assert not engine.requests
    services.runtime.start(queued[0].id)
    assert len(engine.requests) == 1
    assert engine.requests[0].input_bytes[-1] == b"<ids>v1</ids>"

    r2 = services.sources.upload(
        project.id, rules.id, "rules.ids", b"<ids>v2</ids>", admin
    ).revision
    changed = select(services, admin, project, rules, r2)
    all_checks = checks(services, project, finding)
    assert len(all_checks) == 2
    new_check = next(c for c in all_checks if c.ids_requirements == changed)
    assert new_check.id != queued[0].id
    services.runtime.start(new_check.id)
    assert len(engine.requests) == 2
    assert engine.requests[-1].input_bytes[-1] == b"<ids>v2</ids>"


def test_selection_delivers_verified_bytes_and_new_upload_does_not_replace(services, admin):
    project, model, rules, r1, finding = ids_finding(services, admin)
    engine = PairedEngine()
    services.rechecks.register(engine)
    selected = select(services, admin, project, rules, r1)
    request = engine.requests[0]
    assert request.ids_requirements == selected
    assert request.inputs[-1].role == "requirements"
    assert request.input_bytes[-1] == b"<ids>v1</ids>"
    assert "input_bytes" not in request.model_dump()
    old = checks(services, project, finding)[0]
    assert old.outcome == "RESOLVED"
    r2 = services.sources.upload(
        project.id, rules.id, "rules.ids", b"<ids>v2</ids>", admin
    ).revision
    assert services.ids_requirements.get(project.id, admin) == selected
    assert len(engine.requests) == 1
    assert select(services, admin, project, rules, r1) == selected
    assert len(engine.requests) == 1
    changed = select(services, admin, project, rules, r2)
    assert changed.id != selected.id and len(engine.requests) == 2
    assert engine.requests[-1].input_bytes[-1] == b"<ids>v2</ids>"
    with pytest.raises(Conflict, match="superseded"):
        services.findings.decide(
            project.id, finding.id, FindingDecision(decision="CLOSED", recheck_id=old.id), admin
        )


def test_missing_configuration_never_runs_ids(services, admin):
    project, model, _, _, finding = ids_finding(services, admin)
    engine = PairedEngine()
    services.rechecks.register(engine)
    services.sources.upload(project.id, model.id, "r2.ifc", b"r2", admin)
    assert not engine.requests
    assert checks(services, project, finding)[0].outcome == "NEEDS_REVIEW"


def test_selection_switch_during_evaluation_fences_publication(services, admin, monkeypatch):
    project, model, rules, r1, finding = ids_finding(services, admin)
    r2 = services.sources.upload(
        project.id, rules.id, "rules.ids", b"<ids>v2</ids>", admin
    ).revision
    engine = PairedEngine()
    services.rechecks.register(engine)
    monkeypatch.setattr(services.rechecks, "dispatch", lambda _: None)
    select(services, admin, project, rules, r1)
    old = checks(services, project, finding)[0]
    engine.during = lambda _: select(services, admin, project, rules, r2)
    services.runtime.start(old.id)
    old = next(c for c in checks(services, project, finding) if c.id == old.id)
    assert old.outcome == "NEEDS_REVIEW" and not old.evidence_ids
    assert not list((services.settings.data_dir / "files/derived").glob("*"))


def test_selection_rejects_wrong_project_type_and_corrupt_original(services, admin):
    project, model, rules, r1, _ = ids_finding(services, admin)
    with pytest.raises(NotFound):
        services.ids_requirements.select(
            "other", IDSRequirementsRequest(source_id=rules.id, revision_id=r1.id), admin
        )
    bad = services.sources.upload(project.id, model.id, "rules.ids", b"<ids/>", admin).revision
    with pytest.raises(Conflict, match="document source"):
        select(services, admin, project, model, bad)
    wrong_extension = services.sources.upload(
        project.id, rules.id, "rules.txt", b"wrong", admin
    ).revision
    with pytest.raises(Conflict, match=".ids"):
        select(services, admin, project, rules, wrong_extension)
    services.storage.put(r1.storage_key, b"tampered")
    with pytest.raises(DomainError, match="integrity"):
        select(services, admin, project, rules, r1)


def test_ids_api_permissions_and_project_scope(client, services, admin):
    project, _, rules, r1, _ = ids_finding(services, admin)
    path = f"/api/projects/{project.id}/engineering/ids-requirements"
    assert client.get(path).json() is None
    payload = {"source_id": rules.id, "revision_id": r1.id}
    response = client.put(path, json=payload)
    assert response.status_code == 200 and response.json()["sha256"] == r1.sha256
    assert client.get(path).json() == response.json()
    client.headers["Authorization"] = "Bearer local-demo-viewer"
    assert client.put(path, json=payload).status_code == 403
    assert client.get("/api/projects/other/engineering/ids-requirements").status_code == 404


def test_selection_and_queued_inputs_survive_restart(tmp_path, admin, monkeypatch):
    from app.bootstrap import build_services
    from app.settings import Settings

    settings = Settings(data_dir=tmp_path, diagnostic_runtime=True, seed_demo=False)
    svc = build_services(settings)
    project, _, rules, r1, finding = ids_finding(svc, admin)
    monkeypatch.setattr(svc.rechecks, "dispatch", lambda _: None)
    selection = select(svc, admin, project, rules, r1)
    bound = checks(svc, project, finding)[0].inputs
    svc.close()
    engine = PairedEngine()
    reopened = build_services(settings, engineering_capabilities=(engine,))
    try:
        assert reopened.ids_requirements.get(project.id, admin) == selection
        check = checks(reopened, project, finding)[0]
        assert check.inputs == bound and check.outcome == "RESOLVED"
        assert engine.requests[0].input_bytes[-1] == b"<ids>v1</ids>"
    finally:
        reopened.close()
