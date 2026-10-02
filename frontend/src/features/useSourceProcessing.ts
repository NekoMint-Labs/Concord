import { useEffect, useRef } from "react";
import {
  useMutation,
  useQueries,
  useQueryClient,
  type QueryClient,
} from "@tanstack/react-query";
import { api, type AgentRun, type ProjectSourceRevision } from "../api/client";

export const importKey = (project: string, source: string, revision: string) =>
  ["revision-import", project, source, revision] as const;
const errorKey = (project: string, source: string, revision: string) =>
  ["source-import-error", project, source, revision] as const;

/** A stored revision stays stored even if starting its import fails. */
export async function startSourceImport(
  cache: QueryClient,
  project: string,
  source: string,
  revision: string,
  retryFailed = false,
): Promise<AgentRun> {
  try {
    let run = await api.importRevision(project, source, revision);
    // Import POST is idempotent: a failed linked run must be resumed, not re-enqueued.
    if (retryFailed && ["FAILED", "CANCELLED", "EXPIRED"].includes(run.status))
      run = await api.resume(run.id);
    cache.setQueryData(importKey(project, source, revision), run);
    cache.setQueryData(errorKey(project, source, revision), "");
    await cache.invalidateQueries({ queryKey: ["runs", project] });
    return run;
  } catch (cause) {
    cache.setQueryData(
      errorKey(project, source, revision),
      cause instanceof Error ? cause.message : "无法开始处理资料，请重试。",
    );
    throw cause;
  }
}

export type SourceProcessingState = {
  run?: AgentRun | null;
  error?: string;
  readError?: string;
  loading: boolean;
  starting: boolean;
};

export function processingLabel(state?: SourceProcessingState): string {
  if (!state || state.loading) return "正在读取处理状态…";
  if (state.starting) return "正在开始处理…";
  if (state.error) return "处理启动失败";
  if (state.readError) return "处理状态读取失败";
  if (!state.run) return "已上传 · 尚未处理";
  return {
    QUEUED: "等待处理",
    RUNNING:
      state.run.category === "bim_import" ? "正在导入 BIM…" : "正在解析…",
    COMPLETED: "可用 · 处理完成",
    FAILED: "处理失败",
    CANCELLED: "处理已取消",
    EXPIRED: "处理已过期",
    WAITING_APPROVAL: "处理等待批准",
  }[state.run.status];
}

export function useSourceProcessing(
  project: string,
  revisions: readonly ProjectSourceRevision[],
  onRun?: (run: AgentRun) => void,
) {
  const cache = useQueryClient();
  const queries = useQueries({
    queries: revisions.map((revision) => ({
      queryKey: importKey(project, revision.source_id, revision.id),
      queryFn: () =>
        api.revisionImport(project, revision.source_id, revision.id),
      refetchInterval: (query: { state: { data?: AgentRun | null } }) =>
        ["QUEUED", "RUNNING"].includes(query.state.data?.status ?? "")
          ? 1500
          : false,
    })),
  });
  const errors = useQueries({
    queries: revisions.map((revision) => ({
      queryKey: errorKey(project, revision.source_id, revision.id),
      queryFn: () => "",
      enabled: false,
      gcTime: Infinity,
    })),
  });
  const retry = useMutation({
    mutationFn: ({ source, revision }: { source: string; revision: string }) =>
      startSourceImport(cache, project, source, revision, true),
    onSuccess: (run) => onRun?.(run),
  });
  const completedRuns = queries.flatMap((query, index) =>
    query.data?.status === "COMPLETED"
      ? [
          {
            source: revisions[index].source_id,
            revision: revisions[index].id,
            run: query.data.id,
            generation: query.data.generation,
            category: query.data.category,
          },
        ]
      : [],
  );
  const completed = JSON.stringify(completedRuns);
  const observed = useRef(new Set<string>());
  useEffect(() => {
    let changed = false;
    for (const imported of JSON.parse(completed) as typeof completedRuns) {
      const identity = JSON.stringify([project, imported]);
      if (observed.current.has(identity)) continue;
      observed.current.add(identity);
      changed = true;
      if (imported.category === "bim_import") {
        for (const key of ["bim-snapshot", "bim-bindings"]) {
          const filter = {
            queryKey: [key, project, imported.source, imported.revision],
            exact: true,
          };
          // Invalidation alone reuses a pending initial read, even if it predates import.
          void cache
            .cancelQueries(filter)
            .then(() => cache.invalidateQueries(filter));
        }
      }
    }
    if (!changed) return;
    void cache.invalidateQueries({ queryKey: ["workspace", project] });
    void cache.invalidateQueries({ queryKey: ["documents", project] });
    void cache.invalidateQueries({ queryKey: ["bim", project] });
    void cache.invalidateQueries({ queryKey: ["search", project] });
  }, [cache, completed, project]);

  const states = new Map<string, SourceProcessingState>(
    revisions.map((revision, index) => [
      revision.id,
      {
        run: queries[index].data,
        error: errors[index].data || undefined,
        readError: queries[index].error?.message,
        loading: queries[index].isPending,
        starting: retry.isPending && retry.variables?.revision === revision.id,
      },
    ]),
  );
  return {
    states,
    retry,
    refetch: (revisionId: string) =>
      queries[revisions.findIndex((item) => item.id === revisionId)]?.refetch(),
  };
}
