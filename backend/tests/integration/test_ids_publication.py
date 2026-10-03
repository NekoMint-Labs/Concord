"""Real IfcTester output published through the existing platform boundary."""

import hashlib
from pathlib import Path

import pytest
from app.adapters.engineering_result_mapping import ids_publication
from app.adapters.ifc_tester import IfcTesterAdapter
from app.domain.errors import Conflict
from app.domain.models import ProjectSnapshot
from app.domain.project_lifecycle import CreateProject
from app.domain.project_sources import CreateProjectSource

FIXTURE = Path(__file__).resolve().parents[3] / "fixtures" / "coordination-project"
BEAM = "3M0KwyPFrBT9KwklhqZa8W"


def validate_uploaded_model(services, admin):
    pytest.importorskip("ifctester")
    project = services.projects.create(CreateProject(name="Real IDS publication"), admin)
    source = services.sources.create(
        project.id, CreateProjectSource(name="Structure", kind="BIM"), admin
    )
    content = (FIXTURE / "R2/structure.ifc").read_bytes()
    requirements = (FIXTURE / "R1/requirements.ids").read_bytes()
    # Exercise a real donor requirement failure without inventing a detector result.
    requirements = requirements.replace(b"BEAM-01", b"REQUIRED-NAME")
    assert b"REQUIRED-NAME" in requirements
    revision = services.sources.upload(
        project.id, source.id, "structure.ifc", content, admin
    ).revision
    with services.factory.open(project.id, write=True) as repo:
        state = repo.state(project.id)
        snapshot = ProjectSnapshot(
            project_id=project.id, version=state.version, sources=state.sources
        )
        repo.save_snapshot(snapshot)
    result = IfcTesterAdapter().validate(
        content, requirements, source_id=source.id, source_revision_id=revision.id
    )
    assert result.source_hash == revision.sha256
    assert result.requirements_hash == hashlib.sha256(requirements).hexdigest()
    assert result.failed_specifications == 1
    assert result.violations[0].global_id == BEAM
    return project, source, snapshot, result


@pytest.mark.integration
def test_real_ids_violation_persists_and_retry_does_not_duplicate(services, admin):
    project, source, snapshot, result = validate_uploaded_model(services, admin)
    publication = ids_publication(result, snapshot_id=snapshot.id, operation_id="real-ids")
    services.engineering.publish(project.id, publication)
    services.engineering.publish(
        project.id, ids_publication(result, snapshot_id=snapshot.id, operation_id="real-ids")
    )
    with services.factory.open() as repo:
        evidence = repo.evidence(project.id, source.id)
        assert tuple(evidence) == publication.evidence
        assert evidence[0].source_revision_id == result.source_revision_id
        assert evidence[0].viewer_target.global_ids == (BEAM,)
        assert repo.findings(project.id) == []


@pytest.mark.integration
def test_real_ids_publication_rejects_incorrect_ifc_hash(services, admin):
    project, source, snapshot, result = validate_uploaded_model(services, admin)
    publication = ids_publication(
        result.model_copy(update={"source_hash": "0" * 64}),
        snapshot_id=snapshot.id,
        operation_id="wrong-hash",
    )
    with pytest.raises(Conflict, match="hash"):
        services.engineering.publish(project.id, publication)
    with services.factory.open() as repo:
        assert repo.evidence(project.id, source.id) == []
        assert repo.publication_digest(project.id, "wrong-hash") is None
