"""A bounded, data-dependent policy using the exact same tools as PydanticAI."""

from app.domain.agent import AgentAnswer, AgentScope
from app.domain.agent_tools import RevisionQuery, SearchQuery, WorkPackageQuery
from app.ports.agent import AgentReadTools


class OfflineInvestigationEngine:
    mode = "offline-agent"

    def investigate(
        self, instruction: str, scope: AgentScope, tools: AgentReadTools
    ) -> AgentAnswer:
        overview = tools.project_state()
        observations = [overview]
        pending = [s for s in overview.sources if s.has_pending_revision or scope.source_id]
        limitations: list[str] = []
        if pending:
            source = pending[0]
            query = RevisionQuery(
                source_id=source.source.id,
                from_revision_id=scope.from_revision_id
                if scope.source_id
                else source.accepted_revision_id,
                to_revision_id=scope.to_revision_id or source.latest_revision_id or "",
            )
            observations.append(tools.compare_revisions(query))
            if source.source.kind == "BIM":
                changes = tools.bim_changes(query)
                observations.append(changes)
                # A binding lookup is useful only after changed elements are observed.
                if changes.available and changes.changes:
                    observations.append(
                        tools.work_package_bindings(
                            WorkPackageQuery(
                                work_package_ids=tuple(p.id for p in overview.work_packages)
                            )
                        )
                    )
            if len(pending) > 1:
                limitations.append(
                    "This investigation examined the first pending source; "
                    "scope further runs to the others."
                )
        if any(p.blocker_count for p in overview.work_packages) or pending:
            observations.append(tools.persisted_evidence())
        if any(word in instruction.lower() for word in ("document", "drawing", "资料", "图纸")):
            observations.append(tools.relevant_documents(SearchQuery(query=instruction[:200])))
        facts = [e for result in observations for e in result.evidence]
        limitations.extend(item for result in observations for item in result.limitations)
        selected = facts[:5]
        return AgentAnswer(
            summary="\n".join(e.fact[:650] for e in selected)
            or "No supporting records were available in this scope.",
            evidence_ids=tuple(e.id for e in selected),
            limitations=tuple(dict.fromkeys(limitations)),
        )

    def close(self) -> None:
        pass
