"""Bounded project context; source scope does not authorize unrelated WP facts."""

from itertools import islice
from typing import TYPE_CHECKING

from app.application.project_sources import source_status, source_statuses
from app.domain.agent_tools import ReadResult, WorkPackageFact

if TYPE_CHECKING:
    from app.application.agent_reads import ReadTools

CATALOG_LIMIT = 50
EVIDENCE_LIMIT = 30


def project_state(tools: "ReadTools") -> ReadResult:
    scope = tools.scope
    limitations = []
    with tools.factory.open() as repo:
        if scope.source_id:
            sources = (
                source_status(repo, repo.project_source(tools.state.project.id, scope.source_id)),
            )
        elif scope.work_package_ids or scope.area_ids or scope.element_ids:
            sources = ()  # The catalog does not establish a source-to-WP association.
        else:
            sources = tuple(source_statuses(repo, tools.state.project.id, limit=CATALOG_LIMIT + 1))
    if len(sources) > CATALOG_LIMIT:
        sources = sources[:CATALOG_LIMIT]
        limitations.append("Source catalog truncated to 50; select a source for further work.")
    visible = tools.allowed_packages
    if scope.source_id and (scope.element_ids or not (scope.work_package_ids or scope.area_ids)):
        visible = frozenset()  # Source relevance requires actual persisted bindings.
    packages = tuple(
        islice((p for p in tools.state.work_packages if p.id in visible), CATALOG_LIMIT + 1)
    )
    if len(packages) > CATALOG_LIMIT:
        packages = packages[:CATALOG_LIMIT]
        limitations.append("Work-package catalog truncated to 50; narrow the scope for more.")
    visible_ids = {p.id for p in packages}
    evidence, _, constraints, _, _ = tools.evaluation
    scoped = tuple(e for e in evidence if e.work_package_id in visible_ids and tools._in_scope(e))
    scoped_ids = {e.id for e in scoped}
    facts = tuple(
        WorkPackageFact(
            id=p.id,
            area_id=p.area_id,
            discipline=p.discipline,
            blocker_count=sum(
                c.work_package_id == p.id and set(c.evidence_ids) <= scoped_ids for c in constraints
            ),
        )
        for p in packages
    )
    if len(scoped) > EVIDENCE_LIMIT:
        limitations.append("Overview evidence truncated to 30; narrow the scope for details.")
    if scope.source_id:
        limitations.append(
            "Work-package metadata and scoped blocker counts do not establish readiness."
        )
    overview = tools._fact(
        f"Recorded project version {tools.state.version}; "
        f"showing {len(facts)} scoped work packages; "
        f"{sum(s.has_pending_revision for s in sources)} returned sources differ from baseline.",
        tools.state.project.id,
        str(tools.state.version),
    )
    return tools.record(
        "project_state",
        ReadResult(
            work_packages=facts,
            sources=sources,
            evidence=(overview,) + scoped[:EVIDENCE_LIMIT],
            limitations=tuple(limitations),
        ),
    )
