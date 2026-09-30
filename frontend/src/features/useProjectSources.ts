import {
  useMutation,
  useQueries,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { api, type AgentRun, type Capability, type DTO } from "../api/client";
import { startSourceImport } from "./useSourceProcessing";

export function sourceRevisionLabel(
  revisions: readonly DTO<"ProjectSourceRevision">[],
  sourceId: string,
  revisionId?: string | null,
) {
  if (!revisionId) return "—";
  const revision = revisions.find(
    (item) => item.source_id === sourceId && item.id === revisionId,
  );
  return revision ? `R${revision.sequence}` : "正在读取…";
}

/** Formats exposed by the configured backend parser, not by filename guesses. */
export function supportedSourceFormats(
  capabilities: readonly Capability[] = [],
) {
  const parser = capabilities.find((item) => item.name === "document parser");
  const bim = capabilities.find((item) => item.name === "BIM");
  const formats = bim && !bim.dependency_available ? [] : [".ifc"];
  if (
    parser?.enabled &&
    parser.dependency_available &&
    parser.status === "enabled"
  ) {
    if (parser.implementation === "LightweightDocumentParser")
      formats.push(".txt", ".md");
    if (parser.implementation === "Docling")
      formats.push(".pdf", ".docx", ".pptx", ".txt", ".md", ".html");
  }
  return formats;
}

export function revisionState(
  status: DTO<"ProjectSourceStatus">,
  revisionId: string,
): "latest" | "accepted" | "latest-accepted" | "historical" {
  const latest = status.latest_revision_id === revisionId;
  const accepted = status.accepted_revision_id === revisionId;
  return latest && accepted
    ? "latest-accepted"
    : latest
      ? "latest"
      : accepted
        ? "accepted"
        : "historical";
}

// Compatibility utility, not a baseline acceptance gate: backend acceptance has no READY requirement.
export function freshCheckAfterImport(
  ready: boolean,
  checkedAt?: string,
  importFinishedAt?: string,
): boolean {
  return (
    !!ready &&
    !!checkedAt &&
    !!importFinishedAt &&
    new Date(checkedAt).getTime() > new Date(importFinishedAt).getTime()
  );
}

export function latestBaselineEntries(
  statuses: readonly DTO<"ProjectSourceStatus">[],
) {
  return statuses
    .filter((item) => item.latest_revision_id)
    .map((item) => ({
      source_id: item.source.id,
      revision_id: item.latest_revision_id!,
    }));
}

export function useProjectSources(
  project: string,
  sourceId = "",
  onRun?: (run: AgentRun) => void,
) {
  const cache = useQueryClient();
  const capabilities = useQuery({
    queryKey: ["capabilities", false],
    queryFn: () => api.capabilities(false),
  });
  const sources = useQuery({
    queryKey: ["sources", project],
    queryFn: () => api.sourceStatuses(project),
  });
  const revisions = useQuery({
    queryKey: ["source-revisions", project, sourceId],
    queryFn: () => api.sourceRevisions(project, sourceId),
    enabled: !!sourceId,
  });
  const catalog = useQueries({
    queries: (sources.data ?? []).map((item) => ({
      queryKey: ["source-revisions", project, item.source.id],
      queryFn: () => api.sourceRevisions(project, item.source.id),
    })),
  });
  const revisionCatalog = catalog.flatMap((query) => query.data ?? []);
  const baselines = useQuery({
    queryKey: ["baselines", project],
    queryFn: () => api.baselines(project),
  });
  const comparisons = useQuery({
    queryKey: ["comparisons", project, sourceId],
    queryFn: () => api.comparisons(project, sourceId),
    enabled:
      !!sourceId &&
      !!sources.data?.some(
        (item) => item.source.id === sourceId && item.source.kind === "BIM",
      ),
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
    mutationFn: async ({
      source,
      file,
      label,
    }: {
      source: string;
      file: File;
      label: string;
    }) => {
      const extension = `.${file.name.split(".").at(-1)?.toLowerCase()}`;
      if (
        !supportedSourceFormats(capabilities.data?.capabilities).includes(
          extension,
        )
      )
        throw new Error("当前服务不支持处理此文件格式。");
      const kind = sources.data?.find((item) => item.source.id === source)
        ?.source.kind;
      if (kind && (kind === "BIM") !== (extension === ".ifc"))
        throw new Error("文件格式与资料类型不一致，请选择对应的资料。");
      const result = await api.uploadRevision(project, source, file, label);
      // An enqueue failure must not turn a durable upload into a fake upload failure.
      try {
        const run = await startSourceImport(
          cache,
          project,
          source,
          result.revision.id,
        );
        onRun?.(run);
      } catch {
        // The revision-scoped error remains visible in the register/context pane.
      }
      return result;
    },
    onSuccess: invalidateSources,
  });
  const importRevision = useMutation({
    mutationFn: ({ source, revision }: { source: string; revision: string }) =>
      startSourceImport(cache, project, source, revision, true),
    onSuccess: (run) => onRun?.(run),
  });
  const acceptBaseline = useMutation({
    mutationFn: async (selectedEntries?: DTO<"BaselineEntry">[]) => {
      const entries =
        selectedEntries ?? latestBaselineEntries(sources.data ?? []);
      if (!entries.length) throw new Error("尚未上传项目资料");
      return api.createBaseline(project, {
        name: `B${Math.max(0, ...(baselines.data ?? []).map((item) => item.sequence)) + 1}`,
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
    capabilities,
    supportedFormats: supportedSourceFormats(capabilities.data?.capabilities),
    sources,
    revisions,
    revisionCatalog,
    catalogLoading: catalog.some((query) => query.isPending),
    catalogError: catalog.find((query) => query.error)?.error,
    refetchCatalog: () => Promise.all(catalog.map((query) => query.refetch())),
    baselines,
    comparisons,
    createSource,
    upload,
    importRevision,
    acceptBaseline,
    compare,
  };
}

export type ProjectSourcesData = ReturnType<typeof useProjectSources>;
