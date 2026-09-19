import { useCallback, useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api, type AgentRun, type ProjectSourceStatus } from "../api/client";
import type { ConcordContext } from "./ConcordAgent";

/** Owns current Agent operation identity and real workspace scope. */
export function useConcordAgent({
  project,
  projectName,
  workPackageId,
  sources,
}: {
  project: string;
  projectName: string;
  workPackageId?: string;
  sources?: ProjectSourceStatus[];
}) {
  const cache = useQueryClient();
  const [error, setError] = useState("");
  const [scope, setScope] = useState<
    Pick<
      ConcordContext,
      "sourceId" | "sourceName" | "revisionId" | "revisionLabel" | "elementIds"
    >
  >({ elementIds: [] });
  const [activeRun, setActiveRun] = useState<{
    id: string;
    generation: number;
    category: AgentRun["category"];
    project: string;
  }>();

  useEffect(() => {
    setScope({ elementIds: [] });
    setActiveRun(undefined);
    setError("");
  }, [project]);

  const currentRun = useQuery({
    queryKey: [
      "current-operation-run",
      activeRun?.project,
      activeRun?.id,
      activeRun?.generation,
    ],
    queryFn: () => api.run(activeRun!.id),
    enabled: !!activeRun && activeRun.project === project,
    refetchInterval: (query) =>
      ["QUEUED", "RUNNING"].includes(query.state.data?.status ?? "")
        ? 1200
        : false,
  });
  const investigation = useQuery({
    queryKey: [
      "investigation-report",
      project,
      activeRun?.id,
      currentRun.data?.generation,
    ],
    queryFn: () => api.investigation(project, activeRun!.id),
    enabled:
      !!activeRun &&
      activeRun.project === project &&
      activeRun.category === "investigation",
    refetchInterval: (query) =>
      query.state.data ||
      !["QUEUED", "RUNNING"].includes(currentRun.data?.status ?? "")
        ? false
        : 1200,
  });

  useEffect(() => {
    if (currentRun.data?.status !== "COMPLETED") return;
    for (const key of [
      "workspace",
      "sources",
      "bim-snapshot",
      "bim-bindings",
      "comparisons",
    ]) {
      void cache.invalidateQueries({ queryKey: [key, project] });
    }
  }, [cache, currentRun.data?.status, project]);

  const rememberRun = useCallback(
    (run: AgentRun) => {
      setActiveRun({
        id: run.id,
        generation: run.generation,
        category: run.category,
        project,
      });
      setError("");
    },
    [project],
  );
  const sourceContext = useCallback(
    (sourceId: string, revisionId?: string, revisionLabel?: string) => {
      const source = sources?.find((item) => item.source.id === sourceId);
      setScope({
        sourceId,
        sourceName: source?.source.name ?? sourceId,
        revisionId,
        revisionLabel:
          revisionLabel ?? (revisionId ? revisionId.slice(0, 8) : undefined),
        elementIds: [],
      });
    },
    [sources],
  );
  const bimContext = useCallback(
    (sourceId: string, revisionId: string, elementIds: string[]) => {
      const source = sources?.find((item) => item.source.id === sourceId);
      setScope({
        sourceId,
        sourceName: source?.source.name ?? sourceId,
        revisionId,
        revisionLabel: revisionId.slice(0, 8),
        elementIds,
      });
    },
    [sources],
  );
  const startInvestigation = useCallback(
    async (
      instruction: string,
      context: {
        sourceId?: string;
        revisionId?: string;
        workPackageId?: string;
        elementIds?: string[];
      },
    ) => {
      setError("");
      try {
        rememberRun(
          await api.investigate(project, {
            instruction,
            scope: {
              source_id: context.sourceId ?? null,
              to_revision_id: context.revisionId ?? null,
              work_package_ids: context.workPackageId
                ? [context.workPackageId]
                : [],
              element_ids: context.elementIds ?? [],
            },
          }),
        );
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : "调查启动失败");
      }
    },
    [project, rememberRun],
  );
  const context = useMemo<ConcordContext>(
    () => ({
      projectName,
      ...scope,
      workPackageId,
    }),
    [projectName, scope, workPackageId],
  );

  return {
    activeRun,
    currentRun,
    investigation,
    context,
    error,
    clearError: () => setError(""),
    rememberRun,
    sourceContext,
    bimContext,
    startInvestigation,
  };
}
