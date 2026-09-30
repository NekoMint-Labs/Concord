import { useQueries } from "@tanstack/react-query";
import { api, type DTO, type ProjectSourceStatus } from "../api/client";

export type WorkSourceContext = {
  source: ProjectSourceStatus;
  revisions: DTO<"ProjectSourceRevision">[];
  comparisons: DTO<"RevisionComparison">[];
  comparison?: DTO<"RevisionComparisonDetail">;
};

/** Read-only source projection shared by Work; comparison counts never come from guesses. */
export function useWorkSourceContext(
  project: string,
  sources: ProjectSourceStatus[],
) {
  const models = sources.filter(
    (item) => item.source.kind === "BIM" && item.latest_revision_id,
  );
  const revisionQueries = useQueries({
    queries: models.map((source) => ({
      queryKey: ["source-revisions", project, source.source.id],
      queryFn: () => api.sourceRevisions(project, source.source.id),
    })),
  });
  const comparisonQueries = useQueries({
    queries: models.map((source) => ({
      queryKey: ["comparisons", project, source.source.id],
      queryFn: () => api.comparisons(project, source.source.id),
    })),
  });
  const detailQueries = useQueries({
    queries: models.map((source, index) => {
      const comparison = comparisonQueries[index]?.data?.at(-1);
      return {
        queryKey: ["comparison", project, source.source.id, comparison?.id],
        queryFn: () =>
          api.comparison(project, source.source.id, comparison!.id),
        enabled: !!comparison,
      };
    }),
  });
  return models.map((source, index): WorkSourceContext => ({
    source,
    revisions: revisionQueries[index]?.data ?? [],
    comparisons: comparisonQueries[index]?.data ?? [],
    comparison: detailQueries[index]?.data,
  }));
}
