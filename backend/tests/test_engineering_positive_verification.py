"""Positive checks must prove actual scope, retain provenance and permit only platform closure."""

import json
from types import SimpleNamespace as NS

import pytest
from app.adapters.clash_geometry_scope import GeometryRecorder
from app.adapters.engineering_capabilities import IfcClashCapability, IfcTesterCapability
from app.domain.engineering_refs import BimTarget
from test_engineering_capabilities import (
    GUID_A,
    GUID_B,
    RecordingClash,
    RecordingTester,
    clash_request,
    ids_request,
)

__all__ = ["clash_request", "ids_request"]


def passing_clash(result):
    return result.model_copy(
        update={
            "evidence": (),
            "checked_global_ids_first": (GUID_A,),
            "checked_global_ids_second": (GUID_B,),
        }
    )


def passing_ids(result):
    return result.model_copy(
        update={
            "violations": (),
            "passed_specifications": 1,
            "failed_specifications": 0,
            "applicable_entity_counts": (1,),
            "applicable_global_ids": (GUID_A,),
        }
    )


@pytest.mark.parametrize("kind", ["clash", "ids"])
def test_verified_success_has_complete_structured_evidence(kind, clash_request, ids_request):
    request, adapter, provider, transform = (
        (clash_request, RecordingClash(), IfcClashCapability, passing_clash)
        if kind == "clash"
        else (ids_request, RecordingTester(), IfcTesterCapability, passing_ids)
    )
    adapter.transform = transform
    result = provider(adapter=adapter).check(request)
    assert result.outcome == "RESOLVED" and result.expected_condition_satisfied is True
    model_inputs = [item for item in request.inputs if item.role != "requirements"]
    assert len(result.evidence) == len(model_inputs)
    for evidence, bound in zip(result.evidence, model_inputs, strict=True):
        assert evidence.quality == "structured" and evidence.element_ids == bound.target.global_ids
        assert evidence.source_id == bound.source_id
        assert evidence.source_revision_id == bound.source_revision_id
        assert evidence.source_revision == bound.sha256
        assert evidence.viewer_target == bound.target
        context = json.loads(evidence.fact.split("; inputs=")[1])
        assert context["inputs"] == [item.model_dump(mode="json") for item in request.inputs]
        assert context["expected_condition"] == request.dependency.expected_condition
        if kind == "ids":
            assert context["ids_selection"] == request.ids_requirements.model_dump(mode="json")
    assert len({e.id for e in result.evidence}) == len(result.evidence)
    assert all(e.id != "provider" for e in result.evidence)


@pytest.mark.parametrize("side", ["first", "second"])
@pytest.mark.parametrize("checked", [(), (GUID_A, GUID_B), (GUID_A, GUID_A)])
def test_partial_extra_or_duplicate_geometry_cannot_resolve(clash_request, side, checked):
    adapter = RecordingClash()
    adapter.transform = lambda result: passing_clash(result).model_copy(
        update={"checked_global_ids_" + side: checked}
    )
    result = IfcClashCapability(adapter=adapter).check(clash_request)
    assert result.outcome == "NEEDS_REVIEW" and not result.evidence
    assert result.expected_condition_satisfied is not True


@pytest.mark.parametrize(
    "fields",
    [
        {"applicable_entity_counts": ()},
        {"applicable_entity_counts": (0,), "applicable_global_ids": ()},
        {"applicable_entity_counts": (-1,)},
        {"applicable_entity_counts": (1, 1)},
        {"applicable_global_ids": (GUID_B,)},
        {"applicable_global_ids": (GUID_A, GUID_A)},
        {"applicable_global_ids": (GUID_A, GUID_B)},
        {"skipped_specifications": 1, "passed_specifications": 0},
        {"failed_specifications": 1, "passed_specifications": 0},
    ],
)
def test_missing_inconsistent_or_uncovered_ids_scope_cannot_resolve(ids_request, fields):
    adapter = RecordingTester()
    adapter.transform = lambda result: passing_ids(result).model_copy(update=fields)
    result = IfcTesterCapability(adapter=adapter).check(ids_request)
    assert result.outcome == "NEEDS_REVIEW" and not result.evidence
    assert result.expected_condition_satisfied is not True


