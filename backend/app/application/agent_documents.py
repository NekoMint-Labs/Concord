"""Scoped search produces excerpts, not arbitrary filesystem or full-document access."""

from typing import TYPE_CHECKING

from app.domain.agent_tools import ReadResult, SearchQuery
from app.domain.models import Evidence, utcnow

if TYPE_CHECKING:
    from app.application.agent_reads import ReadTools


def relevant_documents(tools: "ReadTools", query: SearchQuery) -> ReadResult:
    scope = tools.scope
    if scope.work_package_ids or scope.area_ids or scope.element_ids:
        # Current document chunks have no authoritative WP/element association.
        return tools.record(
            "relevant_documents",
            ReadResult(
                available=False, limitations=("Documents lack scoped WP/element associations.",)
            ),
        )
    hashes = None
    if scope.source_id:
        with tools.factory.open() as repo:
            hashes = {
                repo.source_revision(tools.state.project.id, scope.source_id, identity).sha256
                for identity in (scope.from_revision_id, scope.to_revision_id)
                if identity
            }
    chunks = tools.search.search(
        tools.state.project.id,
        query.query,
        10,
        source_hashes=tuple(sorted(hashes)) if hashes is not None else None,
    )
    evidence = tuple(
        Evidence(
            snapshot_id=tools.snapshot.id,
            provider=chunk.parser,
            source_id=scope.source_id or chunk.id,
            source_revision=chunk.source_hash,
            observed_at=utcnow(),
            page=chunk.page,
            location=chunk.location,
            fact=chunk.text[:1200],
            quality="extracted",
        )
        for chunk in chunks
        if hashes is None or chunk.source_hash in hashes
    )
    return tools.record("relevant_documents", ReadResult(evidence=evidence))
