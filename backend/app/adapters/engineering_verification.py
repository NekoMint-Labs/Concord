"""Truthful positive verification drafts for the existing platform Evidence boundary."""

import json
from uuid import NAMESPACE_URL, uuid5

from app.adapters.engineering_results import ClashRunResult, IDSValidationResult
from app.domain.engineering import CapabilityCheck
from app.domain.engineering_refs import BimTarget
from app.domain.errors import DomainError
from app.domain.models import Evidence


def input_context(request: CapabilityCheck) -> str:
    return json.dumps(
        {
            "project_id": request.project_id,
            "group_id": request.group_id,
            "expected_condition": request.dependency.expected_condition,
            "inputs": [item.model_dump(mode="json") for item in request.inputs],
            "ids_selection": request.ids_requirements.model_dump(mode="json")
            if request.ids_requirements
            else None,
        },
        sort_keys=True,
        separators=(",", ":"),
    )


def clash_verification(request: CapabilityCheck, result: ClashRunResult) -> tuple[Evidence, ...]:
    if result.evidence or result.changes:
        raise DomainError("Positive clash verification requires no detected results")
    scopes = (result.checked_global_ids_first, result.checked_global_ids_second)
    for item, checked in zip(request.inputs, scopes, strict=True):
        target = item.target
        if (
            not isinstance(target, BimTarget)
            or not checked
            or len(set(checked)) != len(checked)
            or set(checked) != set(target.global_ids)
        ):
            raise DomainError("IfcClash did not verify geometry for the complete target set")
    fact = (
        json.dumps(
            {
                "verification": "No clashes",
                "mode": result.mode,
                "parameters": result.parameters.model_dump(mode="json"),
                "checked_global_ids": scopes,
                "clash_count": 0,
                "elapsed_seconds": result.elapsed_seconds,
            },
            sort_keys=True,
        )
        + "; inputs="
        + input_context(request)
    )
    return tuple(
        _evidence(item, result.engine, result.engine_version, result.checked_at, fact)
        for item in request.inputs
    )


def ids_verification(request: CapabilityCheck, result: IDSValidationResult) -> tuple[Evidence, ...]:
    counts, guids = result.applicable_entity_counts, result.applicable_global_ids
    model = request.inputs[0]
    target = model.target
    if (
        result.violations
        or result.specifications < 1
        or result.passed_specifications != result.specifications
        or result.failed_specifications != 0
        or result.skipped_specifications != 0
        or len(counts) != result.specifications
        or any(count < 0 for count in counts)
        or sum(counts) < 1
        or len(set(guids)) != len(guids)
        or len(guids) > sum(counts)
        or not isinstance(target, BimTarget)
        or not set(target.global_ids).issubset(guids)
    ):
        raise DomainError("IfcTester did not verify applicable requirements for the target scope")
    fact = (
        json.dumps(
            {
                "verification": "All IDS requirements pass",
                "specifications": result.specifications,
                "passed_specifications": result.passed_specifications,
                "failed_specifications": 0,
                "skipped_specifications": 0,
                "applicable_entity_counts": counts,
                "target_global_ids": target.global_ids,
                "requirements_sha256": result.requirements_hash,
            },
            sort_keys=True,
        )
        + "; inputs="
        + input_context(request)
    )
    return (_evidence(model, result.engine, result.engine_version, result.validated_at, fact),)


def _evidence(item, engine, version, observed_at, fact) -> Evidence:
    return Evidence(
        id=str(uuid5(NAMESPACE_URL, json.dumps(["concord:verification", fact, item.source_id]))),
        snapshot_id="provider",
        provider=f"{engine}/{version}",
        source_id=item.source_id,
        source_revision_id=item.source_revision_id,
        source_revision=item.sha256,
        observed_at=observed_at,
        element_ids=item.target.global_ids,
        fact=fact,
        quality="structured",
        viewer_target=item.target,
    )
