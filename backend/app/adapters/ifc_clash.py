"""IfcClash adapter with targeted source subsets and bounded normalized output."""

import logging
import tempfile
import time
from importlib.metadata import PackageNotFoundError, version
from math import isfinite
from pathlib import Path
from typing import Literal, cast

from app.adapters.engineering_results import (
    ClashRunResult,
    EngineeringChange,
    EngineeringEvidence,
)
from app.domain.errors import CapabilityUnavailable, DomainError, ProviderError


class IfcClashAdapter:
    def __init__(self, *, max_results: int = 1000, max_bytes: int = 100 * 1024 * 1024):
        if max_results < 1 or max_bytes < 1:
            raise ValueError("IfcClash limits must be positive")
        self.max_results, self.max_bytes = max_results, max_bytes

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
    ) -> ClashRunResult:
        if mode not in {"intersection", "collision", "clearance"}:
            raise DomainError("IfcClash mode must be intersection, collision, or clearance")
        second_source_id = comparison_source_id or source_id
        normalized_mode = cast(Literal["intersection", "collision", "clearance"], mode)
        if not all(isfinite(value) and value >= 0 for value in (tolerance, clearance)):
            raise DomainError("IfcClash tolerance and clearance must be finite and nonnegative")
        if not first or not second or max(len(first), len(second)) > self.max_bytes:
            raise DomainError("IfcClash requires two non-empty IFC revisions within its byte limit")
        if not all(
            value.strip() for value in (source_id, source_revision_id, comparison_revision_id)
        ):
            raise DomainError("IfcClash requires source and revision identifiers")
        try:
            from ifcclash.ifcclash import Clasher, ClashSet, ClashSettings, ClashSource
        except ImportError as exc:
            raise CapabilityUnavailable("Install the BIM extra for IfcClash") from exc
        started = time.perf_counter()
        engine_version = _package_version("ifcclash")
        try:
            with tempfile.TemporaryDirectory(prefix="cca-ifcclash-") as folder:
                first_path, second_path = Path(folder) / "first.ifc", Path(folder) / "second.ifc"
                first_path.write_bytes(first)
                second_path.write_bytes(second)
                settings = ClashSettings()
                settings.logger = logging.getLogger("cca.ifcclash")
                source_a: ClashSource = {"file": str(first_path)}
                source_b: ClashSource = {"file": str(second_path)}
                if selector_first:
                    source_a.update(mode="i", selector=selector_first)
                if selector_second:
                    source_b.update(mode="i", selector=selector_second)
                clash_set: ClashSet = {
                    "name": f"{source_id}:{source_revision_id}->{comparison_revision_id}",
                    "a": [source_a],
                    "b": [source_b],
                    "mode": normalized_mode,
                    "check_all": check_all,
                }
                if normalized_mode == "intersection":
                    clash_set["tolerance"] = tolerance
                elif normalized_mode == "collision":
                    clash_set["allow_touching"] = allow_touching
                else:
                    clash_set["clearance"] = clearance
                clasher = Clasher(settings)
                clasher.clash_sets = [clash_set]
                clasher.clash()
                rows = list(clash_set.get("clashes", {}).values())
        except Exception as exc:
            raise ProviderError("IfcClash could not process the selected IFC revisions") from exc
        if len(rows) > self.max_results:
            raise DomainError("IfcClash result exceeds the configured limit")
        changes, evidence = [], []
        for row in sorted(rows, key=lambda row: (row["a_global_id"], row["b_global_id"])):
            ids = (str(row["a_global_id"]), str(row["b_global_id"]))
            point = tuple(float(value) for value in row.get("p1", ()))
            changes.append(
                EngineeringChange(
                    source_id=source_id,
                    source_revision_id=source_revision_id,
                    subject_type="bim",
                    subject_id=f"{ids[0]}:{ids[1]}",
                    kind="clash",
                    aspects=(str(row.get("type", "intersection")),),
                    location=point,
                    engine="ifcclash",
                    engine_version=engine_version,
                )
            )
            evidence.append(
                EngineeringEvidence(
                    source_id=source_id,
                    source_revision_id=source_revision_id,
                    against_source_id=second_source_id,
                    against_source_revision_id=comparison_revision_id,
                    provider="ifcclash",
                    engine_version=engine_version,
                    element_ids=ids,
                    location=point,
                    fact=(
                        f"{mode} between {row['a_ifc_class']} {row['a_name']} and "
                        f"{row['b_ifc_class']} {row['b_name']} at {point}; "
                        f"distance={row.get('distance', 0)}"
                    ),
                )
            )
        return ClashRunResult(
            source_id=source_id,
            source_revision_id=source_revision_id,
            comparison_revision_id=comparison_revision_id,
            comparison_source_id=second_source_id,
            engine="ifcclash",
            engine_version=engine_version,
            mode=normalized_mode,
            elapsed_seconds=time.perf_counter() - started,
            changes=tuple(changes),
            evidence=tuple(evidence),
        )


def _package_version(name: str) -> str:
    try:
        return version(name)
    except PackageNotFoundError:
        return "unknown"
