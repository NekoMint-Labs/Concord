import { useQueries, useQuery } from "@tanstack/react-query";
import { api, type ProjectSourceStatus } from "../api/client";

/**
 * The standing project context both 工作 and 项目 read.
 *
 * Three surfaces already needed the same three reads - the header, the project
 * sheet, and now the inbox's lower half - so the wiring lives here once and the
 * query keys stay shared. Navigating between 工作 and 项目 is a cache read, never
 * a second fetch.
 *
 * This hook adds no endpoint: it is the baseline in force, the model revisions
 * that baseline was cut from, and the project's own files, which is exactly what
 * `/baselines`, `/sources/{id}/revisions` and `/documents` already return.
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
  // Same query keys as the header and the model workspace, so this is a cache read.
  const revisions = useQueries({
    queries: models.map((item) => ({
      queryKey: ["revisions", project, item.source.id],
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
  };
}
