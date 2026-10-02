"""Cache, provenance, migration and run-generation regression coverage."""

import ast
from pathlib import Path

import pytest
from app.domain.baselines import BaselineEntry, CreateBaseline
from app.domain.engineering import FindingDecision
from app.domain.engineering_refs import BimTarget, CadTarget, DocumentTarget, DrawingTarget
from app.domain.errors import Conflict
from app.domain.project_sources import CreateProjectSource
from app.settings import Settings
from pydantic import ValidationError
from test_engineering_coordination import CheckEngine, setup_finding


def test_cache_reuses_output_but_rebinds_persisted_evidence(services, admin):
    project, source, _, finding, _, _ = setup_finding(services, admin)
    engine = CheckEngine(services)
    services.rechecks.capabilities[engine.name] = engine
    services.sources.upload(project.id, source.id, "r2.ifc", b"r2", admin)
    services.rechecks.request(project.id, finding.id, admin, operation_id="repeat")
    assert engine.calls == 1
    with services.factory.open() as repo:
        checks = repo.rechecks(project.id, finding.id)
        assert len(checks) == 2
        assert all(c.outcome == "RESOLVED" for c in checks)
        assert set(checks[0].evidence_ids).isdisjoint(checks[1].evidence_ids)
    engine.version = "2"
    services.rechecks.request(project.id, finding.id, admin, operation_id="version-2")
    assert engine.calls == 2


def test_manual_recheck_only_targets_requested_finding(services, admin):
    project, _, _, first, _, draft = setup_finding(services, admin)
    second = services.findings.create(project.id, draft, admin)
    services.findings.decide(project.id, second.id, FindingDecision(decision="CONFIRMED"), admin)
    services.rechecks.request(project.id, first.id, admin)
    with services.factory.open() as repo:
        assert len(repo.rechecks(project.id, first.id)) == 1
        assert repo.rechecks(project.id, second.id) == []


def test_cancel_resume_fences_old_generation_and_cache(services, admin, client):
    project, source, _, finding, _, _ = setup_finding(services, admin)
    engine = CheckEngine(services)

    def cancel(_):
        with services.factory.open() as repo:
            check = repo.rechecks(project.id, finding.id)[0]
        services.coordination.cancel(check.id, admin)

    engine.during = cancel
    services.rechecks.capabilities[engine.name] = engine
    services.sources.upload(project.id, source.id, "r2.ifc", b"r2", admin)
    assert not list((services.settings.data_dir / "files/derived").glob("*"))
    with services.factory.open() as repo:
        check = repo.rechecks(project.id, finding.id)[0]
    engine.during = lambda _: None
    response = client.post(f"/api/runs/{check.id}/resume")
    assert response.status_code == 202, response.text
    assert response.json()["generation"] == 1
    services.rechecks.process(check.id, generation=0)
    with services.factory.open() as repo:
        assert repo.recheck(project.id, check.id).outcome == "RESOLVED"
    assert engine.calls == 2


def test_reject_engine_wrong_provenance_without_cache(services, admin, monkeypatch):
    project, source, r1, finding, _, _ = setup_finding(services, admin)
    engine = CheckEngine(services)
    original = engine.check

    def wrong(request):
        result = original(request)
        return result.model_copy(
            update={
                "evidence": (result.evidence[0].model_copy(update={"source_revision_id": r1.id}),)
            }
        )

    monkeypatch.setattr(engine, "check", wrong)
    services.rechecks.capabilities[engine.name] = engine
    with pytest.raises(Conflict):
        services.sources.upload(project.id, source.id, "r2.ifc", b"r2", admin)
    assert not list((services.settings.data_dir / "files/derived").glob("*"))
    with services.factory.open() as repo:
        check = repo.rechecks(project.id, finding.id)[0]
        assert check.outcome is None and not check.evidence_ids
        assert repo.run(check.id).status == "FAILED"


