from app.application.investigations import InvestigationService
from app.application.streaming import custom, emit
from app.domain.actions import ActionProposal, AuditRecord
from app.domain.errors import ProviderError, StaleSnapshotError
from app.domain.models import Analysis, ProjectSnapshot, ProjectState, utcnow
from app.domain.readiness import evaluate
from app.domain.runs import AgentRun
from app.policies.actions import check_fresh
from app.ports.coordination import CoordinationRepository, RepositoryFactory
from app.ports.services import ReasoningEngine, ResolutionEngine


def compute_analysis(
    state: ProjectState, snapshot: ProjectSnapshot, run_id: str, reasoning: ReasoningEngine
) -> Analysis:
    evidence, findings, constraints, readiness, impact = evaluate(state, snapshot)
    proposal = reasoning.interpret(state, snapshot, evidence)
    allowed = {item.id for item in evidence}
    if not set(proposal.evidence_ids).issubset(allowed):
        raise ProviderError("Model referenced Evidence outside the bound Snapshot")
    return Analysis(
        run_id=run_id,
        snapshot=snapshot,
        impact=impact,
        evidence=evidence,
        findings=findings,
        constraints=constraints,
        readiness=readiness,
        reasoning_summary=proposal.summary,
        reasoning_mode=proposal.mode,
    )


def persist_analysis(
    repo: CoordinationRepository,
    run: AgentRun,
    state: ProjectState,
    analysis: Analysis,
    resolver: ResolutionEngine,
) -> AgentRun:
    repo.save_analysis(analysis)
    for item in analysis.evidence:
        repo.save_evidence(item)
    options = resolver.resolve(state, analysis.constraints)
    for option in options:
        wp_id = option.effects[0].work_package_id
        proposal = ActionProposal(
            project_id=state.project.id,
            run_id=run.id,
            generation=run.generation,
            snapshot_id=analysis.snapshot.id,
            snapshot_version=state.version,
            work_package_id=wp_id,
            title=option.title,
            risk=max(4 if e.kind == "record_inspection" else 3 for e in option.effects),
            resolution=option,
            evidence_ids=tuple(e.id for e in analysis.evidence if e.work_package_id == wp_id),
        )
        repo.save_proposal(proposal)
    updated = run.model_copy(
        update={
            "status": "WAITING_APPROVAL" if analysis.constraints else "COMPLETED",
            "analysis_id": analysis.id,
            "error": None,
            "updated_at": utcnow(),
        }
    )
    repo.save_run(updated)
    custom(
        repo,
        run.id,
        "analysis",
        {
            "analysis_id": analysis.id,
            "snapshot_id": analysis.snapshot.id,
            "version": state.version,
            "blockers": len(analysis.constraints),
        },
    )
    emit(
        repo,
        run.id,
        "STATE_SNAPSHOT",
        snapshot={
            "run": updated.model_dump(mode="json"),
            "readiness": [r.model_dump(mode="json") for r in analysis.readiness],
        },
    )
    if analysis.constraints:
        custom(repo, run.id, "approval-needed", {"proposal_count": len(options)})
    else:
        emit(repo, run.id, "RUN_FINISHED")
    repo.audit(
        AuditRecord(
            project_id=state.project.id,
            action="ANALYSIS_RECHECK",
            actor="coordination-core",
            run_id=run.id,
            snapshot_id=analysis.snapshot.id,
            detail={"blockers": len(analysis.constraints), "mode": analysis.reasoning_mode},
        )
    )
    return updated


class AnalysisService:
    def __init__(
        self, factory: RepositoryFactory, reasoning: ReasoningEngine, resolver: ResolutionEngine
    ) -> None:
        self.factory, self.reasoning, self.resolver = factory, reasoning, resolver
        self.investigations: InvestigationService | None = None

    def analyze(self, run_id: str, *, generation: int | None = None) -> AgentRun:
        with self.factory.open() as repo:
            run = repo.run(run_id)
        if generation is not None and run.generation != generation:
            return run
        generation = run.generation
        for attempt in range(3):
            with self.factory.open(run.project_id, write=True) as repo:
                run = repo.run(run_id)
                if run.status in {"CANCELLED", "EXPIRED"} or run.generation != generation:
                    return run
                if run.category == "investigation" and self.investigations is not None:
                    if not self.investigations.permitted(repo, run):
                        return repo.run(run_id)
                state = repo.state(run.project_id)
                snapshot = ProjectSnapshot(
                    project_id=state.project.id, version=state.version, sources=state.sources
                )
                repo.save_snapshot(snapshot)
                repo.save_run(run.model_copy(update={"status": "RUNNING", "updated_at": utcnow()}))
                emit(repo, run.id, "STEP_STARTED", stepName="capture-and-evaluate")
                custom(
                    repo,
                    run.id,
                    "snapshot-captured",
                    {"snapshot_id": snapshot.id, "version": snapshot.version},
                )
            # Provider/model work is deliberately outside the database write lock.
            report = None
            try:
                if run.category == "investigation":
                    if self.investigations is None:
                        raise ProviderError("Investigation worker is not initialized")
                    analysis, report = self.investigations.compute(state, snapshot, run)
                else:
                    analysis = compute_analysis(state, snapshot, run.id, self.reasoning)
            except StaleSnapshotError:
                continue
            with self.factory.open(run.project_id, write=True) as repo:
                current_run = repo.run(run_id)
                if (
                    current_run.status in {"CANCELLED", "EXPIRED"}
                    or current_run.generation != generation
                ):
                    return current_run
                current = repo.state(run.project_id)
                if run.category == "investigation" and self.investigations is not None:
                    if not self.investigations.permitted(repo, current_run):
                        return repo.run(run_id)
                try:
                    check_fresh(snapshot, current)
                except StaleSnapshotError:
                    custom(repo, run.id, "stale-result", {"retry": attempt + 1})
                    continue
                # Overlapping step/activity retries may compute the same source.
                # The first committed result owns its proposals and approvals; a
                # slower retry must not replace them with newly generated IDs.
                if current_run.analysis_id and current_run.analysis_id != run.analysis_id:
                    winner = repo.analysis(current_run.analysis_id)
                    try:
                        check_fresh(winner.snapshot, current)
                    except StaleSnapshotError:
                        pass
                    else:
                        return current_run
                emit(repo, run.id, "STEP_FINISHED", stepName="capture-and-evaluate")
                updated = persist_analysis(repo, current_run, state, analysis, self.resolver)
                if report is not None:
                    repo.save_investigation_report(report)
                    custom(
                        repo,
                        run.id,
                        "investigation-result",
                        {"analysis_id": analysis.id, "tools": [t.tool for t in report.tools]},
                    )
                return updated
        raise StaleSnapshotError("Project changed during three consecutive analyses; retry the run")
