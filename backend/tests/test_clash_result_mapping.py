"""Pairing and provenance checks independent of the optional IFC SDK."""

import json
from datetime import UTC, datetime

import pytest
from app.adapters.clash_result_mapping import clash_publication
from app.adapters.engineering_results import ClashParameters, ClashRunResult, EngineeringEvidence
from app.domain.errors import DomainError

BEAM = "3M0KwyPFrBT9KwklhqZa8W"
DUCT = "0wJm_7P3jD4uBWYGw9xyVx"


def result():
    return ClashRunResult(
        source_id="structure",
        source_revision_id="structure-r2",
        source_hash="a" * 64,
        comparison_source_id="mep",
        comparison_revision_id="mep-r1",
        comparison_source_hash="b" * 64,
        engine="ifcclash",
        engine_version="0.8.5",
        mode="intersection",
        elapsed_seconds=0.1,
        parameters=ClashParameters(),
        cache_key="c" * 64,
        checked_at=datetime(2026, 10, 4, tzinfo=UTC),
        evidence=(
            EngineeringEvidence(
                source_id="structure",
                source_revision_id="structure-r2",
                against_source_id="mep",
                against_source_revision_id="mep-r1",
                provider="ifcclash",
                engine_version="0.8.5",
                element_ids=(BEAM, DUCT),
                location=(1.0, 2.0, 3.0),
                fact="Beam intersects duct",
            ),
        ),
    )


def publish(value):
    return clash_publication(value, snapshot_id="snapshot", operation_id="clash-operation")


def test_pair_retains_each_source_revision_hash_guid_and_detection_context():
    output = publish(result())
    assert publish(result()) == output
    assert output.changes == ()
    first, second = output.evidence
    assert first.id != second.id
    for item, source, revision, digest, guid in (
        (first, "structure", "structure-r2", "a" * 64, BEAM),
        (second, "mep", "mep-r1", "b" * 64, DUCT),
    ):
        assert item.snapshot_id == "snapshot"
        assert item.source_id == source
        assert item.source_revision_id == revision
        assert item.source_revision == digest
        assert item.element_ids == (guid,)
        assert item.viewer_target.source_revision_id == revision
        assert item.viewer_target.global_ids == (guid,)
        assert item.observed_at == result().checked_at
        assert item.provider == "ifcclash/0.8.5"
        assert item.quality == "structured"
        assert json.loads(item.location) == [1, 2, 3]
        assert "mep-r1" in item.fact and "structure-r2" in item.fact
        assert '"check_all":false' in item.fact


def test_same_guid_in_different_sources_does_not_collapse_the_pair():
    value = result()
    value = value.model_copy(
        update={"evidence": (value.evidence[0].model_copy(update={"element_ids": (BEAM, BEAM)}),)}
    )
    first, second = publish(value).evidence
    assert first.id != second.id
    assert first.source_id != second.source_id
    assert first.element_ids == second.element_ids


@pytest.mark.parametrize(
    "patch",
    [
        {"source_id": "another-source"},
        {"source_revision_id": "older"},
        {"against_source_id": "another-source"},
        {"against_source_revision_id": "newer"},
        {"provider": "unknown"},
        {"engine_version": "unknown"},
        {"quality": "inferred"},
    ],
)
def test_rejects_provenance_drift_on_either_side(patch):
    value = result()
    value = value.model_copy(update={"evidence": (value.evidence[0].model_copy(update=patch),)})
    with pytest.raises(DomainError, match="provenance"):
        publish(value)


@pytest.mark.parametrize(
    "patch",
    [
        {"element_ids": (BEAM,)},
        {"element_ids": (BEAM, "invalid")},
        {"element_ids": (BEAM, DUCT, BEAM)},
        {"location": ()},
        {"location": (1, 2)},
        {"location": (1, 2, float("nan"))},
    ],
)
def test_rejects_incomplete_or_invalid_locations(patch):
    value = result()
    value = value.model_copy(update={"evidence": (value.evidence[0].model_copy(update=patch),)})
    with pytest.raises(DomainError):
        publish(value)


def test_limit_counts_both_records_and_never_truncates_a_pair():
    value = result()
    output = publish(value.model_copy(update={"evidence": value.evidence * 500}))
    assert len(output.evidence) == len({item.id for item in output.evidence}) == 1000
    with pytest.raises(DomainError, match="evidence limit"):
        publish(value.model_copy(update={"evidence": value.evidence * 501}))


@pytest.mark.parametrize(
    "patch",
    [
        {"source_id": " "},
        {"comparison_revision_id": ""},
        {"comparison_source_id": "structure", "comparison_revision_id": "structure-r2"},
    ],
)
def test_rejects_missing_or_identical_revision_qualified_inputs(patch):
    with pytest.raises(DomainError, match="identit|distinct"):
        publish(result().model_copy(update=patch))


def test_no_clashes_does_not_create_resolution_evidence():
    assert publish(result().model_copy(update={"evidence": ()})).evidence == ()
