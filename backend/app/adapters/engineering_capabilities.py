"""C-owned capability adapters for the merged ReCheck input contract.

These wrappers keep SDK calls and result normalization in the engineering adapter
boundary. Registration remains a composition-root decision; callers pass instances
to ``build_services(..., engineering_capabilities=...)`` after choosing the
capability names used by their Finding dependencies.
"""

from __future__ import annotations

import re
from dataclasses import dataclass
from typing import Protocol

from app.adapters.clash_result_mapping import clash_publication
from app.adapters.engineering_result_mapping import ids_publication
from app.adapters.engineering_results import ClashRunResult, IDSValidationResult
from app.adapters.ifc_clash import IfcClashAdapter, _package_version
from app.adapters.ifc_tester import IfcTesterAdapter, _version
from app.domain.engineering import CapabilityCheck, CapabilityCheckResult, CapabilityInput
from app.domain.errors import CapabilityUnavailable, DomainError, ProviderError


class ClashRunner(Protocol):
    def run(
        self,
        first: bytes,
        second: bytes,
        *,
        source_id: str,
        source_revision_id: str,
        comparison_revision_id: str,
        comparison_source_id: str | None = None,
        mode: str = "intersection",
        selector_first: str | None = None,
        selector_second: str | None = None,
        tolerance: float = 0.0,
        clearance: float = 0.0,
        allow_touching: bool = False,
        check_all: bool = False,
    ) -> ClashRunResult: ...


class IDSValidator(Protocol):
    def validate(
        self,
        ifc_content: bytes,
        ids_content: bytes | str,
        *,
        source_id: str,
        source_revision_id: str,
    ) -> IDSValidationResult: ...


@dataclass(frozen=True)
class ClashCondition:
    """Evaluate the small, explicit condition vocabulary supported by this adapter."""

    no_clashes = re.compile(r"^(?:no|zero)\s+clashes?$", re.IGNORECASE)

    def evaluate(self, condition: str, result: ClashRunResult) -> bool | None:
        if self.no_clashes.fullmatch(condition.strip()):
            return not result.evidence
        return None


@dataclass(frozen=True)
class IDSCondition:
    """Evaluate only unambiguous all-pass conditions; unknown text stays reviewable."""

    all_pass = re.compile(
        r"^(?:all\s+ids\s+requirements\s+pass|no\s+ids\s+violations?)$",
        re.IGNORECASE,
    )

    def evaluate(self, condition: str, result: IDSValidationResult) -> bool | None:
        if self.all_pass.fullmatch(condition.strip()):
            return (
                not result.violations
                and result.failed_specifications == 0
                and result.skipped_specifications == 0
                and result.passed_specifications == result.specifications
            )
        return None


def _review(message: str) -> CapabilityCheckResult:
    return CapabilityCheckResult(outcome="NEEDS_REVIEW", explanation=message)


def _model_inputs(request: CapabilityCheck) -> tuple[tuple[int, CapabilityInput], ...]:
    return tuple(
        (index, item)
        for index, item in enumerate(request.inputs)
        if item.role != "requirements"
    )


