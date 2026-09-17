"""Read reasoning produces scoped analyses; existing action policy owns all effects."""

from app.application.agent_reads import ReadTools
from app.application.agent_scope import bind_scope
from app.application.streaming import custom
from app.domain.agent import AgentRequest, AgentResponse, InvestigationReport
from app.domain.errors import ProviderError
from app.domain.models import Analysis, Impact, ProjectSnapshot, ProjectState, utcnow
from app.domain.runs import AgentRun
from app.ports.agent import EngineeringReadPort, InvestigationEngine
from app.ports.coordination import CoordinationRepository, RepositoryFactory
from app.ports.providers import SearchProvider


class InvestigationService:
    def __init__(
        self,
        factory: RepositoryFactory,
        engine: InvestigationEngine,
        search: SearchProvider,
        engineering: EngineeringReadPort | None = None,
    ):
        self.factory, self.engine, self.search, self.engineering = (
            factory,
            engine,
            search,
            engineering,
        )

    def permitted(self, repo: CoordinationRepository, run: AgentRun) -> bool:
        request = repo.investigation(run.id)
        if (
            request.automatic
            and repo.agent_settings(run.project_id).initiative != "auto-investigate"
        ):
            repo.save_run(run.model_copy(update={"status": "CANCELLED", "updated_at": utcnow()}))
            custom(repo, run.id, "cancelled", {"reason": "automatic-investigation-disabled"})
            return False
        return True

    def _reason(
        self,
        state: ProjectState,
        snapshot: ProjectSnapshot,
        request: AgentRequest,
        run: AgentRun | None = None,
    ) -> tuple[AgentResponse, ReadTools]:
        tools = ReadTools(
            self.factory,
            state,
            snapshot,
            request.scope,
            self.search,
            self.engineering,
            run.id if run else None,
            run.generation if run else 0,
        )
        answer = self.engine.investigate(request.instruction, request.scope, tools)
        tools.fresh()
        if not tools.trace or tools.trace[0].tool != "project_state":
            raise ProviderError("Agent must inspect the bound project before answering")
        evidence = {e.id: e for result in tools.observations for e in result.evidence}
        if not set(answer.evidence_ids).issubset(evidence) or (
            evidence and not answer.evidence_ids
        ):
            raise ProviderError("Agent answer requires citations from the tools it actually read")
        limitations = tuple(
            dict.fromkeys(
                (
                    *(text for result in tools.observations for text in result.limitations),
                    *answer.limitations,
                )
            )
        )
        answer = answer.model_copy(update={"limitations": limitations[:30]})
        return AgentResponse(
            answer=answer,
            scope=request.scope,
            evidence=tuple(evidence.values()),
            tools=tuple(tools.trace),
        ), tools

    def ask(self, project_id: str, request: AgentRequest) -> AgentResponse:
        with self.factory.open() as repo:
            request = bind_scope(repo, project_id, request)
            state = repo.state(project_id)
        snapshot = ProjectSnapshot(
            project_id=project_id, version=state.version, sources=state.sources
        )
        response, _ = self._reason(state, snapshot, request)
        return response

    def compute(
        self, state: ProjectState, snapshot: ProjectSnapshot, run: AgentRun
    ) -> tuple[Analysis, InvestigationReport]:
        with self.factory.open() as repo:
            request = repo.investigation(run.id).request
        response, tools = self._reason(state, snapshot, request, run)
        allowed = tools.allowed_packages
        if request.scope.source_id and not (
            request.scope.work_package_ids or request.scope.area_ids or request.scope.element_ids
        ):
            changed = {c.global_id for result in tools.observations for c in result.changes}
            allowed &= {
                b.work_package_id
                for result in tools.observations
                for b in result.bindings
                if b.global_id in changed
            }
        evidence, findings, constraints, readiness, _ = tools.evaluation
        constraints = tuple(c for c in constraints if c.work_package_id in allowed)
        affected = {c.work_package_id for c in constraints}
        packages = [p for p in state.work_packages if p.id in affected]
        items = {e.id: e for e in evidence if e.work_package_id in allowed}
        items.update((e.id, e) for e in response.evidence)
        analysis = Analysis(
            run_id=run.id,
            snapshot=snapshot,
            impact=Impact(
                work_package_ids=tuple(sorted(affected)),
                area_ids=tuple(sorted({p.area_id for p in packages})),
                element_ids=tuple(
                    sorted(
                        {
                            e
                            for p in packages
                            for e in p.element_ids
                            if not request.scope.element_ids or e in request.scope.element_ids
                        }
                    )
                ),
                disciplines=tuple(sorted({p.discipline for p in packages})),
            ),
            evidence=tuple(items.values()),
            findings=tuple(
                f.model_copy(
                    update={
                        "limitations": ("Recorded project facts; not a final safety judgment.",)
                    }
                )
                for f in findings
                if f.work_package_id in allowed
            ),
            constraints=constraints,
            readiness=tuple(r for r in readiness if r.work_package_id in allowed),
            reasoning_summary=response.answer.summary,
            reasoning_mode=self.engine.mode,
        )
        report = InvestigationReport(
            **response.model_dump(exclude={"persisted"}),
            run_id=run.id,
            analysis_id=analysis.id,
            generation=run.generation,
        )
        return analysis, report
