"""Capability qualification, using deterministic results only for boundary failures."""

import hashlib

import pytest
from app.adapters.engineering_capabilities import IfcClashCapability, IfcTesterCapability
from app.adapters.engineering_results import (
    ClashParameters,
    ClashRunResult,
    EngineeringEvidence,
    IDSValidationResult,
    IDSViolation,
)
from app.domain.engineering import CapabilityCheck, CapabilityInput, IDSRequirementsSelection
from app.domain.engineering_refs import BimTarget, FindingDependency

GUID_A = "0JYqfQ6zP6LQxgT6eT8v1A"
GUID_B = "1JYqfQ6zP6LQxgT6eT8v1A"


def input_for(source, revision, role, content, *, group="pair", guids=()):
    return CapabilityInput(
        group_id=group,
        role=role,
        source_id=source,
        from_revision_id=revision,
        source_revision_id=revision,
        sha256=hashlib.sha256(content).hexdigest(),
        target=None
        if role == "requirements"
        else BimTarget(
            source_revision_id=revision,
            global_ids=guids,
        ),
    )


def request_for(inputs, data, *, condition="No clashes", ids=None):
    first = inputs[0]
    return CapabilityCheck(
        project_id="project",
        source_id=first.source_id,
        from_revision_id=first.from_revision_id,
        to_revision_id=first.source_revision_id,
        dependency=FindingDependency(
            source_id=first.source_id,
            source_revision_id=first.from_revision_id,
            capability="ifc-clash" if ids is None else "ifc-ids",
            expected_condition=condition,
            target=first.target,
            group_id=first.group_id,
            input_role=first.role,
            requirements_kind="ids" if ids else None,
        ),
        group_id=first.group_id,
        inputs=tuple(inputs),
        input_bytes=tuple(data),
        ids_requirements=ids,
    )


@pytest.fixture
def clash_request():
    data = (b"structure", b"mep")
    inputs = (
        input_for("structure", "structure-r1", "structure", data[0], guids=(GUID_A,)),
        input_for("mep", "mep-r1", "mep", data[1], guids=(GUID_B,)),
    )
    return request_for(inputs, data)


@pytest.fixture
def ids_request():
    data = (b"model", b"rules")
    inputs = (
        input_for("model", "model-r1", "model", data[0], guids=(GUID_A,)),
        input_for("requirements", "requirements-r1", "requirements", data[1]),
    )
    selection = IDSRequirementsSelection(
        project_id="project",
        source_id=inputs[1].source_id,
        revision_id=inputs[1].source_revision_id,
        sha256=inputs[1].sha256,
    )
    return request_for(inputs, data, condition="No IDS violations", ids=selection)


class RecordingClash:
    def __init__(self):
        self.calls = []
        self.transform = lambda result: result

    def run(self, first, second, **kwargs):
        self.calls.append((first, second, kwargs))
        result = ClashRunResult(
            source_id=kwargs["source_id"],
            source_revision_id=kwargs["source_revision_id"],
            comparison_source_id=kwargs["comparison_source_id"],
            comparison_revision_id=kwargs["comparison_revision_id"],
            source_hash=hashlib.sha256(first).hexdigest(),
            comparison_source_hash=hashlib.sha256(second).hexdigest(),
            parameters=ClashParameters(
                **{
                    k: v
                    for k, v in kwargs.items()
                    if k
                    in (
                        "selector_first",
                        "selector_second",
                        "tolerance",
                        "clearance",
                        "allow_touching",
                        "check_all",
                    )
                }
            ),
            cache_key="c" * 64,
            engine="fake",
            engine_version="1",
            mode=kwargs["mode"],
            elapsed_seconds=0,
            evidence=(
                EngineeringEvidence(
                    source_id=kwargs["source_id"],
                    source_revision_id=kwargs["source_revision_id"],
                    against_source_id=kwargs["comparison_source_id"],
                    against_source_revision_id=kwargs["comparison_revision_id"],
                    provider="fake",
                    engine_version="1",
                    element_ids=(GUID_A, GUID_B),
                    location=(1, 2, 3),
                    fact="clash",
                ),
            ),
        )
        return self.transform(result)


class RecordingTester:
    def __init__(self):
        self.calls = []
        self.transform = lambda result: result

    def validate(self, ifc, ids, **kwargs):
        self.calls.append((ifc, ids, kwargs))
        return self.transform(
            IDSValidationResult(
                source_id=kwargs["source_id"],
                source_revision_id=kwargs["source_revision_id"],
                source_hash=hashlib.sha256(ifc).hexdigest(),
                requirements_hash=hashlib.sha256(ids).hexdigest(),
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
                        source_id=kwargs["source_id"],
                        source_revision_id=kwargs["source_revision_id"],
                        engine="fake",
                        engine_version="1",
                    ),
                ),
            )
        )


def test_clash_consumes_targeted_original_pair(clash_request):
    adapter = RecordingClash()
    result = IfcClashCapability(adapter=adapter).check(clash_request)
    first, second, settings = adapter.calls[0]
    assert (first, second) == clash_request.input_bytes
    assert settings["selector_first"] == GUID_A and settings["selector_second"] == GUID_B
    assert result.outcome == "STILL_OPEN" and result.expected_condition_satisfied is False
    assert {item.source_id for item in result.evidence} == {"structure", "mep"}
    for item, bound in zip(result.evidence, clash_request.inputs, strict=True):
        assert item.source_revision_id == bound.source_revision_id
        assert item.source_revision == bound.sha256


def test_ids_consumes_selected_originals(ids_request):
    adapter = RecordingTester()
    result = IfcTesterCapability(adapter=adapter).check(ids_request)
    assert adapter.calls == [
        (
            b"model",
            b"rules",
            {
                "source_id": "model",
                "source_revision_id": "model-r1",
            },
        )
    ]
    assert result.outcome == "STILL_OPEN" and result.expected_condition_satisfied is False
    assert len(result.evidence) == 1


@pytest.mark.parametrize("kind", ["clash", "ids"])
def test_unknown_conditions_never_resolve(kind, clash_request, ids_request):
    request, adapter, provider = (
        (clash_request, RecordingClash(), IfcClashCapability)
        if kind == "clash"
        else (ids_request, RecordingTester(), IfcTesterCapability)
    )
    request = request.model_copy(
        update={
            "dependency": request.dependency.model_copy(
                update={"expected_condition": "Clearance >= 100mm"},
            )
        }
    )
    result = provider(adapter=adapter).check(request)
    assert result.outcome == "NEEDS_REVIEW" and not result.evidence


@pytest.mark.parametrize("kind", ["clash", "ids"])
def test_empty_engine_output_is_not_resolution(kind, clash_request, ids_request):
    if kind == "clash":
        adapter = RecordingClash()
        adapter.transform = lambda result: result.model_copy(update={"evidence": ()})
        result = IfcClashCapability(adapter=adapter).check(clash_request)
    else:
        adapter = RecordingTester()
        adapter.transform = lambda result: result.model_copy(
            update={
                "violations": (),
                "failed_specifications": 0,
                "passed_specifications": 1,
            }
        )
        result = IfcTesterCapability(adapter=adapter).check(ids_request)
    assert result.outcome == "NEEDS_REVIEW" and not result.evidence
    assert result.expected_condition_satisfied is not True
