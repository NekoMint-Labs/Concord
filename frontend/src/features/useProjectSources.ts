import {
  useMutation,
  useQueries,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { api, type DTO } from "../api/client";

export function useProjectSources(project: string, sourceId: string) {
  const cache = useQueryClient();
  const sources = useQuery({
    queryKey: ["sources", project],
    queryFn: () => api.sourceStatuses(project),
  });
  const revisions = useQuery({
    queryKey: ["source-revisions", project, sourceId],
    queryFn: () => api.sourceRevisions(project, sourceId),
    enabled: !!sourceId,
  });
  const revisionCatalog = useQueries({
    queries: (sources.data ?? []).map((item) => ({
      queryKey: ["source-revisions", project, item.source.id],
      queryFn: () => api.sourceRevisions(project, item.source.id),
    })),
    combine: (queries) => queries.flatMap((query) => query.data ?? []),
  });
  const baselines = useQuery({
    queryKey: ["baselines", project],
    queryFn: () => api.baselines(project),
  });
  const comparisons = useQuery({
    queryKey: ["comparisons", project, sourceId],
    queryFn: () => api.comparisons(project, sourceId),
    enabled: !!sourceId,
  });

  const invalidateSources = () =>
    Promise.all([
      cache.invalidateQueries({ queryKey: ["sources", project] }),
      cache.invalidateQueries({ queryKey: ["source-revisions", project] }),
      cache.invalidateQueries({ queryKey: ["baselines", project] }),
      cache.invalidateQueries({ queryKey: ["workspace", project] }),
      cache.invalidateQueries({ queryKey: ["agent-notices", project] }),
    ]);

  const createSource = useMutation({
    mutationFn: (input: DTO<"CreateProjectSource">) =>
      api.createSource(project, input),
    onSuccess: invalidateSources,
  });
  const upload = useMutation({
    mutationFn: ({
      source,
      file,
      label,
    }: {
      source: string;
      file: File;
      label: string;
    }) => api.uploadRevision(project, source, file, label),
    onSuccess: invalidateSources,
  });
  const importRevision = useMutation({
    mutationFn: ({ source, revision }: { source: string; revision: string }) =>
      api.importRevision(project, source, revision),
    onSuccess: async () => {
      await cache.invalidateQueries({ queryKey: ["runs", project] });
    },
  });
  const acceptBaseline = useMutation({
    mutationFn: async () => {
      const entries = (sources.data ?? [])
        .filter((item) => item.latest_revision_id)
        .map((item) => ({
          source_id: item.source.id,
          revision_id: item.latest_revision_id!,
        }));
      if (!entries.length) throw new Error("没有可接受的来源版本");
      return api.createBaseline(project, {
        name: `B${(baselines.data?.length ?? 0) + 1}`,
        entries,
      });
    },
    onSuccess: invalidateSources,
  });
  const compare = useMutation({
    mutationFn: (input: DTO<"CompareBimRevisions">) =>
      api.compareRevisions(project, sourceId, input),
    onSuccess: async () => {
      await cache.invalidateQueries({
        queryKey: ["comparisons", project, sourceId],
      });
      await cache.invalidateQueries({ queryKey: ["workspace", project] });
    },
  });

  return {
    sources,
    revisions,
    revisionCatalog,
    baselines,
    comparisons,
    createSource,
    upload,
    importRevision,
    acceptBaseline,
    compare,
  };
}
