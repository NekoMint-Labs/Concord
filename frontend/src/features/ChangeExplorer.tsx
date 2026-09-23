import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, readSource, type DTO, type Workspace } from "../api/client";
import { Button } from "../components/ui/button";
import BIMWorkspace from "../viewers/BIMWorkspace";
import { demoWorkPackageName } from "../ui/demo/demoPresentation";

type Kind = "all" | DTO<"BimElementChange">["change_kind"];
const kinds: { value: Kind; label: string }[] = [
  { value: "all", label: "全部" }, { value: "added", label: "新增" },
  { value: "deleted", label: "删除" }, { value: "changed", label: "修改" },
];
const aspectLabel: Record<string, string> = { geometry: "几何", placement: "位置", attributes: "属性", properties: "属性" };

/** A comparison is authoritative server data; selection only controls presentation. */
export function ChangeExplorer({ project, workspace, onModels, onInspect, onInvestigate }: {
  project: string;
  workspace: Workspace;
  onModels: () => void;
  onInspect: (workPackageId: string, sourceId: string, comparison: DTO<"RevisionComparison">, change: DTO<"BimElementChange">) => void;
  onInvestigate: (sourceId: string, revisionId: string, fromRevisionId: string, elementIds: string[]) => void;
}) {
  const cache = useQueryClient();
  const sources = useQuery({ queryKey: ["sources", project], queryFn: () => api.sourceStatuses(project) });
  const models = (sources.data ?? []).filter((item) => item.source.kind === "BIM");
  const [sourceId, setSourceId] = useState("");
  const source = models.find((item) => item.source.id === sourceId);
  const revisions = useQuery({ queryKey: ["revisions", project, sourceId], queryFn: () => api.sourceRevisions(project, sourceId), enabled: !!sourceId });
  const comparisons = useQuery({ queryKey: ["comparisons", project, sourceId], queryFn: () => api.comparisons(project, sourceId), enabled: !!sourceId });
  const [comparisonId, setComparisonId] = useState("");
  const comparison = comparisons.data?.find((item) => item.id === comparisonId);
  const detail = useQuery({ queryKey: ["comparison", project, sourceId, comparisonId], queryFn: () => api.comparison(project, sourceId, comparisonId), enabled: !!comparisonId });
  const oldModel = useQuery({ queryKey: ["bim-snapshot", project, sourceId, comparison?.from_revision_id], queryFn: () => api.bimSnapshot(project, sourceId, comparison!.from_revision_id), enabled: !!comparison });
  const newModel = useQuery({ queryKey: ["bim-snapshot", project, sourceId, comparison?.to_revision_id], queryFn: () => api.bimSnapshot(project, sourceId, comparison!.to_revision_id), enabled: !!comparison });
  const nameFor = (id: string) => { const item = [...(newModel.data?.elements ?? []), ...(oldModel.data?.elements ?? [])].find((element) => element.global_id === id); return item?.name || item?.ifc_class || "未命名构件"; };
  const [kind, setKind] = useState<Kind>("all");
  const [selectedId, setSelectedId] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [fileError, setFileError] = useState("");
  const compare = useMutation({
    mutationFn: () => api.compareRevisions(project, sourceId, { from_revision_id: revisions.data!.at(-2)!.id, to_revision_id: revisions.data!.at(-1)!.id }),
    onSuccess: async (result) => { await cache.invalidateQueries({ queryKey: ["comparisons", project, sourceId] }); setComparisonId(result.comparison.id); },
  });

  useEffect(() => { if (!models.some((model) => model.source.id === sourceId)) setSourceId(models[0]?.source.id ?? ""); }, [models, sourceId]);
  useEffect(() => { if (!comparisons.data?.some((item) => item.id === comparisonId)) setComparisonId(comparisons.data?.at(-1)?.id ?? ""); }, [comparisons.data, comparisonId]);
  useEffect(() => { setSelectedId(""); setKind("all"); }, [comparisonId]);
  useEffect(() => {
    if (!comparison) { setFile(null); return; }
    let cancelled = false;
    setFile(null);
    setFileError("");
    void readSource(`/api/projects/${encodeURIComponent(project)}/sources/${encodeURIComponent(sourceId)}/revisions/${encodeURIComponent(comparison.to_revision_id)}/content`)
      .then((blob) => { if (!cancelled) setFile(new File([blob], `R${revisions.data?.find((item) => item.id === comparison.to_revision_id)?.sequence ?? "new"}.ifc`)); })
      .catch((error) => { if (!cancelled) setFileError(error instanceof Error ? error.message : "模型不可用"); });
    return () => { cancelled = true; };
  }, [project, sourceId, comparison?.to_revision_id, revisions.data]);

  const changes = detail.data?.changes ?? [];
  const visible = kind === "all" ? changes : changes.filter((change) => change.change_kind === kind);
  const selected = changes.find((change) => change.global_id === selectedId);
  const affected = detail.data?.affected_work_packages.filter((item) => item.changes.some((change) => change.global_id === selectedId)) ?? [];
  const from = revisions.data?.find((item) => item.id === comparison?.from_revision_id);
  const to = revisions.data?.find((item) => item.id === comparison?.to_revision_id);
  const element = workspace.analysis?.evidence.find((item) => item.element_ids.includes(selectedId));
  return <section className="change-workspace" aria-label="版本变更">
    <aside className="change-explorer" aria-label="变更构件">
      <header className="spatial-pane-heading"><strong>变更</strong><button type="button" onClick={onModels}>模型版本 →</button></header>
      <label className="change-source-label">模型
        <select value={sourceId} onChange={(event) => { setSourceId(event.target.value); setComparisonId(""); }} aria-label="比较模型">
          {models.map((model) => <option value={model.source.id} key={model.source.id}>{model.source.name}</option>)}
        </select>
      </label>
      {comparison && <label className="change-source-label">比较
        <select value={comparisonId} onChange={(event) => setComparisonId(event.target.value)} aria-label="版本比较">
          {comparisons.data?.map((item) => <option value={item.id} key={item.id}>R{revisions.data?.find((revision) => revision.id === item.from_revision_id)?.sequence ?? "?"} → R{revisions.data?.find((revision) => revision.id === item.to_revision_id)?.sequence ?? "?"}</option>)}
        </select>
      </label>}
      {comparison && <div className="change-filters" aria-label="变更类型">{kinds.map((option) => <button type="button" key={option.value} aria-pressed={kind === option.value} onClick={() => setKind(option.value)}>{option.label} <span>{option.value === "all" ? changes.length : changes.filter((change) => change.change_kind === option.value).length}</span></button>)}</div>}
      <div className="change-list">
        {visible.map((change) => <button key={`${change.change_kind}:${change.global_id}`} type="button" aria-pressed={selectedId === change.global_id} onClick={() => setSelectedId(change.global_id)}>
          <strong>{nameFor(change.global_id)}</strong>
          <small>{change.change_kind === "deleted" ? "已删除" : change.change_kind === "added" ? "新增" : "修改"} · {change.changed_aspects.map((aspect) => aspectLabel[aspect] ?? aspect).join("、") || "构件"}</small>
        </button>)}
        {!comparison && <div className="pane-empty quiet-message">{models.length ? revisions.data && revisions.data.length >= 2 ? <Button size="sm" disabled={compare.isPending} onClick={() => compare.mutate()}>{compare.isPending ? "比较中…" : "比较最近两个版本"}</Button> : "至少导入两个模型版本后可以比较。" : "还没有模型。先创建模型来源。"}</div>}
        {comparison && !changes.length && <p className="pane-empty quiet-message">比较完成，没有构件变更。</p>}
        {(sources.error || comparisons.error || detail.error || compare.error) && <p className="alert" role="alert">{sources.error?.message || comparisons.error?.message || detail.error?.message || compare.error?.message}</p>}
      </div>
    </aside>
    <div className="change-stage">
      <div className="change-stage-heading">{comparison ? `R${from?.sequence ?? "?"} → R${to?.sequence ?? "?"}` : source?.source.name ?? "模型变更"}<span>{source?.has_pending_revision ? "待接受 · 当前基线未变" : "已接受"}</span></div>
      {comparison?.summary.warnings.map((warning) => <p className="continuity-warning" role="status" key={warning}>{warning}</p>)}
      {fileError && <p className="alert" role="alert">{fileError}</p>}
      <BIMWorkspace project={project} impacted={selected ? [selected.global_id] : changes.map((change) => change.global_id)} externalFile={file} hideSourceActions onViewerSelected={setSelectedId} />
    </div>
    <aside className="change-inspector" aria-label="变更详情">
      <header className="spatial-pane-heading">{selected ? "构件变更" : "选择变更"}</header>
      {selected ? <div className="change-inspector-body">
        <h2>{nameFor(selected.global_id)}</h2>
        <dl><dt>变更</dt><dd>{selected.change_kind === "deleted" ? "已删除 · 在旧版本中查看" : selected.change_kind === "added" ? "新增" : selected.changed_aspects.map((aspect) => aspectLabel[aspect] ?? aspect).join("、") || "修改"}</dd><dt>版本</dt><dd>R{from?.sequence ?? "?"} → R{to?.sequence ?? "?"}</dd></dl>
        <h3>受影响工作包</h3>
        {affected.length ? affected.map((item) => <button type="button" key={item.work_package_id} onClick={() => onInspect(item.work_package_id, sourceId, comparison!, selected)}>{demoWorkPackageName(item.work_package_id, workspace.state.work_packages.find((wp) => wp.id === item.work_package_id)?.name ?? item.work_package_id)} →</button>) : <p className="quiet-message">尚无已确认的工作包关联。</p>}
        {element && <><h3>关联依据</h3><p>{element.fact}</p></>}
        <Button size="sm" onClick={() => onInvestigate(sourceId, comparison!.to_revision_id, comparison!.from_revision_id, [selected.global_id])}>调查此变更</Button>
        <details><summary>技术信息</summary><code>{selected.global_id}</code><small>比较依据 {comparison?.evidence_ids.length ?? 0} 条</small></details>
      </div> : <p className="pane-empty quiet-message">在左侧选择一项变更，查看模型位置、关联工作包和依据。</p>}
    </aside>
  </section>;
}
