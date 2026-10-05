"""C-owned capability adapters for the merged ReCheck input contract.

These wrappers keep SDK calls and result normalization in the engineering adapter
boundary. Registration remains a composition-root decision; callers pass instances
to ``build_services(..., engineering_capabilities=...)`` after choosing the
capability names used by their Finding dependencies.
"""

from __future__ import annotations

import re
from typing import Protocol

from app.adapters.clash_result_mapping import clash_publication
from app.adapters.engineering_capability_inputs import (
    capability_version,
    clash_selectors,
    validate_ids_selection,
    validate_inputs,
)
from app.adapters.engineering_result_mapping import ids_publication
from app.adapters.engineering_results import ClashParameters, ClashRunResult, IDSValidationResult
from app.adapters.engineering_verification import (
    clash_verification,
    ids_verification,
    input_context,
)
from app.adapters.ifc_clash import IfcClashAdapter, _package_version
from app.adapters.ifc_tester import IfcTesterAdapter, _version
from app.domain.engineering import CapabilityCheck, CapabilityCheckResult
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


class ClashCondition:
    """Evaluate the small, explicit condition vocabulary supported by this adapter."""

    no_clashes = re.compile(r"^(?:no|zero)\s+clashes?$", re.IGNORECASE)

    def evaluate(self, condition: str, result: ClashRunResult) -> bool | None:
        if self.no_clashes.fullmatch(condition.strip()):
            return not result.evidence
        return None


class IDSCondition:
    """Evaluate only unambiguous all-pass conditions; unknown text stays reviewable."""

    all_pass = re.compile(
        r"^(?:all\s+ids\s+requirements\s+pass|no\s+ids\s+violations?)$",
        re.IGNORECASE,
    )

    def evaluate(self, condition: str, result: IDSValidationResult) -> bool | None:
        if self.all_pass.fullmatch(condition.strip()):
            return (
                result.specifications > 0
                and not result.violations
                and result.failed_specifications == 0
                and result.skipped_specifications == 0
                and result.passed_specifications == result.specifications
            )
        return None


def _review(message: str) -> CapabilityCheckResult:
    return CapabilityCheckResult(outcome="NEEDS_REVIEW", explanation=message)


