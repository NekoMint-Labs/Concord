"""Validate the persisted input boundary before invoking engineering SDKs."""

import hashlib
import json
import re

from app.domain.engineering import CapabilityCheck
from app.domain.engineering_refs import BimTarget
from app.domain.errors import DomainError


def capability_version(engine: str, configuration: dict, *, adapter_version: str) -> str:
    """Bind adapter semantics and settings to A's existing provider-version cache key."""
    digest = hashlib.sha256(
        json.dumps(configuration, sort_keys=True, separators=(",", ":"), allow_nan=False).encode()
    ).hexdigest()
    return f"{engine}/{adapter_version}/{digest}"


def validate_inputs(request: CapabilityCheck, *, capability: str, models: int) -> None:
    if request.dependency.capability != capability:
        raise DomainError("Engineering request names a different capability")
    if len(request.inputs) != models + (capability == "ifc-ids"):
        raise DomainError("Engineering request does not contain the exact required input set")
    if len(request.input_bytes) != len(request.inputs):
        raise DomainError("Engineering original bytes are not aligned with persisted inputs")
    if request.group_id != request.dependency.group_id:
        raise DomainError("Engineering request and dependency groups differ")
    group = request.group_id or request.inputs[0].group_id
    if not group.strip() or any(item.group_id != group for item in request.inputs):
        raise DomainError("Engineering inputs do not belong to one persisted group")
    if len({item.role for item in request.inputs}) != len(request.inputs):
        raise DomainError("Engineering input roles must be distinct")
    if len({item.source_id for item in request.inputs}) != len(request.inputs):
        raise DomainError("Engineering input sources must be distinct")
    for item, content in zip(request.inputs, request.input_bytes, strict=True):
        if not all(
            value.strip()
            for value in (item.role, item.source_id, item.from_revision_id, item.source_revision_id)
        ):
            raise DomainError("Engineering input identities must be nonempty")
        if not content or hashlib.sha256(content).hexdigest() != item.sha256:
            raise DomainError("Engineering original bytes differ from their persisted hash")
        if item.role == "requirements":
            if item.target is not None:
                raise DomainError("IDS requirements input must not have a model target")
            continue
        if not isinstance(item.target, BimTarget):
            raise DomainError("Engineering model inputs require revision-bound BIM targets")
        if item.target.source_revision_id != item.source_revision_id:
            raise DomainError("Engineering target differs from its bound model revision")
        if item.target.viewpoint is not None:
            raise DomainError("Reserved BIM viewpoint tuples are unsupported")
    first = request.inputs[0]
    if (
        first.role == "requirements"
        or request.source_id != first.source_id
        or request.from_revision_id != first.from_revision_id
        or request.to_revision_id != first.source_revision_id
        or request.dependency.source_id != first.source_id
        or request.dependency.source_revision_id != first.from_revision_id
        or (request.group_id and request.dependency.input_role != first.role)
    ):
        raise DomainError("Engineering primary context differs from its bound model input")


def clash_selectors(request: CapabilityCheck) -> tuple[str, str]:
    """Use the donor's exact GlobalId filters; never implicitly rerun whole models."""
    if request.group_id is None:
        raise DomainError("IfcClash requires a grouped pair of model inputs")
    if request.ids_requirements is not None or request.dependency.requirements_kind is not None:
        raise DomainError("IfcClash does not consume IDS requirements")
    selectors = []
    for item in request.inputs:
        target = item.target
        if item.role == "requirements" or not isinstance(target, BimTarget):
            raise DomainError("IfcClash requires two model roles")
        guids = target.global_ids
        if (
            not guids
            or len(guids) > 1000
            or len(set(guids)) != len(guids)
            or any(not re.fullmatch(r"[0-3][0-9A-Za-z_$]{21}", guid) for guid in guids)
        ):
            raise DomainError("IfcClash requires bounded, distinct valid target GlobalIds")
        # IfcOpenShell selector '+' unions exact GlobalIds; no custom query language.
        selectors.append(" + ".join(sorted(guids)))
    return selectors[0], selectors[1]


def validate_ids_selection(request: CapabilityCheck) -> None:
    selection = request.ids_requirements
    if request.dependency.requirements_kind != "ids" or selection is None:
        raise DomainError("IfcTester requires explicitly selected IDS requirements")
    model, rules = request.inputs
    if model.role == "requirements" or rules.role != "requirements":
        raise DomainError("IfcTester requires one model followed by its IDS input")
    if (
        selection.project_id != request.project_id
        or rules.source_id != selection.source_id
        or rules.source_revision_id != selection.revision_id
        or rules.from_revision_id != selection.revision_id
        or rules.sha256 != selection.sha256
    ):
        raise DomainError("IfcTester requirements differ from the selected project/revision/hash")
