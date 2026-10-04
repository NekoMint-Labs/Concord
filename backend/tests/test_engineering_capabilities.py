"""Focused tests for the C-owned ReCheck capability wrappers."""

from app.adapters.engineering_capabilities import IfcClashCapability, IfcTesterCapability
from app.adapters.engineering_results import (
    ClashParameters,
    ClashRunResult,
    EngineeringEvidence,
    IDSValidationResult,
    IDSViolation,
)
from app.domain.engineering import CapabilityCheck, CapabilityCheckResult, IDSRequirementsSelection
from app.domain.engineering_refs import BimTarget, FindingDependency

GUID_A = "0JYqfQ6zP6LQxgT6eT8v1A"
GUID_B = "1JYqfQ6zP6LQxgT6eT8v1A"


def _request(inputs, data, *, condition="No clashes", ids=None):
    return CapabilityCheck(
        project_id="project",
        source_id=inputs[0].source_id,
        from_revision_id=inputs[0].from_revision_id,
        to_revision_id=inputs[0].source_revision_id,
        dependency=FindingDependency(
            source_id=inputs[0].source_id,
            source_revision_id=inputs[0].from_revision_id,
            capability="ifc-clash" if ids is None else "ifc-ids",
            expected_condition=condition,
            target=BimTarget(source_revision_id=inputs[0].source_revision_id),
            group_id=inputs[0].group_id,
            input_role=inputs[0].role,
            requirements_kind="ids" if ids else None,
        ),
        group_id=inputs[0].group_id,
        inputs=tuple(inputs),
        input_bytes=tuple(data),
        ids_requirements=ids,
    )


def _input(source, revision, role, digest, *, requirements=False):
    from app.domain.engineering import CapabilityInput

    return CapabilityInput(
        group_id="pair",
        role=role,
        source_id=source,
        from_revision_id=revision,
        source_revision_id=revision,
        sha256=digest,
        target=None,
    )


def test_ifc_clash_capability_consumes_both_inputs_and_maps_pair():
    class FakeClash:
        name = "fake"

        def run(self, first, second, **kwargs):
            assert (first, second) == (b"structure", b"mep")
            assert kwargs["source_id"] == "structure"
            assert kwargs["comparison_source_id"] == "mep"
            return ClashRunResult(
                source_id="structure",
                source_revision_id="structure-r1",
                comparison_source_id="mep",
                comparison_revision_id="mep-r1",
                source_hash="a" * 64,
                comparison_source_hash="b" * 64,
                parameters=ClashParameters(),
                cache_key="c" * 64,
                engine="fake",
                engine_version="1",
                mode="intersection",
                elapsed_seconds=0,
                evidence=(
                    EngineeringEvidence(
                        source_id="structure",
                        source_revision_id="structure-r1",
                        against_source_id="mep",
                        against_source_revision_id="mep-r1",
                        provider="fake",
                        engine_version="1",
                        element_ids=(GUID_A, GUID_B),
                        location=(1, 2, 3),
                        fact="clash",
                    ),
                ),
            )

    inputs = (
        _input("structure", "structure-r1", "structure", "a" * 64),
        _input("mep", "mep-r1", "mep", "b" * 64),
    )
    result = IfcClashCapability(adapter=FakeClash()).check(
        _request(inputs, (b"structure", b"mep"), condition="No clashes")
    )
    assert isinstance(result, CapabilityCheckResult)
    assert result.outcome == "STILL_OPEN"
    assert result.expected_condition_satisfied is False
    assert {item.source_id for item in result.evidence} == {"structure", "mep"}


def test_ifc_clash_unknown_condition_stays_reviewable():
    inputs = (
        _input("structure", "structure-r1", "structure", "a" * 64),
        _input("mep", "mep-r1", "mep", "b" * 64),
    )

    class EmptyClash:
        def run(self, first, second, **kwargs):
            return ClashRunResult(
                source_id="structure",
                source_revision_id="structure-r1",
                comparison_source_id="mep",
                comparison_revision_id="mep-r1",
                source_hash="a" * 64,
                comparison_source_hash="b" * 64,
                parameters=ClashParameters(),
                cache_key="c" * 64,
                engine="fake",
                engine_version="1",
                mode="intersection",
                elapsed_seconds=0,
            )

    result = IfcClashCapability(adapter=EmptyClash()).check(
        _request(inputs, (b"structure", b"mep"), condition="Clearance >= 100mm")
    )
    assert result.outcome == "NEEDS_REVIEW"
    assert not result.evidence


def test_ifc_tester_consumes_selected_original_requirements():
    selected = IDSRequirementsSelection(
        project_id="project",
        source_id="requirements",
        revision_id="requirements-r1",
        sha256="d" * 64,
    )

    class FakeTester:
        def validate(self, ifc, ids, **kwargs):
            assert (ifc, ids) == (b"model", b"rules")
            assert kwargs == {"source_id": "model", "source_revision_id": "model-r1"}
            return IDSValidationResult(
                source_id="model",
                source_revision_id="model-r1",
                source_hash="a" * 64,
                requirements_hash="d" * 64,
                engine="fake",
                engine_version="1",
                specifications=1,
                passed_specifications=0,
                failed_specifications=1,
                violations=(
                    IDSViolation(
                        specification="spec",
                        global_id=GUID_A,
                        reason="missing property",
                        source_id="model",
                        source_revision_id="model-r1",
                        engine="fake",
                        engine_version="1",
                    ),
                ),
            )

    inputs = (
        _input("model", "model-r1", "model", "a" * 64),
        _input("requirements", "requirements-r1", "requirements", "d" * 64),
    )
    result = IfcTesterCapability(adapter=FakeTester()).check(
        _request(
            inputs,
            (b"model", b"rules"),
            condition="No IDS violations",
            ids=selected,
        )
    )
    assert result.outcome == "STILL_OPEN"
    assert result.expected_condition_satisfied is False
    assert len(result.evidence) == 1


def test_ifc_tester_rejects_unselected_requirements():
    selected = IDSRequirementsSelection(
        project_id="project",
        source_id="requirements",
        revision_id="requirements-r1",
        sha256="d" * 64,
    )
    inputs = (
        _input("model", "model-r1", "model", "a" * 64),
        _input("requirements", "requirements-r2", "requirements", "d" * 64),
    )
    result = IfcTesterCapability(adapter=object()).check(
        _request(inputs, (b"model", b"rules"), ids=selected)
    )
    assert result.outcome == "NEEDS_REVIEW"
