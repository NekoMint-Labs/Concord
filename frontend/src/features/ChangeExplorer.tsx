import type { DTO, Workspace } from "../api/client";
import { useChangeComparison, type ChangeKind } from "./useChangeComparison";
import { Button } from "../components/ui/button";
import BIMWorkspace from "../viewers/BIMWorkspace";
import { demoWorkPackageName } from "../ui/demo/demoPresentation";

const kinds: { value: ChangeKind; label: string }[] = [
  { value: "all", label: "全部" },
  { value: "added", label: "新增" },
  { value: "deleted", label: "删除" },
  { value: "changed", label: "修改" },
];
const aspectLabel: Record<string, string> = {
  geometry: "几何",
  placement: "位置",
  attributes: "属性",
  properties: "属性",
};

/** A comparison is authoritative server data; selection only controls presentation. */
export function ChangeExplorer({
  project,
  workspace,
  onModels,
  onInspect,
  onInvestigate,
}: {
  project: string;
  workspace: Workspace;
  onModels: () => void;
  onInspect: (
    workPackageId: string,
    sourceId: string,
    comparison: DTO<"RevisionComparison">,
    change: DTO<"BimElementChange">,
  ) => void;
  onInvestigate: (
    sourceId: string,
    revisionId: string,
    fromRevisionId: string,
    elementIds: string[],
  ) => void;
}) {
  const {
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
  } = useChangeComparison(project);

  const changes = detail.data?.changes ?? [];
  const visible =
    kind === "all"
      ? changes
      : changes.filter((change) => change.change_kind === kind);
  const selected = changes.find((change) => change.global_id === selectedId);
  const affected =
    detail.data?.affected_work_packages.filter((item) =>
      item.changes.some((change) => change.global_id === selectedId),
    ) ?? [];
  const from = revisions.data?.find(
    (item) => item.id === comparison?.from_revision_id,
  );
  const to = revisions.data?.find(
    (item) => item.id === comparison?.to_revision_id,
  );
  const element = workspace.analysis?.evidence.find((item) =>
    item.element_ids.includes(selectedId),
  );
  return (
    <section className="change-workspace" aria-label="版本变更">
      <aside className="change-explorer" aria-label="变更构件">
        <header className="spatial-pane-heading">
          <strong>变更</strong>
          <button type="button" onClick={onModels}>
            模型版本 →
          </button>
        </header>
        <label className="change-source-label">
          模型
          <select
            value={sourceId}
            onChange={(event) => {
              setSourceId(event.target.value);
              setComparisonId("");
            }}
            aria-label="比较模型"
          >
            {models.map((model) => (
              <option value={model.source.id} key={model.source.id}>
                {model.source.name}
              </option>
            ))}
          </select>
        </label>
        {comparison && (
          <label className="change-source-label">
            比较
            <select
              value={comparisonId}
              onChange={(event) => setComparisonId(event.target.value)}
              aria-label="版本比较"
            >
              {comparisons.data?.map((item) => (
                <option value={item.id} key={item.id}>
                  R
                  {revisions.data?.find(
                    (revision) => revision.id === item.from_revision_id,
                  )?.sequence ?? "?"}{" "}
                  → R
                  {revisions.data?.find(
                    (revision) => revision.id === item.to_revision_id,
                  )?.sequence ?? "?"}
                </option>
              ))}
            </select>
          </label>
        )}
        {comparison && (
          <div className="change-filters" aria-label="变更类型">
            {kinds.map((option) => (
              <button
                type="button"
                key={option.value}
                aria-pressed={kind === option.value}
                onClick={() => setKind(option.value)}
              >
                {option.label}{" "}
                <span>
                  {option.value === "all"
                    ? changes.length
                    : changes.filter(
                        (change) => change.change_kind === option.value,
                      ).length}
                </span>
              </button>
            ))}
          </div>
        )}
        <div className="change-list">
          {visible.map((change) => (
            <button
              key={`${change.change_kind}:${change.global_id}`}
              type="button"
              aria-pressed={selectedId === change.global_id}
              onClick={() => {
                setSelectedId(change.global_id);
                setShownRevision(
                  change.change_kind === "deleted" ? "from" : "to",
                );
              }}
            >
              <strong>{nameFor(change.global_id)}</strong>
              <small>
                {change.change_kind === "deleted"
                  ? "已删除"
                  : change.change_kind === "added"
                    ? "新增"
                    : "修改"}{" "}
                ·{" "}
                {change.changed_aspects
                  .map((aspect) => aspectLabel[aspect] ?? aspect)
                  .join("、") || "构件"}
              </small>
            </button>
          ))}
          {!comparison && (
            <div className="pane-empty quiet-message">
              {models.length ? (
                revisions.data && revisions.data.length >= 2 ? (
                  <Button
                    size="sm"
                    disabled={compare.isPending}
                    onClick={() => compare.mutate()}
                  >
                    {compare.isPending ? "比较中…" : "比较最近两个版本"}
                  </Button>
                ) : (
                  "至少导入两个模型版本后可以比较。"
                )
              ) : (
                "还没有模型。先创建模型来源。"
              )}
            </div>
          )}
          {comparison && !changes.length && (
            <p className="pane-empty quiet-message">比较完成，没有构件变更。</p>
          )}
          {(sources.error ||
            comparisons.error ||
            detail.error ||
            compare.error) && (
            <p className="alert" role="alert">
              {sources.error?.message ||
                comparisons.error?.message ||
                detail.error?.message ||
                compare.error?.message}
            </p>
          )}
        </div>
      </aside>
      <div className="change-stage">
        <div className="change-stage-heading">
          {comparison
            ? `R${from?.sequence ?? "?"} → R${to?.sequence ?? "?"}`
            : (source?.source.name ?? "模型变更")}
          <span>
            {comparison
              ? `查看 R${shownRevision === "from" ? (from?.sequence ?? "?") : (to?.sequence ?? "?")} · ${source?.has_pending_revision ? "待接受" : "已接受"}`
              : ""}
          </span>
        </div>
        {comparison?.summary.warnings.map((warning) => (
          <p className="continuity-warning" role="status" key={warning}>
            {warning}
          </p>
        ))}
        {fileError && (
          <p className="alert" role="alert">
            {fileError}
          </p>
        )}
        <BIMWorkspace
          project={project}
          impacted={
            selected
              ? [selected.global_id]
              : changes.map((change) => change.global_id)
          }
          focusId={selected?.global_id}
          externalFile={file}
          hideSourceActions
          onViewerSelected={setSelectedId}
        />
      </div>
      <aside className="change-inspector" aria-label="变更详情">
        <header className="spatial-pane-heading">
          {selected ? "构件变更" : "选择变更"}
        </header>
        {selected ? (
          <div className="change-inspector-body">
            <h2>{nameFor(selected.global_id)}</h2>
            <dl>
              <dt>变更</dt>
              <dd>
                {selected.change_kind === "deleted"
                  ? "已删除 · 在旧版本中查看"
                  : selected.change_kind === "added"
                    ? "新增"
                    : selected.changed_aspects
                        .map((aspect) => aspectLabel[aspect] ?? aspect)
                        .join("、") || "修改"}
              </dd>
              <dt>版本</dt>
              <dd>
                R{from?.sequence ?? "?"} → R{to?.sequence ?? "?"}
              </dd>
            </dl>
            <div className="revision-switch" aria-label="显示版本">
              <button
                type="button"
                aria-pressed={shownRevision === "from"}
                onClick={() => setShownRevision("from")}
              >
                旧版 R{from?.sequence ?? "?"}
              </button>
              <button
                type="button"
                aria-pressed={shownRevision === "to"}
                onClick={() => setShownRevision("to")}
              >
                新版 R{to?.sequence ?? "?"}
              </button>
            </div>
            <h3>受影响工作包</h3>
            {affected.length ? (
              affected.map((item) => (
                <button
                  type="button"
                  key={item.work_package_id}
                  onClick={() =>
                    onInspect(
                      item.work_package_id,
                      sourceId,
                      comparison!,
                      selected,
                    )
                  }
                >
                  {demoWorkPackageName(
                    item.work_package_id,
                    workspace.state.work_packages.find(
                      (wp) => wp.id === item.work_package_id,
                    )?.name ?? item.work_package_id,
                  )}{" "}
                  →
                </button>
              ))
            ) : (
              <p className="quiet-message">尚无已确认的工作包关联。</p>
            )}
            {element && (
              <>
                <h3>关联依据</h3>
                <p>{element.fact}</p>
              </>
            )}
            <Button
              size="sm"
              onClick={() =>
                onInvestigate(
                  sourceId,
                  comparison!.to_revision_id,
                  comparison!.from_revision_id,
                  [selected.global_id],
                )
              }
            >
              调查此变更
            </Button>
            <details>
              <summary>技术信息</summary>
              <code>{selected.global_id}</code>
              <small>比较依据 {comparison?.evidence_ids.length ?? 0} 条</small>
            </details>
          </div>
        ) : (
          <p className="pane-empty quiet-message">
            在左侧选择一项变更，查看模型位置、关联工作包和依据。
          </p>
        )}
      </aside>
    </section>
  );
}
