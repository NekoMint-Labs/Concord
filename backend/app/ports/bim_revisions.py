"""Project-owned boundaries for BIM history and the external comparison engine."""

from dataclasses import dataclass
from typing import Protocol

from app.domain.bim_revisions import (
    BimElementChange,
    BimElementSnapshot,
    BimRevisionSnapshot,
    RevisionComparison,
    WorkPackageBimBinding,
)


@dataclass(frozen=True)
class NormalizedIfcDiff:
    engine: str
    engine_version: str
    added: frozenset[str]
    deleted: frozenset[str]
    changed: dict[str, tuple[str, ...]]
    raw: dict
    compare_seconds: float


class IfcComparisonEngine(Protocol):
    def compare(self, old_content: bytes, new_content: bytes) -> NormalizedIfcDiff: ...


class BimRevisionRepository(Protocol):
    def add_bim_revision_snapshot(self, snapshot: BimRevisionSnapshot) -> None: ...
    def bim_revision_snapshot(
        self, project_id: str, source_id: str, revision_id: str
    ) -> BimRevisionSnapshot | None: ...
    def bim_revision_elements(
        self, project_id: str, source_id: str, revision_id: str
    ) -> list[BimElementSnapshot]: ...
    def add_bim_binding(self, binding: WorkPackageBimBinding) -> WorkPackageBimBinding: ...
    def bim_bindings(
        self, project_id: str, source_id: str, global_ids: set[str] | None = None
    ) -> list[WorkPackageBimBinding]: ...
    def add_revision_comparison(
        self, comparison: RevisionComparison, changes: tuple[BimElementChange, ...]
    ) -> None: ...
    def revision_comparison(
        self, project_id: str, source_id: str, comparison_id: str
    ) -> RevisionComparison: ...
    def revision_comparison_for_revisions(
        self,
        project_id: str,
        source_id: str,
        from_revision_id: str,
        to_revision_id: str,
    ) -> RevisionComparison | None: ...
    def revision_comparisons(self, project_id: str, source_id: str) -> list[RevisionComparison]: ...
    def bim_element_changes(self, comparison_id: str) -> list[BimElementChange]: ...
