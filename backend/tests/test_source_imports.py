"""Actual source versions and import jobs share durable identity and transactions."""

import pytest
from app.domain.agent import AgentRequest, AgentScope
from app.domain.baselines import BaselineEntry, CreateBaseline
from app.domain.errors import Conflict, ProviderError
from app.domain.jobs import BIMImport
from app.domain.project_sources import CreateProjectSource
from test_agent_controls import project


def test_document_import_reuses_original_and_exposes_scoped_citable_text(services, admin):
    identity, _ = project(services, admin)
    source = services.sources.create(
        identity, CreateProjectSource(name="Note", kind="DOCUMENT"), admin
    )
    revision = services.sources.upload(
        identity, source.id, "note.md", b"# Field note\nVentilation clearance is 200 mm.", admin
    ).revision
    with services.factory.open() as repo:
        before = repo.state(identity).version
    run = services.source_imports.enqueue(identity, source.id, revision.id, admin)
    assert run.status == "COMPLETED"
    assert services.source_imports.enqueue(identity, source.id, revision.id, admin).id == run.id
    with services.factory.open() as repo:
        assert repo.job(run.id).request.object_key == revision.storage_key
        assert repo.job(run.id).result["source_revision_id"] == revision.id
        assert repo.state(identity).version == before + 1
        assert repo.source_revision(identity, source.id, revision.id) == revision
        assert all(e.source_id == source.id for e in repo.evidence(identity))
    report = services.investigations.ask(
        identity,
        AgentRequest(instruction="Explain this document", scope=AgentScope(source_id=source.id)),
    )
    assert any("Ventilation" in item.fact for item in report.evidence)


def test_real_ifc_revision_import_and_baseline_remain_independent(services, admin):
    ifc = pytest.importorskip("ifcopenshell")
    model = ifc.file(schema="IFC4")
    model.create_entity("IfcProject", GlobalId=ifc.guid.new(), Name="Campus")
    element_id = ifc.guid.new()
    model.create_entity("IfcWall", GlobalId=element_id, Name="Campus wall")
    identity, _ = project(services, admin)
    source = services.sources.create(identity, CreateProjectSource(name="Model", kind="BIM"), admin)
    r1 = services.sources.upload(
        identity, source.id, "r1.ifc", model.to_string().encode(), admin
    ).revision
    baseline = services.baselines.create(
        identity,
        CreateBaseline(name="B1", entries=(BaselineEntry(source_id=source.id, revision_id=r1.id),)),
        admin,
    )
    run1 = services.source_imports.enqueue(identity, source.id, r1.id, admin)
    model.by_guid(element_id).Name = "Revised wall"
    r2 = services.sources.upload(
        identity, source.id, "r2.ifc", model.to_string().encode(), admin
    ).revision
    run2 = services.source_imports.enqueue(identity, source.id, r2.id, admin)
    with services.factory.open() as repo:
        index = repo.bim_index(identity)
        assert run1.id != run2.id and run2.status == "COMPLETED"
        assert index.source_revision_id == r2.id and index.source_id == source.id
        assert index.elements[0]["id"] == element_id
        assert repo.latest_baseline(identity) == baseline
        assert repo.source_revision(identity, source.id, r1.id) == r1


def test_source_identity_and_corrupt_original_are_rejected(services, admin):
    identity, _ = project(services, admin)
    source = services.sources.create(identity, CreateProjectSource(name="Model", kind="BIM"), admin)
    revision = services.sources.upload(
        identity, source.id, "model.ifc", b"stored bytes", admin
    ).revision
    forged = BIMImport(
        source_id=source.id,
        source_revision_id=revision.id,
        filename=revision.original_filename,
        object_key="another-object",
        content_hash=revision.sha256,
    )
    with pytest.raises(Conflict, match="immutable"):
        services.jobs.enqueue(identity, forged, admin)
    services.storage.put(revision.storage_key, b"corrupt")
    with pytest.raises(ProviderError, match="hash"):
        services.source_imports.enqueue(identity, source.id, revision.id, admin)
    with services.factory.open() as repo:
        assert repo.bim_index(identity) is None
