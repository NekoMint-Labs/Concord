import { useQuery } from "@tanstack/react-query";
import { api } from "../api/client";
import { useRunStream } from "../api/stream";

/** Server queries and the approval owner's independent run subscription. */
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
  // A newer document/solver job can own the visible timeline while an older
  // coordination run still owns the approval. Keep that run live as well.
  const approvalRun = data?.analysis_run;
  const approvalActive =
    !!approvalRun &&
    approvalRun.id !== data?.run?.id &&
    ["QUEUED", "RUNNING", "WAITING_APPROVAL"].includes(approvalRun.status);
  useRunStream(approvalRun?.id, approvalActive, approvalRun?.generation);
  return { profile, workspace };
}
