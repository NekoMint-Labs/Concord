import { useQuery } from "@tanstack/react-query";
import { api, type AgentRun } from "../api/client";
import { useRunStream } from "../api/stream";

const active = (run?: AgentRun | null) =>
  !!run && ["QUEUED", "RUNNING", "WAITING_APPROVAL"].includes(run.status);

/** Server queries and the active run subscriptions that refresh authoritative state. */
export function useWorkspace(project: string) {
  const profile = useQuery({ queryKey: ["profile"], queryFn: api.profile });
  const workspace = useQuery({
    queryKey: ["workspace", project],
    queryFn: () => api.workspace(project),
    enabled: !!project,
    retry: 1,
    refetchInterval: (query) =>
      ["QUEUED", "RUNNING"].includes(query.state.data?.run?.status ?? "")
        ? 1500
        : false,
  });
  const data = workspace.data;
  const currentRun = data?.run;
  const approvalRun = data?.analysis_run;
  useRunStream(currentRun?.id, active(currentRun), currentRun?.generation);
  // A newer document job can replace the visible run while the older analysis
  // still owns approval; identical IDs need only the current run's subscription.
  useRunStream(
    approvalRun?.id,
    approvalRun?.id !== currentRun?.id && active(approvalRun),
    approvalRun?.generation,
  );
  return { profile, workspace };
}
