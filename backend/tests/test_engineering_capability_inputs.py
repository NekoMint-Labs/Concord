"""Fail-closed request and result boundaries for engineering providers."""

import pytest
from app.adapters.engineering_capabilities import IfcClashCapability, IfcTesterCapability
from app.domain.engineering_refs import DocumentTarget
from app.domain.errors import CapabilityUnavailable, DomainError, ProviderError
from test_engineering_capabilities import (
    GUID_B,
    RecordingClash,
    RecordingTester,
    clash_request,
    ids_request,
)

# Imported fixtures intentionally qualify the same canonical inputs in both suites.
__all__ = ["clash_request", "ids_request"]


def changed_input(request, index, **fields):
    values = list(request.inputs)
    values[index] = values[index].model_copy(update=fields)
    return request.model_copy(update={"inputs": tuple(values)})


@pytest.mark.parametrize(
    "fault",
    [
        "capability",
        "extra-input",
        "missing-input",
        "bytes",
        "group",
        "dependency-group",
        "role",
        "source",
        "empty-role",
        "empty-revision",
        "hash",
        "empty-bytes",
        "target-kind",
        "target-revision",
        "viewpoint",
        "primary",
        "primary-from",
        "primary-to",
        "dependency-source",
        "dependency-from",
        "dependency-role",
        "no-target",
        "duplicate-target",
        "invalid-target",
        "oversized-target",
        "ungrouped",
        "ids-selection",
        "ids-kind",
        "requirements-role",
        "empty-group",
    ],
)
def test_clash_bad_binding_fails_before_sdk(clash_request, ids_request, fault):
    request = clash_request
    dep_changes = {
        "capability": {"capability": "different"},
        "dependency-group": {"group_id": "other"},
        "dependency-source": {"source_id": "other"},
        "dependency-from": {"source_revision_id": "other"},
        "dependency-role": {"input_role": "other"},
        "ids-kind": {"requirements_kind": "ids"},
    }
    context_changes = {
        "bytes": {"input_bytes": (b"structure",)},
        "empty-bytes": {"input_bytes": (b"", b"mep")},
        "primary": {"source_id": "other"},
        "primary-from": {"from_revision_id": "other"},
        "primary-to": {"to_revision_id": "other"},
        "ids-selection": {"ids_requirements": ids_request.ids_requirements},
        "extra-input": {"inputs": (*request.inputs, ids_request.inputs[1])},
        "missing-input": {"inputs": request.inputs[:1]},
    }
    input_changes = {
        "group": {"group_id": "other"},
        "role": {"role": "structure"},
        "source": {"source_id": "structure"},
        "empty-role": {"role": " "},
        "empty-revision": {"from_revision_id": " "},
        "hash": {"sha256": "f" * 64},
        "requirements-role": {"role": "requirements", "target": None},
    }
    target_changes = {
        "target-revision": {"source_revision_id": "other"},
        "viewpoint": {"viewpoint": (1, 2, 3, 4, 5, 6)},
        "no-target": {"global_ids": ()},
        "duplicate-target": {"global_ids": (GUID_B, GUID_B)},
        "invalid-target": {"global_ids": ("IfcWall + injected",)},
        "oversized-target": {"global_ids": tuple(str(i) for i in range(1001))},
    }
    if fault in dep_changes:
        request = request.model_copy(
            update={
                "dependency": request.dependency.model_copy(
                    update=dep_changes[fault],
                )
            }
        )
    elif fault in context_changes:
        request = request.model_copy(update=context_changes[fault])
    elif fault in input_changes:
        request = changed_input(request, 1, **input_changes[fault])
    elif fault in target_changes:
        request = changed_input(
            request,
            1,
            target=request.inputs[1].target.model_copy(
                update=target_changes[fault],
            ),
        )
    elif fault == "target-kind":
        request = changed_input(request, 1, target=DocumentTarget(source_revision_id="mep-r1"))
    elif fault == "empty-group":
        request = request.model_copy(
            update={
                "group_id": " ",
                "dependency": request.dependency.model_copy(
                    update={"group_id": " "},
                ),
                "inputs": tuple(
                    item.model_copy(update={"group_id": " "}) for item in request.inputs
                ),
            }
        )
    else:
        request = request.model_copy(
            update={
                "group_id": None,
                "dependency": request.dependency.model_copy(
                    update={"group_id": None, "input_role": None},
                ),
            }
        )
    adapter = RecordingClash()
    result = IfcClashCapability(adapter=adapter).check(request)
    assert result.outcome == "NEEDS_REVIEW" and not result.evidence
    assert not adapter.calls