def test_newer_revision_cannot_be_closed_using_old_resolution(services, admin):
    project, source, _, finding, _, _ = setup_finding(services, admin)
    engine = CheckEngine(services)
    services.rechecks.capabilities[engine.name] = engine
    services.sources.upload(project.id, source.id, "r2.ifc", b"r2", admin)
    with services.factory.open() as repo:
        old = repo.rechecks(project.id, finding.id)[0]
    services.sources.upload(project.id, source.id, "r3.ifc", b"r3", admin)
    with pytest.raises(Conflict, match="superseded"):
        services.findings.decide(
            project.id, finding.id, FindingDecision(decision="CLOSED", recheck_id=old.id), admin
        )


def test_original_bytes_shared_without_sharing_revision_identity(services, admin):
    project, source, r1, _, _, _ = setup_finding(services, admin)
    other = services.sources.create(project.id, CreateProjectSource(name="Copy", kind="BIM"), admin)
    copy = services.sources.upload(project.id, other.id, "copy.ifc", b"r1", admin).revision
    assert copy.id != r1.id and copy.storage_key == r1.storage_key
    assert services.sources.content(project.id, source.id, r1.id, admin)[1] == b"r1"


def test_resolution_never_promotes_baseline_implicitly(services, admin):
    project, source, r1, finding, _, _ = setup_finding(services, admin)
    b1 = services.baselines.create(
        project.id,
        CreateBaseline(name="B1", entries=(BaselineEntry(source_id=source.id, revision_id=r1.id),)),
        admin,
    )
    engine = CheckEngine(services)
    services.rechecks.capabilities[engine.name] = engine
    r2 = services.sources.upload(project.id, source.id, "r2.ifc", b"r2", admin).revision
    with services.factory.open() as repo:
        check = repo.rechecks(project.id, finding.id)[0]
        assert repo.latest_baseline(project.id) == b1
    services.findings.decide(
        project.id, finding.id, FindingDecision(decision="CLOSED", recheck_id=check.id), admin
    )
    with services.factory.open() as repo:
        assert repo.latest_baseline(project.id) == b1
    b2 = services.baselines.create(
        project.id,
        CreateBaseline(name="B2", entries=(BaselineEntry(source_id=source.id, revision_id=r2.id),)),
        admin,
    )
    assert b2.entries[0].revision_id == r2.id


def test_binary_cache_integrity_and_key_invalidation(services):
    cache = services.artifacts
    key = cache.key("engine", "1", ("a", "b"), {"scale": 1})
    assert cache.read(key) is None
    cache.write(key, b"\x00\xff\x80")
    assert cache.read(key) == b"\x00\xff\x80"
    assert key != cache.key("engine", "1", ("b", "a"), {"scale": 1})
    assert key != cache.key("engine", "1", ("a", "b"), {"scale": 2})
    services.storage.put(key, b'{"payload":"AA==","sha256":"wrong"}')
    with pytest.raises(Conflict, match="integrity"):
        cache.read(key)


def test_format_limits_and_viewer_contracts():
    settings = Settings()
    assert settings.upload_limit("large.IFC") > settings.upload_limit("note.txt")
    assert settings.upload_limit("drawing.pdf") < settings.max_upload_bytes
    for cls, kwargs in [
        (DrawingTarget, {"page": 1}),
        (CadTarget, {"entity_id": "A1"}),
        (BimTarget, {"global_ids": ("g",)}),
        (DocumentTarget, {"structural_path": ("sheet", "row", "cell")}),
    ]:
        target = cls(source_revision_id="r1", **kwargs)
        assert target.source_revision_id == "r1"
        with pytest.raises(ValidationError):
            cls(source_revision_id="r1", sdk_object={}, **kwargs)
    with pytest.raises(ValidationError):
        DrawingTarget(source_revision_id="r1", page=1, normalized_bbox=(0, 0, 2, 1))
    root = Path(__file__).parents[1] / "app/domain"
    forbidden = {"ifcopenshell", "docling", "dbos", "fastapi", "sqlalchemy"}
    for path in (root / "engineering.py", root / "engineering_refs.py"):
        tree = ast.parse(path.read_text())
        for node in ast.walk(tree):
            if isinstance(node, ast.ImportFrom):
                assert node.module.split(".")[0] not in forbidden