class IfcClashCapability:
    """Run one complete two-model clash group through the merged platform seam."""

    name = "ifc-clash"

    def __init__(
        self,
        *,
        version: str | None = None,
        adapter: ClashRunner | None = None,
        mode: str = "intersection",
        tolerance: float = 0.0,
        clearance: float = 0.0,
        allow_touching: bool = False,
        check_all: bool = False,
    ) -> None:
        if mode not in {"intersection", "collision", "clearance"}:
            raise ValueError("IfcClash mode must be intersection, collision, or clearance")
        self.adapter = adapter if adapter is not None else IfcClashAdapter()
        self._engine_version = version or _package_version("ifcclash")
        self._mode = mode
        self._parameters = ClashParameters(
            tolerance=tolerance,
            clearance=clearance,
            allow_touching=allow_touching,
            check_all=check_all,
        )
        self.condition = ClashCondition()

    @property
    def parameters(self) -> ClashParameters:
        return self._parameters

    @property
    def mode(self) -> str:
        return self._mode

    @property
    def version(self) -> str:
        return capability_version(
            self._engine_version,
            {
                "mode": self.mode,
                "parameters": self.parameters.model_dump(mode="json"),
                "ifcopenshell": _package_version("ifcopenshell"),
            },
            adapter_version="targeted-clash-v3",
        )

    def check(self, request: CapabilityCheck) -> CapabilityCheckResult:
        try:
            validate_inputs(request, capability=self.name, models=2)
            first_selector, second_selector = clash_selectors(request)
            first, second = request.inputs
            result = self.adapter.run(
                request.input_bytes[0],
                request.input_bytes[1],
                source_id=first.source_id,
                source_revision_id=first.source_revision_id,
                comparison_source_id=second.source_id,
                comparison_revision_id=second.source_revision_id,
                mode=self.mode,
                selector_first=first_selector,
                selector_second=second_selector,
                tolerance=self.parameters.tolerance,
                clearance=self.parameters.clearance,
                allow_touching=self.parameters.allow_touching,
                check_all=self.parameters.check_all,
            )
            if (
                result.source_id != first.source_id
                or result.source_revision_id != first.source_revision_id
                or result.source_hash != first.sha256
                or result.comparison_source_id != second.source_id
                or result.comparison_revision_id != second.source_revision_id
                or result.comparison_source_hash != second.sha256
                or result.mode != self.mode
                or result.parameters
                != self.parameters.model_copy(
                    update={
                        "selector_first": first_selector,
                        "selector_second": second_selector,
                    }
                )
            ):
                return _review("IfcClash result provenance does not match persisted inputs")
            if any(
                len(row.element_ids) != 2
                or any(
                    guid not in selector.split(" + ")
                    for guid, selector in zip(
                        row.element_ids, (first_selector, second_selector), strict=True
                    )
                )
                for row in result.evidence
            ):
                return _review("IfcClash returned Evidence outside the requested target scope")
            publication = clash_publication(
                result, snapshot_id="provider", operation_id="provider-clash"
            )
        except (CapabilityUnavailable, DomainError, ProviderError) as exc:
            return _review(f"IfcClash capability failed: {exc}")
        satisfied = self.condition.evaluate(request.dependency.expected_condition, result)
        if satisfied is None:
            return _review("IfcClash expected condition is not supported by this adapter")
        if satisfied:
            try:
                evidence = clash_verification(request, result)
            except DomainError as exc:
                return _review(str(exc))
            return CapabilityCheckResult(
                outcome="RESOLVED",
                explanation="IfcClash verified no clashes across the complete targeted model pair",
                evidence=evidence,
                expected_condition_satisfied=True,
            )
        return CapabilityCheckResult(
            outcome="STILL_OPEN",
            explanation="IfcClash detected a result that does not satisfy the Finding condition",
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
        self.adapter = adapter if adapter is not None else IfcTesterAdapter()
        self._engine_version = version or _version("ifctester")
        self.condition = IDSCondition()

    @property
    def version(self) -> str:
        return capability_version(
            self._engine_version,
            {"ifcopenshell": _package_version("ifcopenshell"), "xmlschema": _version("xmlschema")},
            adapter_version="selected-ids-v3",
        )

    def check(self, request: CapabilityCheck) -> CapabilityCheckResult:
        try:
            validate_inputs(request, capability=self.name, models=1)
            validate_ids_selection(request)
            model, rules = request.inputs
            result = self.adapter.validate(
                request.input_bytes[0],
                request.input_bytes[1],
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
            counts = (
                result.passed_specifications,
                result.failed_specifications,
                result.skipped_specifications,
            )
            if (
                result.specifications < 1
                or min(counts) < 0
                or sum(counts) != result.specifications
                or (result.violations and result.failed_specifications == 0)
            ):
                return _review("IfcTester returned inconsistent or empty specification counts")
            publication = ids_publication(
                result, snapshot_id="provider", operation_id="provider-ids"
            )
        except (CapabilityUnavailable, DomainError, ProviderError) as exc:
            return _review(f"IfcTester capability failed: {exc}")
        satisfied = self.condition.evaluate(request.dependency.expected_condition, result)
        if satisfied is None:
            return _review("IfcTester expected condition is not supported by this adapter")
        if satisfied:
            try:
                evidence = ids_verification(request, result)
            except DomainError as exc:
                return _review(str(exc))
            return CapabilityCheckResult(
                outcome="RESOLVED",
                explanation="IfcTester verified all selected IDS requirements for the model scope",
                evidence=evidence,
                expected_condition_satisfied=True,
            )
        if not publication.evidence:
            return _review("IfcTester did not supply Evidence for the failed condition")
        return CapabilityCheckResult(
            outcome="STILL_OPEN",
            explanation="IfcTester reported IDS violations",
            evidence=tuple(
                item.model_copy(update={"fact": item.fact + "; inputs=" + input_context(request)})
                for item in publication.evidence
            ),
            expected_condition_satisfied=satisfied,
        )
