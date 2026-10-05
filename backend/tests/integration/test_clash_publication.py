"""Real two-source IfcClash output through the existing atomic publisher."""

from pathlib import Path

import pytest
from app.adapters.clash_result_mapping import clash_publication
from app.adapters.ifc_clash import IfcClashAdapter
from app.domain.errors import Conflict
from app.domain.models import ProjectSnapshot
from app.domain.project_lifecycle import CreateProject
from app.domain.project_sources import CreateProjectSource

FIXTURE = Path(__file__).resolve().parents[3] / "fixtures" / "coordination-project"
BEAM = "3M0KwyPFrBT9KwklhqZa8W"
DUCT = "0wJm_7P3jD4uBWYGw9xyVx"


def uploaded_pair(services, admin):
    pytest.importorskip("ifcclash")
    project = services.projects.create(CreateProject(name="Real clash pair"), admin)
    sources, revisions, inputs = [], [], []
    for name, path in (("Structure", "R2/structure.ifc"), ("MEP", "R1/mep.ifc")):
        source = services.sources.create(
            project.id, CreateProjectSource(name=name, kind="BIM"), admin
        )
        content = (FIXTURE / path).read_bytes()
        revision = services.sources.upload(
            project.id, source.id, path.split("/")[-1], content, admin
        ).revision
        sources.append(source)
        revisions.append(revision)
        inputs.append(content)
    with services.factory.open(project.id, write=True) as repo:
        state = repo.state(project.id)
        snapshot = ProjectSnapshot(
            project_id=project.id, version=state.version, sources=state.sources
        )
        repo.save_snapshot(snapshot)
    result = IfcClashAdapter().run(
        *inputs,
        source_id=sources[0].id,
        source_revision_id=revisions[0].id,
        comparison_source_id=sources[1].id,
        comparison_revision_id=revisions[1].id,
        selector_first="IfcBeam",
        selector_second="IfcDuctSegment",
    )
    assert len(result.evidence) == 1
    assert result.source_hash == revisions[0].sha256
    assert result.comparison_source_hash == revisions[1].sha256
    return project, sources, revisions, snapshot, result


@pytest.mark.integration
def test_real_clash_publishes_both_sides_atomically_and_retries_without_duplicates(services, admin):
    project, sources, revisions, snapshot, result = uploaded_pair(services, admin)
    output = clash_publication(result, snapshot_id=snapshot.id, operation_id="real-clash")
    services.engineering.publish(project.id, output)
    services.engineering.publish(project.id, output)
    with services.factory.open() as repo:
        assert len(repo.evidence(project.id)) == 2
        for source, revision, guid in zip(sources, revisions, (BEAM, DUCT), strict=True):
            (item,) = repo.evidence(project.id, source.id)
            assert item.source_revision_id == revision.id
            assert item.source_revision == revision.sha256
            assert item.viewer_target.global_ids == (guid,)
        assert repo.findings(project.id) == []
        assert repo.publication_digest(project.id, "real-clash") is not None
    # A second engine run is a new observation, not a replay of the prior operation.
    changed = output.model_copy(
        update={
            "evidence": (
                output.evidence[0].model_copy(update={"fact": "Changed detector result"}),
                output.evidence[1],
            )
        }
    )
    with pytest.raises(Conflict, match="different content"):
        services.engineering.publish(project.id, changed)


@pytest.mark.integration
@pytest.mark.parametrize(
    "patch",
    [
        {"comparison_source_hash": "0" * 64},
        {"comparison_revision_id": "missing-revision"},
    ],
)
def test_invalid_second_input_rolls_back_first_evidence_and_publication(services, admin, patch):
    project, sources, revisions, snapshot, result = uploaded_pair(services, admin)
    # Keep adapter-local row provenance internally consistent; the platform must
    # reject a hash/revision which does not belong to the actual project source.
    if "comparison_revision_id" in patch:
        patch = {
            **patch,
            "evidence": (
                result.evidence[0].model_copy(
                    update={
                        "against_source_revision_id": patch["comparison_revision_id"],
                    }
                ),
            ),
        }
    output = clash_publication(
        result.model_copy(update=patch), snapshot_id=snapshot.id, operation_id="bad-second"
    )
    from app.domain.errors import NotFound

    with pytest.raises((Conflict, NotFound)):
        services.engineering.publish(project.id, output)
    with services.factory.open() as repo:
        assert repo.evidence(project.id) == []
        assert repo.publication_digest(project.id, "bad-second") is None


@pytest.mark.integration
def test_clash_cache_identity_binds_both_bytes_engine_and_detection_parameters(
    services, admin, monkeypatch
):
    project, sources, revisions, snapshot, result = uploaded_pair(services, admin)
    adapter = IfcClashAdapter()
    first = (FIXTURE / "R2/structure.ifc").read_bytes()
    second = (FIXTURE / "R1/mep.ifc").read_bytes()
    context = dict(
        source_id=sources[0].id,
        source_revision_id=revisions[0].id,
        comparison_source_id=sources[1].id,
        comparison_revision_id=revisions[1].id,
        selector_first="IfcBeam",
        selector_second="IfcDuctSegment",
    )
    repeat = adapter.run(first, second, **context)
    assert repeat.cache_key == result.cache_key
    assert repeat.parameters == result.parameters
    tolerance = adapter.run(first, second, tolerance=0.01, **context)
    newer_mep = adapter.run(first, (FIXTURE / "R3/mep.ifc").read_bytes(), **context)
    older_structure = adapter.run((FIXTURE / "R1/structure.ifc").read_bytes(), second, **context)
    assert (
        len({result.cache_key, tolerance.cache_key, newer_mep.cache_key, older_structure.cache_key})
        == 4
    )
    monkeypatch.setattr("app.adapters.ifc_clash._package_version", lambda _name: "next-engine")
    versioned_engine = adapter.run(first, second, **context)
    assert versioned_engine.cache_key != result.cache_key
    assert newer_mep.evidence == ()
    assert (
        clash_publication(newer_mep, snapshot_id=snapshot.id, operation_id="rerouted").evidence
        == ()
    )
    # This is adapter qualification, not a runtime ReCheck or closure assertion.
