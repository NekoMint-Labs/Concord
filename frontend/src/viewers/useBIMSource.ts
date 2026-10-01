import { useCallback, useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api, readSource } from "../api/client";

export type BIMFileOrigin =
  { kind: "local" } | { kind: "project"; sourceId: string; revisionId: string };

/** Local viewing, explicit project import, and generation-fenced source reopening. */
export function useBIMSource(project: string) {
  const cache = useQueryClient();
  const [selected, setSelected] = useState("");
  const [opened, setOpened] = useState<{
    file: File;
    origin: BIMFileOrigin;
  } | null>(null);
  const file = opened?.file ?? null;
  const origin = opened?.origin ?? null;
  const setFile = useCallback((file: File | null) => {
    setOpened(file ? { file, origin: { kind: "local" } } : null);
  }, []);
  const [error, setError] = useState("");
  const [errorAction, setErrorAction] = useState<"open" | "import" | null>(
    null,
  );
  const lastOpen = useRef<{ sourceId?: string; revisionId?: string }>({});
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [runId, setRunId] = useState("");
  const active = useRef(false);
  const epoch = useRef(0);
  useEffect(() => {
    setFile(null);
    setSelected("");
    setError("");
    setErrorAction(null);
    lastOpen.current = {};
    setNotice("");
    setRunId("");
    setBusy(false);
    active.current = false;
    return () => {
      epoch.current++;
    };
  }, [project]);
  const imported = useQuery({
    queryKey: ["bim-import", project, runId],
    queryFn: () => api.run(runId),
    enabled: !!runId,
    refetchInterval: (query) =>
      ["QUEUED", "RUNNING"].includes(query.state.data?.status ?? "QUEUED")
        ? 1500
        : false,
  });
  useEffect(() => {
    if (imported.data?.status === "COMPLETED") {
      void cache.invalidateQueries({ queryKey: ["bim", project] });
      void cache.invalidateQueries({ queryKey: ["bim-snapshot", project] });
      void cache.invalidateQueries({ queryKey: ["workspace", project] });
      void cache.invalidateQueries({ queryKey: ["sources", project] });
    }
  }, [imported.data?.status, cache, project]);

  async function importSource() {
    if (!file || origin?.kind !== "local" || active.current) return;
    active.current = true;
    setBusy(true);
    setErrorAction("import");
    setError("");
    setNotice("");
    const current = epoch.current;
    try {
      const sources = await api.sourceStatuses(project);
      const models = sources.filter((item) => item.source.kind === "BIM");
      if (models.length > 1)
        throw new Error(
          "项目有多个模型。请在「模型版本」选择要更新的模型后上传。",
        );
      const existing = models[0];
      const source =
        existing?.source ??
        (await api.createSource(project, { name: "项目模型", kind: "BIM" }));
      const uploaded = await api.uploadRevision(project, source.id, file, "");
      const run = await api.importRevision(
        project,
        source.id,
        uploaded.revision.id,
      );
      if (current !== epoch.current) return;
      setRunId(run.id);
      setNotice(
        uploaded.duplicate
          ? `这个文件已在项目中，仍是 R${uploaded.revision.sequence}。正在确认处理结果。`
          : `R${uploaded.revision.sequence} 已添加到项目，正在处理模型。当前基线不会自动改变。`,
      );
      await cache.invalidateQueries({ queryKey: ["sources", project] });
      await cache.invalidateQueries({
        queryKey: ["source-revisions", project],
      });
      await cache.invalidateQueries({ queryKey: ["revision-import", project] });
      await cache.invalidateQueries({ queryKey: ["workspace", project] });
      await cache.invalidateQueries({ queryKey: ["runs", project] });
    } catch (cause) {
      if (current === epoch.current)
        setError(
          cause instanceof Error && cause.message.startsWith("项目有多个模型")
            ? cause.message
            : "添加失败。请确认 IFC 文件有效后重试。",
        );
    } finally {
      if (current === epoch.current) {
        active.current = false;
        setBusy(false);
      }
    }
  }
  async function openImported(
    sourceId?: string,
    revisionId?: string,
  ): Promise<boolean> {
    if (active.current) return false;
    active.current = true;
    lastOpen.current = { sourceId, revisionId };
    setErrorAction("open");
    setBusy(true);
    setError("");
    setNotice("");
    const current = epoch.current;
    try {
      const models = (await api.sourceStatuses(project)).filter(
        (item) => item.source.kind === "BIM" && item.latest_revision_id,
      );
      if (current !== epoch.current) return false;
      if (!sourceId && models.length > 1) {
        setError("项目有多个模型。请在模型版本中选择具体资料与版本。");
        return false;
      }
      const source = sourceId
        ? models.find((item) => item.source.id === sourceId)
        : models[0];
      if (!source) {
        setError(
          file
            ? `当前显示的是本地预览 · ${file.name}，尚未添加到项目。`
            : "还没有项目模型。请到项目资料中添加 IFC；本地 IFC 仅用于临时预览。",
        );
        return false;
      }
      const blob = await readSource(
        `/api/projects/${encodeURIComponent(project)}/sources/${encodeURIComponent(source.source.id)}/revisions/${encodeURIComponent(revisionId ?? source.latest_revision_id!)}/content`,
      );
      if (current === epoch.current) {
        setOpened({
          file: new File([blob], "project-model.ifc"),
          origin: {
            kind: "project",
            sourceId: source.source.id,
            revisionId: revisionId ?? source.latest_revision_id!,
          },
        });
        setSelected("");
        setRunId("");
        return true;
      }
      return false;
    } catch (cause) {
      if (current === epoch.current)
        setError(
          cause instanceof Error
            ? cause.message
            : "项目模型暂时无法打开，请检查模型版本后重试。",
        );
      return false;
    } finally {
      if (current === epoch.current) {
        active.current = false;
        setBusy(false);
      }
    }
  }
  function chooseFile(chosen: File | undefined) {
    setErrorAction(null);
    setError("");
    setNotice("");
    setSelected("");
    setRunId("");
    if (
      chosen &&
      (chosen.size > 25 * 1024 * 1024 ||
        !chosen.size ||
        !chosen.name.toLowerCase().endsWith(".ifc"))
    ) {
      setFile(null);
      setError("请选择不超过 25 MiB 的非空 IFC 文件。");
    } else setFile(chosen ?? null);
  }
  return {
    selected,
    setSelected,
    file,
    origin,
    setFile,
    error,
    notice,
    busy,
    imported,
    importSource,
    openImported,
    retry:
      errorAction === "open"
        ? () =>
            openImported(lastOpen.current.sourceId, lastOpen.current.revisionId)
        : errorAction === "import"
          ? importSource
          : undefined,
    chooseFile,
  };
}
