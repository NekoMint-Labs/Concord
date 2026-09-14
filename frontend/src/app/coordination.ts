import type { Workspace } from "../api/client";

const activeStatuses = new Set(["QUEUED", "RUNNING", "WAITING_APPROVAL"]);

/** The active coordination run owns the event shown for its work package. */
export function activeCoordinationRun(workspace: Workspace) {
  return [workspace.analysis_run, workspace.run].find(
    (run) => !!run?.event_id && activeStatuses.has(run.status),
  );
}

export function activeCoordinationEvent(
  workspace: Workspace,
  workPackageId: string,
) {
  const run = activeCoordinationRun(workspace);
  return run
    ? workspace.events.find(
        (event) =>
          event.id === run.event_id && event.work_package_id === workPackageId,
      )
    : undefined;
}