@pytest.mark.parametrize(
    "fault",
    [
        "project",
        "source",
        "revision",
        "hash",
        "from",
        "target",
        "role",
        "no-selection",
        "no-kind",
        "requirements-first",
    ],
)
def test_ids_bad_selection_fails_before_sdk(ids_request, fault):
    request = ids_request
    fields = {
        "project": "project_id",
        "source": "source_id",
        "revision": "revision_id",
        "hash": "sha256",
    }
    if fault in fields:
        request = request.model_copy(
            update={
                "ids_requirements": request.ids_requirements.model_copy(
                    update={fields[fault]: "f" * 64 if fault == "hash" else "other"},
                )
            }
        )
    elif fault == "from":
        request = changed_input(request, 1, from_revision_id="other")
    elif fault == "target":
        request = changed_input(request, 1, target=request.inputs[0].target)
    elif fault == "role":
        request = changed_input(request, 1, role="rules")
    elif fault == "no-selection":
        request = request.model_copy(update={"ids_requirements": None})
    elif fault == "no-kind":
        request = request.model_copy(
            update={
                "dependency": request.dependency.model_copy(
                    update={"requirements_kind": None},
                )
            }
        )
    else:
        request = request.model_copy(
            update={"inputs": request.inputs[::-1], "input_bytes": request.input_bytes[::-1]}
        )
    adapter = RecordingTester()
    result = IfcTesterCapability(adapter=adapter).check(request)
    assert result.outcome == "NEEDS_REVIEW" and not result.evidence
    assert not adapter.calls


@pytest.mark.parametrize(
    "field,value",
    [
        ("source_id", "other"),
        ("source_revision_id", "other"),
        ("source_hash", "f" * 64),
        ("comparison_source_id", "other"),
        ("comparison_revision_id", "other"),
        ("comparison_source_hash", "f" * 64),
        ("mode", "collision"),
    ],
)
def test_clash_output_provenance_mismatch(clash_request, field, value):
    adapter = RecordingClash()
    adapter.transform = lambda result: result.model_copy(update={field: value})
    result = IfcClashCapability(adapter=adapter).check(clash_request)
    assert result.outcome == "NEEDS_REVIEW" and not result.evidence


@pytest.mark.parametrize("fault", ["settings", "scope", "row-provenance", "row-arity"])
def test_clash_wrong_scope_or_settings(clash_request, fault):
    adapter = RecordingClash()

    def transform(result):
        if fault == "settings":
            return result.model_copy(
                update={"parameters": result.parameters.model_copy(update={"tolerance": 1})}
            )
        fields = {
            "scope": {"element_ids": (GUID_B, GUID_B)},
            "row-provenance": {"quality": "extracted"},
            "row-arity": {"element_ids": (GUID_B,)},
        }[fault]
        return result.model_copy(
            update={"evidence": (result.evidence[0].model_copy(update=fields),)}
        )

    adapter.transform = transform
    result = IfcClashCapability(adapter=adapter).check(clash_request)
    assert result.outcome == "NEEDS_REVIEW" and not result.evidence


@pytest.mark.parametrize(
    "fields",
    [
        {"source_id": "other"},
        {"source_revision_id": "other"},
        {"source_hash": "f" * 64},
        {"requirements_hash": "f" * 64},
        {"specifications": 0},
        {"failed_specifications": -1},
        {"passed_specifications": 1},
        {"failed_specifications": 0, "passed_specifications": 1},
    ],
)
def test_ids_output_provenance_and_counts(ids_request, fields):
    adapter = RecordingTester()
    adapter.transform = lambda result: result.model_copy(update=fields)
    result = IfcTesterCapability(adapter=adapter).check(ids_request)
    assert result.outcome == "NEEDS_REVIEW" and not result.evidence


@pytest.mark.parametrize("error", [CapabilityUnavailable, DomainError, ProviderError])
@pytest.mark.parametrize("kind", ["clash", "ids"])
def test_engine_failures_stay_explicit(kind, error, clash_request, ids_request):
    def fail(result):
        raise error("engine failure")

    adapter, provider, request = (
        (RecordingClash(), IfcClashCapability, clash_request)
        if kind == "clash"
        else (RecordingTester(), IfcTesterCapability, ids_request)
    )
    adapter.transform = fail
    result = provider(adapter=adapter).check(request)
    assert result.outcome == "NEEDS_REVIEW" and "engine failure" in result.explanation
    assert not result.evidence


@pytest.mark.parametrize(
    "settings",
    [
        {"mode": "collision"},
        {"mode": "clearance"},
        {"tolerance": 0.01},
        {"clearance": 0.01},
        {"allow_touching": True},
        {"check_all": True},
    ],
)
def test_every_clash_setting_changes_durable_cache_version(settings):
    base = IfcClashCapability(version="test-engine")
    changed = IfcClashCapability(version="test-engine", **settings)
    assert base.version != changed.version
    assert changed.version == IfcClashCapability(version="test-engine", **settings).version
    assert base.version != IfcClashCapability(version="new-engine").version


def test_ids_cache_version_includes_adapter_and_engine(monkeypatch):
    from app.adapters import engineering_capabilities as module

    original = IfcTesterCapability(version="test-engine").version
    assert original != IfcTesterCapability(version="new-engine").version
    monkeypatch.setattr(module, "_package_version", lambda name: "new-geometry-engine")
    assert original != IfcTesterCapability(version="test-engine").version


@pytest.mark.parametrize(
    "settings", [{"mode": "invalid"}, {"tolerance": -1}, {"clearance": float("nan")}]
)
def test_invalid_clash_configuration_fails_at_construction(settings):
    with pytest.raises(ValueError):
        IfcClashCapability(**settings)
