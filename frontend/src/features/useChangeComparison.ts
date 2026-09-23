import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, readSource } from "../api/client";

export type ChangeKind = "all" | "added" | "deleted" | "changed";

/** Authoritative comparison/revision queries and transient viewer selection. */
export function useChangeComparison(project: string) {
  const cache = useQueryClient();
  const sources = useQuery({
    queryKey: ["sources", project],
    queryFn: () => api.sourceStatuses(project),
  });
  const models = (sources.data ?? []).filter(
    (item) => item.source.kind === "BIM",
  );
  const [sourceId, setSourceId] = useState("");
  const source = models.find((item) => item.source.id === sourceId);
  const revisions = useQuery({
    queryKey: ["revisions", project, sourceId],
    queryFn: () => api.sourceRevisions(project, sourceId),
    enabled: !!sourceId,
  });
  const comparisons = useQuery({
    queryKey: ["comparisons", project, sourceId],
    queryFn: () => api.comparisons(project, sourceId),
    enabled: !!sourceId,
  });
  const [comparisonId, setComparisonId] = useState("");
  const comparison = comparisons.data?.find((item) => item.id === comparisonId);
  const detail = useQuery({
    queryKey: ["comparison", project, sourceId, comparisonId],
    queryFn: () => api.comparison(project, sourceId, comparisonId),
    enabled: !!comparisonId,
  });
  const oldModel = useQuery({
    queryKey: ["bim-snapshot", project, sourceId, comparison?.from_revision_id],
    queryFn: () =>
      api.bimSnapshot(project, sourceId, comparison!.from_revision_id),
    enabled: !!comparison,
  });
  const newModel = useQuery({
    queryKey: ["bim-snapshot", project, sourceId, comparison?.to_revision_id],
    queryFn: () =>
      api.bimSnapshot(project, sourceId, comparison!.to_revision_id),
    enabled: !!comparison,
  });
  const nameFor = (id: string) => {
    const item = [
      ...(newModel.data?.elements ?? []),
      ...(oldModel.data?.elements ?? []),
    ].find((element) => element.global_id === id);
    return item?.name || item?.ifc_class || "未命名构件";
  };
  const [kind, setKind] = useState<ChangeKind>("all");
  const [selectedId, setSelectedId] = useState("");
  const [shownRevision, setShownRevision] = useState<"from" | "to">("to");
  const [file, setFile] = useState<File | null>(null);
  const [fileError, setFileError] = useState("");
  const compare = useMutation({
    mutationFn: () =>
      api.compareRevisions(project, sourceId, {
        from_revision_id: revisions.data!.at(-2)!.id,
        to_revision_id: revisions.data!.at(-1)!.id,
      }),
    onSuccess: async (result) => {
      await cache.invalidateQueries({
        queryKey: ["comparisons", project, sourceId],
      });
      setComparisonId(result.comparison.id);
    },
  });
  useEffect(() => {
    if (!models.some((model) => model.source.id === sourceId))
      setSourceId(models[0]?.source.id ?? "");
  }, [models, sourceId]);
  useEffect(() => {
    if (!comparisons.data?.some((item) => item.id === comparisonId))
      setComparisonId(comparisons.data?.at(-1)?.id ?? "");
  }, [comparisons.data, comparisonId]);
  useEffect(() => {
    setSelectedId("");
    setKind("all");
    setShownRevision("to");
  }, [comparisonId]);
  useEffect(() => {
    if (!comparison) {
      setFile(null);
      return;
    }
    let cancelled = false;
    setFile(null);
    setFileError("");
    const revisionId =
      shownRevision === "from"
        ? comparison.from_revision_id
        : comparison.to_revision_id;
    void readSource(
      `/api/projects/${encodeURIComponent(project)}/sources/${encodeURIComponent(sourceId)}/revisions/${encodeURIComponent(revisionId)}/content`,
    )
      .then((blob) => {
        if (!cancelled)
          setFile(
            new File(
              [blob],
              `R${revisions.data?.find((item) => item.id === revisionId)?.sequence ?? "?"}.ifc`,
            ),
          );
      })
      .catch((error) => {
        if (!cancelled)
          setFileError(error instanceof Error ? error.message : "模型不可用");
      });
    return () => {
      cancelled = true;
    };
  }, [
    project,
    sourceId,
    comparison?.to_revision_id,
    comparison?.from_revision_id,
    shownRevision,
    revisions.data,
  ]);
  return {
    sources,
    models,
    sourceId,
    setSourceId,
    source,
    revisions,
    comparisons,
    comparisonId,
    setComparisonId,
    comparison,
    detail,
    nameFor,
    kind,
    setKind,
    selectedId,
    setSelectedId,
    shownRevision,
    setShownRevision,
    file,
    fileError,
    compare,
  };
}
