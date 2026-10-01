import { useQueries, useQuery } from "@tanstack/react-query";
import { api, type ProjectSourceStatus } from "../api/client";

/**
 * Standing project records shared by Work and Project.
 * Cache keys match the source upload/import flow; queries retain TanStack's normal
 * freshness and refetch policy. This hook adds no endpoints or authoritative state.
 */
export function useProjectContext(
  project: string,
  sources: ProjectSourceStatus[],
) {
  const baselines = useQuery({
    queryKey: ["baselines", project],
    queryFn: () => api.baselines(project),
  });
  const documents = useQuery({
    queryKey: ["documents", project],
    queryFn: () => api.documents(project),
  });
  const models = sources.filter(
    (item) => item.source.kind === "BIM" && item.latest_revision_id,
  );
  // Shared cache identity; normal query freshness still determines refetching.
  const revisions = useQueries({
    queries: models.map((item) => ({
      queryKey: ["source-revisions", project, item.source.id],
      queryFn: () => api.sourceRevisions(project, item.source.id),
    })),
  });
  const revisionsFor = (index: number) => revisions[index]?.data ?? [];
  const revisionNo = (index: number, id: string | null) =>
    id
      ? `R${revisionsFor(index).find((rev) => rev.id === id)?.sequence ?? "?"}`
      : "—";
  return {
    baseline: baselines.data?.at(-1),
    baselines: baselines.data ?? [],
    documents: documents.data ?? [],
    models,
    revisionsFor,
    revisionNo,
    pendingModels: models.filter((item) => item.has_pending_revision),
    recordsError: baselines.error || documents.error,
    recordsPending: baselines.isPending || documents.isPending,
    retryRecords: () => {
      if (baselines.isError) void baselines.refetch();
      if (documents.isError) void documents.refetch();
    },
  };
}

export type ProjectContext = ReturnType<typeof useProjectContext>;
