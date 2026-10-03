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
  const matchingComparisons = models.map((source, index) =>
    source.accepted_revision_id &&
    source.accepted_revision_id !== source.latest_revision_id
      ? comparisonQueries[index]?.data?.find(
          (comparison) =>
            comparison.project_id === project &&
            comparison.source_id === source.source.id &&
            comparison.from_revision_id === source.accepted_revision_id &&
            comparison.to_revision_id === source.latest_revision_id,
        )
      : undefined,
  );
  const detailQueries = useQueries({
    queries: models.map((source, index) => {
      const comparison = matchingComparisons[index];
      return {
        queryKey: ["comparison", project, source.source.id, comparison?.id],
        queryFn: () =>
          api.comparison(project, source.source.id, comparison!.id),
        enabled: !!comparison,
      };
    }),
  });
  return models.map((source, index): WorkSourceContext => {
    const detail = detailQueries[index]?.data;
    const valid =
      !!matchingComparisons[index] &&
      !!detail &&
      detail.comparison.id === matchingComparisons[index]?.id &&
      detail.comparison.project_id === project &&
      detail.comparison.source_id === source.source.id &&
      detail.comparison.from_revision_id === source.accepted_revision_id &&
      detail.comparison.to_revision_id === source.latest_revision_id;
    return {
      source,
      revisions: revisionQueries[index]?.data ?? [],
      comparisons: comparisonQueries[index]?.data ?? [],
      comparison: valid ? detail : undefined,
    };
  });
}
