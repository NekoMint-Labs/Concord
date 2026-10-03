import type { AgentRun, DTO, InvestigationReport } from "../api/client";
import type { ConcordContext } from "./ConcordAgent";

export type AgentContext = Omit<Partial<ConcordContext>, "workPackageId"> & {
  workPackageId?: string | null;
};

// Mirrors backend AgentScope.element_ids; mapping bindings have a separate limit.
export const MAX_AGENT_ELEMENTS = 200;
export const AGENT_ELEMENT_LIMIT_MESSAGE = `Concord 每次最多检查 ${MAX_AGENT_ELEMENTS} 个构件，请缩小选择范围。`;

export function scopeFor(context: AgentContext): DTO<"AgentScope-Input"> {
  if ((context.elementIds?.length ?? 0) > MAX_AGENT_ELEMENTS)
    throw new Error(AGENT_ELEMENT_LIMIT_MESSAGE);
  return {
    source_id: context.sourceId,
    from_revision_id: context.fromRevisionId,
    to_revision_id: context.revisionId,
    work_package_ids: context.workPackageId ? [context.workPackageId] : [],
    element_ids: context.elementIds ?? [],
  };
}

/** Engineering identity excludes labels and treats selections as sets. */
export function engineeringContextKey(project: string, context: AgentContext) {
  return JSON.stringify([
    project,
    context.sourceId,
    context.fromRevisionId,
    context.revisionId,
    context.workPackageId ?? undefined,
    [...new Set(context.elementIds ?? [])].sort(),
  ]);
}

/** A committed report is current only for this complete run identity. */
export function reportMatchesRun(
  report: InvestigationReport | null | undefined,
  run: AgentRun | null | undefined,
) {
  return (
    !!report?.persisted &&
    !!run &&
    report.run_id === run.id &&
    report.generation === run.generation &&
    report.analysis_id === run.analysis_id
  );
}

export const runIsActive = (run?: AgentRun | null) =>
  !!run && ["QUEUED", "RUNNING", "WAITING_APPROVAL"].includes(run.status);
