import type { AgentRun, DTO, InvestigationReport } from "../api/client";
import type { ConcordContext } from "./ConcordAgent";

export type AgentContext = Omit<Partial<ConcordContext>, "workPackageId"> & {
  workPackageId?: string | null;
};

export function scopeFor(context: AgentContext): DTO<"AgentScope-Input"> {
  return {
    source_id: context.sourceId,
    from_revision_id: context.fromRevisionId,
    to_revision_id: context.revisionId,
    work_package_ids: context.workPackageId ? [context.workPackageId] : [],
    element_ids: context.elementIds ?? [],
  };
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