def test_ids_model_scope_and_optional_empty_specifications(ids_request):
    inputs = list(ids_request.inputs)
    inputs[0] = inputs[0].model_copy(update={"target": BimTarget(source_revision_id="model-r1")})
    request = ids_request.model_copy(
        update={
            "inputs": tuple(inputs),
            "dependency": ids_request.dependency.model_copy(update={"target": inputs[0].target}),
        }
    )
    adapter = RecordingTester()
    adapter.transform = lambda result: passing_ids(result).model_copy(
        update={"specifications": 2, "passed_specifications": 2, "applicable_entity_counts": (1, 0)}
    )
    result = IfcTesterCapability(adapter=adapter).check(request)
    assert result.outcome == "RESOLVED" and result.evidence[0].element_ids == ()


@pytest.mark.parametrize("geometry", [NS(verts=(), faces=()), NS(verts=(1,), faces=())])
def test_tree_observation_does_not_claim_empty_geometry(geometry):
    forwarded = []
    recorder = GeometryRecorder(NS(add_element=forwarded.append))
    shape = NS(guid=GUID_A, geometry=geometry)
    recorder.add_element(shape)
    assert forwarded == [shape] and not recorder.global_ids


def test_tree_observation_retains_only_ids_not_geometry():
    forwarded = []
    recorder = GeometryRecorder(NS(add_element=forwarded.append))
    shape = NS(guid=GUID_A, geometry=NS(verts=(1, 2, 3), faces=(0, 1, 2)))
    recorder.add_element(shape)
    recorder.add_element(shape)
    assert forwarded == [shape, shape] and recorder.global_ids == {GUID_A}


def test_ids_failure_context_retains_selection_identity(ids_request):
    result = IfcTesterCapability(adapter=RecordingTester()).check(ids_request)
    context = json.loads(result.evidence[0].fact.split("; inputs=")[1])
    assert context["ids_selection"]["revision_id"] == ids_request.ids_requirements.revision_id
    assert context["ids_selection"]["source_id"] == ids_request.ids_requirements.source_id


def test_contradictory_clash_changes_cannot_generate_positive_evidence(clash_request):
    adapter = RecordingClash()
    adapter.transform = lambda result: passing_clash(result).model_copy(
        update={"changes": ("clash",)}
    )
    result = IfcClashCapability(adapter=adapter).check(clash_request)
    assert result.outcome == "NEEDS_REVIEW" and not result.evidence


@pytest.mark.parametrize(
    "kind,condition", [("clash", "Zero clashes"), ("ids", "All IDS requirements pass")]
)
def test_supported_condition_vocabulary_is_evaluated(kind, condition, clash_request, ids_request):
    request, adapter, provider, transform = (
        (clash_request, RecordingClash(), IfcClashCapability, passing_clash)
        if kind == "clash"
        else (ids_request, RecordingTester(), IfcTesterCapability, passing_ids)
    )
    request = request.model_copy(
        update={
            "dependency": request.dependency.model_copy(update={"expected_condition": condition})
        }
    )
    adapter.transform = transform
    result = provider(adapter=adapter).check(request)
    assert result.outcome == "RESOLVED" and result.expected_condition_satisfied is True


@pytest.mark.parametrize("kind", ["clash", "ids"])
def test_changed_primary_scope_is_rejected_before_sdk(kind, clash_request, ids_request):
    request, adapter, provider = (
        (clash_request, RecordingClash(), IfcClashCapability)
        if kind == "clash"
        else (ids_request, RecordingTester(), IfcTesterCapability)
    )
    changed = request.inputs[0].model_copy(
        update={"target": request.inputs[0].target.model_copy(update={"global_ids": (GUID_B,)})}
    )
    request = request.model_copy(update={"inputs": (changed, *request.inputs[1:])})
    result = provider(adapter=adapter).check(request)
    assert result.outcome == "NEEDS_REVIEW" and not result.evidence and not adapter.calls


@pytest.mark.parametrize("guids", [("not-a-guid",), (GUID_A, GUID_A), (GUID_A,) * 1001])
def test_invalid_ids_identity_scope_is_rejected_before_sdk(ids_request, guids):
    target = ids_request.inputs[0].target.model_copy(update={"global_ids": guids})
    request = ids_request.model_copy(
        update={
            "inputs": (
                ids_request.inputs[0].model_copy(update={"target": target}),
                ids_request.inputs[1],
            ),
            "dependency": ids_request.dependency.model_copy(update={"target": target}),
        }
    )
    adapter = RecordingTester()
    result = IfcTesterCapability(adapter=adapter).check(request)
    assert result.outcome == "NEEDS_REVIEW" and not result.evidence and not adapter.calls
