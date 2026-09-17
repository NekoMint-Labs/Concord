"""Project validated engineering observations without inventing safety rules."""

from app.domain.agent_tools import ReadResult, RevisionQuery
from app.domain.models import Finding, ProjectSnapshot


def engineering_findings(
    snapshot: ProjectSnapshot,
    comparisons: list[tuple[RevisionQuery, ReadResult]],
    bindings: list[ReadResult],
    allowed: frozenset[str],
) -> tuple[tuple[Finding, ...], frozenset[str]]:
    changes = {
        (query.source_id, change.global_id): (query, change, result.evidence)
        for query, result in comparisons
        for change in result.changes
    }
    findings: dict[tuple[str, str, str], Finding] = {}
    elements: set[str] = set()
    for result in bindings:
        for binding in result.bindings:
            match = changes.get((binding.source_id, binding.global_id))
            if match is None or binding.work_package_id not in allowed:
                continue
            query, change, evidence = match
            supporting = {
                e.id
                for e in evidence
                if e.source_id == binding.source_id and binding.global_id in e.element_ids
            } | {
                e.id
                for e in result.evidence
                if e.source_id == binding.source_id
                and binding.global_id in e.element_ids
                and e.work_package_id == binding.work_package_id
            }
            key = (binding.source_id, binding.global_id, binding.work_package_id)
            findings[key] = Finding(
                snapshot_id=snapshot.id,
                work_package_id=binding.work_package_id,
                conclusion=(
                    f"Source {binding.source_id}, element {binding.global_id}: "
                    f"{change.kind}; bound to {binding.work_package_id}."
                ),
                evidence_ids=tuple(sorted(supporting)),
                reasoning_summary=(
                    f"Persisted comparison {query.from_revision_id or 'initial'} -> "
                    f"{query.to_revision_id} joined to a persisted source-level binding. "
                    f"Changed aspects: {', '.join(change.aspects) or 'not specified'}."
                ),
                limitations=(
                    "BIM change establishes impact, not a blocking condition or safety judgment. "
                    "Engineering readiness needs an applicable authoritative rule and review.",
                ),
            )
            elements.add(binding.global_id)
    return tuple(findings.values()), frozenset(elements)
