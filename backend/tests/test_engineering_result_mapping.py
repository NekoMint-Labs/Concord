import pytest
from app.adapters.engineering_result_mapping import ids_publication
from app.adapters.engineering_results import IDSValidationResult, IDSViolation
from app.adapters.ifc_tester import IfcTesterAdapter
from app.domain.errors import DomainError


def test_ids_violations_map_to_hash_and_revision_bound_bim_evidence():
    result = IDSValidationResult(
        source_id="structure",
        source_revision_id="revision-2",
        source_hash="a" * 64,
        requirements_hash="c" * 64,
        engine="ifctester",
        engine_version="0.8.5",
        specifications=2,
        passed_specifications=1,
        failed_specifications=1,
        violations=(
            IDSViolation(
                specification="Beam naming",
                global_id="beam-guid",
                reason="Name must be present",
                source_id="structure",
                source_revision_id="revision-2",
                engine="ifctester",
                engine_version="0.8.5",
            ),
            IDSViolation(
                specification="Required applicability",
                reason="No matching entities",
                source_id="structure",
                source_revision_id="revision-2",
                engine="ifctester",
                engine_version="0.8.5",
            ),
        ),
    )

    publication = ids_publication(result, snapshot_id="snapshot-1", operation_id="ids-run-1")

    assert (
        ids_publication(result, snapshot_id="snapshot-1", operation_id="ids-run-1") == publication
    )
    assert publication.operation_id == "ids-run-1"
    assert publication.changes == ()
    assert len(publication.evidence) == 2
    targeted, untargeted = publication.evidence
    assert targeted.source_id == "structure"
    assert targeted.source_revision_id == "revision-2"
    assert targeted.source_revision == "a" * 64
    assert targeted.snapshot_id == "snapshot-1"
    assert targeted.provider == "ifctester/0.8.5"
    assert targeted.element_ids == ("beam-guid",)
    assert targeted.viewer_target.model_dump() == {
        "kind": "bim",
        "source_revision_id": "revision-2",
        "global_ids": ("beam-guid",),
        "viewpoint": None,
    }
    assert untargeted.viewer_target is None
    assert untargeted.element_ids == ()


@pytest.mark.parametrize(
    "field,value",
    [
        ("source_id", "another-source"),
        ("source_revision_id", "another-revision"),
        ("engine", "another-engine"),
        ("engine_version", "another-version"),
    ],
)
def test_ids_mapping_rejects_inconsistent_violation_provenance(field, value):
    result = IDSValidationResult(
        source_id="structure",
        source_revision_id="revision-2",
        source_hash="b" * 64,
        requirements_hash="c" * 64,
        engine="ifctester",
        engine_version="0.8.5",
        specifications=1,
        passed_specifications=0,
        failed_specifications=1,
        violations=(
            IDSViolation(
                specification="Beam naming",
                global_id="beam-guid",
                reason="Name must be present",
                source_id="structure",
                source_revision_id="revision-2",
                engine="ifctester",
                engine_version="0.8.5",
            ),
        ),
    )

    result = result.model_copy(
        update={"violations": (result.violations[0].model_copy(update={field: value}),)}
    )
    with pytest.raises(DomainError, match="provenance"):
        ids_publication(result, snapshot_id="snapshot-1", operation_id="ids-run-2")


def test_empty_ids_validation_does_not_create_pass_evidence():
    result = IDSValidationResult(
        source_id="structure",
        source_revision_id="revision-2",
        source_hash="a" * 64,
        requirements_hash="c" * 64,
        engine="ifctester",
        engine_version="0.8.5",
        specifications=1,
        passed_specifications=1,
        failed_specifications=0,
    )
    publication = ids_publication(result, snapshot_id="snapshot-1", operation_id="pass")
    assert publication.evidence == ()
    assert publication.changes == ()


def test_ids_mapping_rejects_output_over_platform_limit():
    violation = IDSViolation(
        specification="Naming",
        reason="Name missing",
        source_id="structure",
        source_revision_id="revision-2",
        engine="ifctester",
        engine_version="0.8.5",
    )
    result = IDSValidationResult(
        source_id="structure",
        source_revision_id="revision-2",
        source_hash="a" * 64,
        requirements_hash="c" * 64,
        engine="ifctester",
        engine_version="0.8.5",
        specifications=1,
        passed_specifications=0,
        failed_specifications=1,
        violations=(violation,) * 1001,
    )
    with pytest.raises(DomainError, match="evidence limit"):
        ids_publication(result, snapshot_id="snapshot-1", operation_id="overflow")


@pytest.mark.parametrize("source_id,revision_id", [("", "R1"), ("  ", "R1"), ("model", " ")])
def test_ids_rejects_missing_identity_before_loading_engine(source_id, revision_id):
    with pytest.raises(DomainError, match="identifiers"):
        IfcTesterAdapter().validate(
            b"model", b"ids", source_id=source_id, source_revision_id=revision_id
        )