class IfcClashCapability:
    """Run one complete two-model clash group through the merged platform seam."""

    name = "ifc-clash"

    def __init__(
        self,
        *,
        version: str | None = None,
        adapter: ClashRunner | None = None,
        mode: str = "intersection",
        selector_first: str | None = None,
        selector_second: str | None = None,
        tolerance: float = 0.0,
        clearance: float = 0.0,
        allow_touching: bool = False,
        check_all: bool = False,
    ) -> None:
        self.adapter = adapter or IfcClashAdapter()
        self.version = version or _package_version("ifcclash")
        self.mode = mode
        self.selector_first = selector_first
        self.selector_second = selector_second
        self.tolerance = tolerance
        self.clearance = clearance
        self.allow_touching = allow_touching
        self.check_all = check_all
        self.condition = ClashCondition()

    def check(self, request: CapabilityCheck) -> CapabilityCheckResult:
        models = _model_inputs(request)
        if request.group_id is None or len(models) != 2:
            return _review("IfcClash requires one grouped pair of model inputs")
        if len(request.input_bytes) != len(request.inputs):
            return _review("IfcClash input bytes are not aligned with the persisted input set")
        if any(item.group_id != request.group_id for _, item in models):
            return _review("IfcClash inputs do not belong to one persisted group")
        first_index, first = models[0]
        second_index, second = models[1]
        if first.source_id == second.source_id:
            return _review("IfcClash requires two distinct source inputs")
        try:
            result = self.adapter.run(
                request.input_bytes[first_index],
                request.input_bytes[second_index],
                source_id=first.source_id,
                source_revision_id=first.source_revision_id,
                comparison_source_id=second.source_id,
                comparison_revision_id=second.source_revision_id,
                mode=self.mode,
                selector_first=self.selector_first,
                selector_second=self.selector_second,
                tolerance=self.tolerance,
                clearance=self.clearance,
                allow_touching=self.allow_touching,
                check_all=self.check_all,
            )
            if (
                result.source_id != first.source_id
                or result.source_revision_id != first.source_revision_id
                or result.source_hash != first.sha256
                or result.comparison_source_id != second.source_id
                or result.comparison_revision_id != second.source_revision_id
                or result.comparison_source_hash != second.sha256
            ):
                return _review("IfcClash result provenance does not match persisted inputs")
            publication = clash_publication(
                result, snapshot_id="provider", operation_id="provider-clash"
            )
        except (CapabilityUnavailable, DomainError, ProviderError) as exc:
            return _review(f"IfcClash capability failed: {exc}")
        satisfied = self.condition.evaluate(request.dependency.expected_condition, result)
        if satisfied is None:
            return _review("IfcClash expected condition is not supported by this adapter")
        if not publication.evidence:
            return _review(
                "IfcClash produced no Evidence; resolution requires an evaluated condition "
                "and a trusted publication"
            )
        return CapabilityCheckResult(
            outcome="RESOLVED" if satisfied else "STILL_OPEN",
            explanation=(
                "IfcClash condition satisfied"
                if satisfied
                else "IfcClash detected a result that does not satisfy the Finding condition"
            ),
            evidence=publication.evidence,
            expected_condition_satisfied=satisfied,
        )


class IfcTesterCapability:
    """Validate one model against the explicitly selected IDS requirements revision."""

    name = "ifc-ids"

    def __init__(
        self,
        *,
        version: str | None = None,
        adapter: IDSValidator | None = None,
    ) -> None:
        self.adapter = adapter or IfcTesterAdapter()
        self.version = version or _version("ifctester")
        self.condition = IDSCondition()

    def check(self, request: CapabilityCheck) -> CapabilityCheckResult:
        models = _model_inputs(request)
        requirements = tuple(
            (index, item)
            for index, item in enumerate(request.inputs)
            if item.role == "requirements"
        )
        if len(models) != 1 or len(requirements) != 1:
            return _review("IfcTester requires one model input and one IDS requirements input")
        if request.ids_requirements is None:
            return _review("IfcTester requires an explicitly selected IDS revision")
        if len(request.input_bytes) != len(request.inputs):
            return _review("IfcTester input bytes are not aligned with the persisted input set")
        model_index, model = models[0]
        rules_index, rules = requirements[0]
        if (
            rules.source_id != request.ids_requirements.source_id
            or rules.source_revision_id != request.ids_requirements.revision_id
        ):
            return _review("IfcTester requirements input differs from the selected revision")
        try:
            result = self.adapter.validate(
                request.input_bytes[model_index],
                request.input_bytes[rules_index],
                source_id=model.source_id,
                source_revision_id=model.source_revision_id,
            )
            if (
                result.source_id != model.source_id
                or result.source_revision_id != model.source_revision_id
                or result.source_hash != model.sha256
                or result.requirements_hash != rules.sha256
            ):
                return _review("IfcTester result provenance does not match persisted inputs")
            publication = ids_publication(
                result, snapshot_id="provider", operation_id="provider-ids"
            )
        except (CapabilityUnavailable, DomainError, ProviderError) as exc:
            return _review(f"IfcTester capability failed: {exc}")
        satisfied = self.condition.evaluate(request.dependency.expected_condition, result)
        if satisfied is None:
            return _review("IfcTester expected condition is not supported by this adapter")
        if not publication.evidence:
            return _review(
                "IfcTester produced no violation Evidence; resolution requires an evaluated "
                "condition and a trusted publication"
            )
        return CapabilityCheckResult(
            outcome="RESOLVED" if satisfied else "STILL_OPEN",
            explanation=(
                "IDS requirements condition satisfied"
                if satisfied
                else "IfcTester reported IDS violations"
            ),
            evidence=publication.evidence,
            expected_condition_satisfied=satisfied,
        )
