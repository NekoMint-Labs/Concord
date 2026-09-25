import {
  lazy,
  Suspense,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Box,
  ChevronRight,
  FolderOpen,
  MoreHorizontal,
  PackageOpen,
} from "lucide-react";
import { api, readSource, type DTO, type Workspace } from "../api/client";
import { useBIMSource } from "./useBIMSource";
import { propertySections } from "./bimProperties";
import {
  demoConstraintKind,
  demoConstraintText,
  demoElementName,
  demoWorkPackageName,
} from "../ui/demo/demoPresentation";
import { statusLabel } from "../ui/labels";
import { AppDisclosure } from "../components/ui/AppDisclosure";
import { notify } from "../components/ui/AppToaster";

const IFCViewer = lazy(() => import("./IFCViewer"));
type Change = DTO<"BimElementChange">;
type Snapshot = DTO<"BimElementSnapshot">;
type Issue = DTO<"Constraint">;

/** The same spatial surface serves the current model, revision comparisons and issues. */
export default function BIMWorkspace({
  project,
  impacted,
  externalFile,
  localFile,
  onLocalFile,
  hideSourceActions = false,
  onViewerSelected,
  focusId,
  autoProjectModel = false,
  workspace,
  changes = [],
  snapshots = [],
  issues = [],
  revisionLabel,
  toolbar,
  onInvestigate,
  onModels,
  onWorkPackage,
  mode = "model",
  onIssueResolution,
}: {
  project: string;
  impacted: readonly string[];
  condensed?: boolean;
  externalFile?: File | null;
  localFile?: File | null;
  onLocalFile?: (file: File | null) => void;
  hideSourceActions?: boolean;
  onViewerSelected?: (id: string) => void;
  focusId?: string;
  autoProjectModel?: boolean;
  workspace?: Workspace;
  changes?: Change[];
  snapshots?: Snapshot[];
  issues?: Issue[];
  revisionLabel?: string;
  toolbar?: ReactNode;
  onInvestigate?: (id: string) => void;
  onModels?: () => void;
  onWorkPackage?: (id: string) => void;
  mode?: "model" | "changes" | "issues";
  onIssueResolution?: (id: string) => void;
}) {
  const elements = useQuery({
    queryKey: ["bim", project],
    queryFn: () => api.bim(project),
  });
  const {
    selected,
    setSelected,
    file,
    setFile,
    error,
    notice,
    busy,
    imported,
    importSource,
    openImported,
    chooseFile,
  } = useBIMSource(project);
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (localFile && file !== localFile) setFile(localFile);
  }, [file, localFile, setFile]);
  const sources = useQuery({
    queryKey: ["sources", project],
    queryFn: () => api.sourceStatuses(project),
    enabled: autoProjectModel && externalFile === undefined,
  });
  const source = sources.data?.find(
    (item) => item.source.kind === "BIM" && item.latest_revision_id,
  );
  const revision = useQuery({
    queryKey: [
      "model-content",
      project,
      source?.source.id,
      source?.latest_revision_id,
    ],
    enabled: !!source?.latest_revision_id && autoProjectModel,
    retry: false,
    queryFn: async () =>
      new File(
        [
          await readSource(
            `/api/projects/${encodeURIComponent(project)}/sources/${encodeURIComponent(source!.source.id)}/revisions/${encodeURIComponent(source!.latest_revision_id!)}/content`,
          ),
        ],
        "project-model.ifc",
      ),
  });
  const viewFile =
    externalFile === undefined ? (file ?? revision.data ?? null) : externalFile;
  useEffect(() => {
    if (viewFile && !selected && !focusId && impacted.length)
      setSelected(impacted[0]);
  }, [viewFile, selected, focusId, impacted, setSelected]);
  const [context, setContext] = useState<"changes" | "issues">("changes");
  const [listOpen, setListOpen] = useState(false);
  const [inspectorTab, setInspectorTab] = useState<
    "overview" | "changes" | "issues" | "documents"
  >("overview");
  const [selectedIssue, setSelectedIssue] = useState("");
  const [viewerProperties, setViewerProperties] = useState<unknown>(null);
  const viewerRecord =
    viewerProperties && typeof viewerProperties === "object"
      ? (viewerProperties as Record<string, unknown>)
      : null;
  const viewerName = viewerRecord?.Name;
  const modelName =
    typeof viewerName === "string"
      ? viewerName
      : viewerName && typeof viewerName === "object" && "value" in viewerName
        ? String(viewerName.value)
        : "";
  const activeId = focusId ?? selected;
  const item = elements.data?.find((element) => element.id === activeId);
  const snapshot = snapshots.find((element) => element.global_id === activeId);
  const change =
    changes.find((entry) => entry.global_id === activeId) ??
    (impacted.includes(activeId)
      ? {
          global_id: activeId,
          change_kind: "changed" as const,
          changed_aspects: ["impact"],
        }
      : undefined);
  const linkedIssues = issues.filter((issue) => {
    const evidence = workspace?.analysis?.evidence.filter((entry) =>
      issue.evidence_ids.includes(entry.id),
    );
    return !activeId
      ? issue.id === selectedIssue
      : evidence?.some((entry) => entry.element_ids.includes(activeId));
  });
  const title =
    (snapshot &&
      demoElementName(
        snapshot.global_id,
        snapshot.name ?? snapshot.global_id,
      )) ||
    (item && demoElementName(item.id, item.name)) ||
    modelName ||
    (activeId ? "所选构件" : "选择构件");
  const classification =
    snapshot?.ifc_class ??
    item?.type ??
    (typeof viewerRecord?.type === "string" ? viewerRecord.type : "模型构件");
  const select = (id: string) => {
    setSelected(id);
    setSelectedIssue("");
    onViewerSelected?.(id);
  };
  const chooseIssue = (issue: Issue) => {
    setContext("issues");
    setSelectedIssue(issue.id);
    setInspectorTab("issues");
    const id = workspace?.analysis?.evidence
      .filter((entry) => issue.evidence_ids.includes(entry.id))
      .flatMap((entry) => entry.element_ids)[0];
    if (id) select(id);
    setSelectedIssue(issue.id);
  };
  useEffect(() => {
    if (mode === "issues" && !selectedIssue && issues[0])
      chooseIssue(issues[0]);
  }, [mode, selectedIssue, issues[0]?.id]);
  useEffect(() => {
    if (imported.data?.status === "COMPLETED") notify.success("IFC 导入完成");
    if (imported.data?.status === "FAILED")
      notify.error("IFC 导入失败", imported.data.error ?? undefined);
  }, [imported.data?.status, imported.data?.error]);
  const feedback =
    error ||
    elements.error?.message ||
    imported.error?.message ||
    imported.data?.error;
  const missingModel =
    feedback?.includes("CCA_IFC_PATH") ||
    feedback?.includes("此项目尚无可打开的模型");
  const issue = issues.find((entry) => entry.id === selectedIssue);
  const packageFor = (id: string) =>
    workspace?.state.work_packages.find((wp) => wp.element_ids.includes(id));
  const workPackage =
    packageFor(activeId) ??
    workspace?.state.work_packages.find(
      (wp) => wp.id === issue?.work_package_id,
    );
  const readinessFor = (id: string) =>
    workspace?.analysis?.readiness.find(
      (entry) => entry.work_package_id === packageFor(id)?.id,
    )?.status;
  const rows = changes.length
    ? changes
    : (elements.data ?? [])
        .filter((element) => impacted.includes(element.id))
        .map((element) => ({
          global_id: element.id,
          change_kind: "changed" as const,
          changed_aspects: ["impact"],
        }));
  const description = (aspects: string[]) =>
    aspects
      .map(
        (aspect) =>
          ({
            placement: "位置变更",
            geometry: "几何变更",
            attributes: "属性变更",
            properties: "属性集变更",
            impact: "受设计变更影响",
          })[aspect] ?? aspect,
      )
      .join(" · ");

  return (
    <section
      className={`bim-workspace spatial-workspace is-${mode}${listOpen ? " is-list-open" : ""}`}
      aria-label="模型工作区"
    >
      <div className="spatial-stage">
        {viewFile ? (
          <Suspense
            fallback={<div className="loading-view">正在加载 IFC 查看器…</div>}
          >
            <IFCViewer
              file={viewFile}
              impacted={impacted}
              onSelected={select}
              focusId={activeId || undefined}
              selectedLabel={activeId ? title : undefined}
              issueLabel={
                issue || linkedIssues[0]
                  ? demoConstraintText(
                      (issue ?? linkedIssues[0]).kind,
                      (issue ?? linkedIssues[0]).description,
                    )
                  : undefined
              }
              onProperties={setViewerProperties}
            />
          </Suspense>
        ) : (
          <div className="spatial-stage-empty">
            <Box aria-hidden="true" />
            <strong>打开模型以查看构件与上下文</strong>
            <span>
              {revision.isPending && source
                ? "正在打开项目模型…"
                : "选择本地 IFC 文件，或打开项目模型。"}
            </span>
          </div>
        )}
        {toolbar && <div className="spatial-context-controls">{toolbar}</div>}
        {!hideSourceActions && (
          <details
            key={viewFile ? "loaded" : "empty"}
            className={`spatial-source-actions${viewFile ? " is-loaded" : ""}`}
            open={!viewFile}
          >
            <summary>模型</summary>
            <div>
              <input
                ref={input}
                hidden
                type="file"
                accept=".ifc"
                disabled={busy}
                aria-label="本地 IFC 文件"
                onChange={(event) => {
                  const chosen = event.target.files?.[0];
                  chooseFile(chosen);
                  onLocalFile?.(
                    chosen &&
                      chosen.size <= 25 * 1024 * 1024 &&
                      chosen.size &&
                      chosen.name.toLowerCase().endsWith(".ifc")
                      ? chosen
                      : null,
                  );
                  event.target.value = "";
                }}
              />
              <button
                type="button"
                onClick={() => input.current?.click()}
                disabled={busy}
              >
                <FolderOpen size={14} /> 打开本地 IFC
              </button>
              <button
                type="button"
                onClick={() => void openImported()}
                disabled={busy}
              >
                <PackageOpen size={14} /> 打开项目模型
              </button>
              {file && (
                <button
                  type="button"
                  onClick={() => void importSource()}
                  disabled={busy}
                >
                  导入项目
                </button>
              )}
              {file && (
                <button
                  type="button"
                  onClick={() => {
                    setFile(null);
                    onLocalFile?.(null);
                    select("");
                  }}
                >
                  关闭本地视图
                </button>
              )}
              {onModels && (
                <button type="button" onClick={onModels}>
                  模型生命周期 →
                </button>
              )}
            </div>
          </details>
        )}
        {feedback && (
          <div
            className={
              missingModel
                ? "spatial-feedback model-hint"
                : "alert spatial-feedback"
            }
            role={missingModel ? "status" : "alert"}
          >
            {feedback.includes("CCA_IFC_PATH")
              ? "此项目尚无可打开的模型，请先导入本地 IFC 文件。"
              : feedback}
          </div>
        )}
        {(notice || imported.data) && (
          <div className="viewer-status spatial-feedback" role="status">
            {[
              notice,
              imported.data && `导入 ${statusLabel(imported.data.status)}。`,
            ]
              .filter(Boolean)
              .join(" ")}
          </div>
        )}
      </div>
      <aside className="spatial-inspector" aria-label="构件详情">
        <header className="spatial-inspector-head">
          <Box size={18} strokeWidth={1.6} />
          <div>
            <h2>
              {mode === "issues" && issue
                ? "问题 · " + demoConstraintKind(issue.kind)
                : title}
            </h2>
            <span>
              {mode === "issues" && issue
                ? demoConstraintText(issue.kind, issue.description)
                : classification}
            </span>
          </div>
          <MoreHorizontal size={16} aria-hidden="true" />
        </header>
        {mode !== "issues" && (
          <div
            className="spatial-inspector-tabs"
            role="tablist"
            aria-label="构件上下文"
          >
            {(["overview", "changes", "issues", "documents"] as const).map(
              (tab) => (
                <button
                  key={tab}
                  type="button"
                  role="tab"
                  aria-selected={inspectorTab === tab}
                  onClick={() => setInspectorTab(tab)}
                >
                  {
                    {
                      overview: "概览",
                      changes: "变更",
                      issues: "问题",
                      documents: "文档",
                    }[tab]
                  }
                  {tab === "changes" && changes.length > 0 ? (
                    <small>{changes.length}</small>
                  ) : tab === "issues" && linkedIssues.length > 0 ? (
                    <small>{linkedIssues.length}</small>
                  ) : null}
                </button>
              ),
            )}
          </div>
        )}
        <div className="spatial-inspector-body">
          {mode === "changes" && change && (
            <section className="comparison-inspection">
              <span className="context-status">
                {change.change_kind === "added"
                  ? "新增"
                  : change.change_kind === "deleted"
                    ? "删除"
                    : "修改"}
              </span>
              <h3>修订记录</h3>
              <div className="comparison-step">
                <strong>R2</strong>
                <span>{description(change.changed_aspects)}</span>
              </div>
              <div className="comparison-step">
                <strong>R1</strong>
                <span>上一模型版本</span>
              </div>
              <h3>变更标识</h3>
              <p>所选构件以蓝色标识，其他变更构件以琥珀色标识。</p>
              <button
                type="button"
                onClick={() => {
                  setContext("changes");
                  setListOpen(true);
                }}
              >
                在变更列表中查看 →
              </button>
            </section>
          )}
          {mode === "issues" && issue && (
            <section className="issue-inspection issue-primary">
              <h3>详情</h3>
              <dl className="element-facts">
                <div>
                  <dt>类型</dt>
                  <dd>{demoConstraintKind(issue.kind)}</dd>
                </div>
                <div>
                  <dt>优先级</dt>
                  <dd className="issue-priority">阻塞</dd>
                </div>
                <div>
                  <dt>工作包</dt>
                  <dd>
                    {workPackage
                      ? demoWorkPackageName(workPackage.id, workPackage.name)
                      : "—"}
                  </dd>
                </div>
                <div>
                  <dt>楼层</dt>
                  <dd>{snapshot?.storey ?? item?.storey ?? "—"}</dd>
                </div>
              </dl>
              <h3>描述</h3>
              <p>{demoConstraintText(issue.kind, issue.description)}</p>
              <h3>判断依据</h3>
              <p>
                {workspace?.analysis?.evidence
                  .filter((entry) => issue.evidence_ids.includes(entry.id))
                  .map((entry) => demoConstraintText(issue.kind, entry.fact))
                  .join(" · ") || "暂无关联的空间判断依据。"}
              </p>
              {onIssueResolution && (
                <button
                  type="button"
                  className="issue-resolution"
                  onClick={() => onIssueResolution(issue.id)}
                >
                  查看处理建议 →
                </button>
              )}
            </section>
          )}
          {mode !== "issues" &&
            (item || snapshot || (activeId && viewerRecord)) && (
              <>
                {inspectorTab === "overview" && (
                  <>
                    <div className="element-identity">
                      <Box size={44} strokeWidth={1} />
                      <span>{classification}</span>
                    </div>
                    <dl className="element-facts">
                      <div>
                        <dt>类别</dt>
                        <dd>{classification}</dd>
                      </div>
                      <div>
                        <dt>系统</dt>
                        <dd>{item?.space ?? snapshot?.space ?? "—"}</dd>
                      </div>
                      <div>
                        <dt>楼层</dt>
                        <dd>{snapshot?.storey ?? item?.storey ?? "—"}</dd>
                      </div>
                      <div>
                        <dt>工作包</dt>
                        <dd>
                          {workPackage
                            ? demoWorkPackageName(
                                workPackage.id,
                                workPackage.name,
                              )
                            : "—"}
                        </dd>
                      </div>
                      <div>
                        <dt>模型</dt>
                        <dd>
                          {revisionLabel ??
                            source?.source.name ??
                            viewFile?.name ??
                            "—"}
                        </dd>
                      </div>
                    </dl>
                  </>
                )}
                {(inspectorTab === "overview" ||
                  inspectorTab === "changes") && (
                  <section className="element-section">
                    <h3>
                      变更 <small>{change ? 1 : 0}</small>
                    </h3>
                    {change ? (
                      <button
                        type="button"
                        className="element-context-row"
                        onClick={() => {
                          setContext("changes");
                          setListOpen(true);
                        }}
                      >
                        <i className="dot amber" />
                        {description(change.changed_aspects)}
                        <ChevronRight size={13} />
                      </button>
                    ) : (
                      <p className="quiet-message">此构件暂无变更。</p>
                    )}
                  </section>
                )}
                {(inspectorTab === "overview" || inspectorTab === "issues") && (
                  <section className="element-section">
                    <h3>
                      问题 <small>{linkedIssues.length}</small>
                    </h3>
                    {linkedIssues.map((entry) => (
                      <button
                        type="button"
                        className="element-context-row"
                        key={entry.id}
                        onClick={() => chooseIssue(entry)}
                      >
                        <i className="dot red" />
                        {demoConstraintText(entry.kind, entry.description)}
                        <ChevronRight size={13} />
                      </button>
                    ))}
                    {!linkedIssues.length && (
                      <p className="quiet-message">暂无关联问题。</p>
                    )}
                  </section>
                )}
                {inspectorTab === "documents" && (
                  <p className="quiet-message">此构件暂无关联文档。</p>
                )}
                {inspectorTab === "overview" && (
                  <>
                    <section className="element-section">
                      <h3>关联构件</h3>
                      {item?.related_ids.map((id) => (
                        <button
                          type="button"
                          className="element-context-row"
                          key={id}
                          onClick={() => select(id)}
                        >
                          <Box size={13} />
                          {demoElementName(
                            id,
                            elements.data?.find((e) => e.id === id)?.name ?? id,
                          )}
                          <ChevronRight size={13} />
                        </button>
                      ))}
                    </section>
                    <AppDisclosure label="技术详情">
                      <dl className="element-facts">
                        <div>
                          <dt>GlobalId</dt>
                          <dd className="mono">{activeId}</dd>
                        </div>
                        <div>
                          <dt>修订</dt>
                          <dd>{item?.revision ?? snapshot?.revision_id}</dd>
                        </div>
                      </dl>
                      {propertySections(
                        item?.properties ?? viewerProperties,
                      ).map((section, i) => (
                        <div key={i} className="technical-properties">
                          <strong>{section.title ?? "其他属性"}</strong>
                          <dl>
                            {section.fields.map((field, j) => (
                              <div key={j}>
                                <dt>{field.label}</dt>
                                <dd>{field.value}</dd>
                              </div>
                            ))}
                          </dl>
                        </div>
                      ))}
                    </AppDisclosure>
                  </>
                )}
              </>
            )}
          {mode !== "issues" && issue && (
            <section className="element-section issue-inspection">
              <h3>问题上下文</h3>
              <p>{demoConstraintText(issue.kind, issue.description)}</p>
              <small>
                工作包 ·{" "}
                {demoWorkPackageName(
                  issue.work_package_id,
                  workspace?.state.work_packages.find(
                    (wp) => wp.id === issue.work_package_id,
                  )?.name ?? issue.work_package_id,
                )}
              </small>
            </section>
          )}
          {!item && !snapshot && !issue && (
            <p className="quiet-message">
              选择模型构件或下方列表项，查看相关上下文。
            </p>
          )}
          {change && onInvestigate && (
            <button
              type="button"
              className="investigate-link"
              onClick={() => onInvestigate(activeId)}
            >
              调查变更 →
            </button>
          )}
        </div>
      </aside>
      <section className="spatial-context" aria-label="模型上下文">
        <header className="spatial-context-header">
          <div className="spatial-context-tabs">
            <button
              type="button"
              className={context === "changes" ? "active" : ""}
              onClick={() => {
                setContext("changes");
                setListOpen(true);
              }}
            >
              变更 <small>{rows.length}</small>
            </button>
            <button
              type="button"
              className={context === "issues" ? "active" : ""}
              onClick={() => {
                setContext("issues");
                setListOpen(true);
              }}
            >
              问题 <small>{issues.length}</small>
            </button>
            <button
              type="button"
              disabled={!workPackage || !onWorkPackage}
              onClick={() => workPackage && onWorkPackage?.(workPackage.id)}
            >
              工作包
            </button>
          </div>
          <span>{revisionLabel}</span>
          <button
            type="button"
            aria-label={listOpen ? "收起上下文列表" : "展开上下文列表"}
            aria-expanded={listOpen}
            onClick={() => setListOpen((open) => !open)}
          >
            <MoreHorizontal size={16} />
          </button>
        </header>
        <div className="spatial-context-scroll">
          {context === "changes" ? (
            <table>
              <thead>
                <tr>
                  <th>类型</th>
                  <th>构件</th>
                  <th>描述</th>
                  <th>影响</th>
                  <th>状态</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {rows.map((entry) => (
                  <tr
                    key={entry.global_id}
                    className={activeId === entry.global_id ? "selected" : ""}
                    onClick={() => select(entry.global_id)}
                  >
                    <td>
                      <i className="dot blue" />
                      {entry.change_kind === "added"
                        ? "新增"
                        : entry.change_kind === "deleted"
                          ? "删除"
                          : "修改"}
                    </td>
                    <td>
                      <button
                        type="button"
                        onClick={() => select(entry.global_id)}
                      >
                        {demoElementName(
                          entry.global_id,
                          snapshots.find((s) => s.global_id === entry.global_id)
                            ?.name ||
                            elements.data?.find((e) => e.id === entry.global_id)
                              ?.name ||
                            entry.global_id,
                        )}
                      </button>
                    </td>
                    <td>{description(entry.changed_aspects)}</td>
                    <td>
                      {packageFor(entry.global_id)
                        ? demoWorkPackageName(
                            packageFor(entry.global_id)!.id,
                            packageFor(entry.global_id)!.name,
                          )
                        : "—"}
                    </td>
                    <td>
                      <span
                        className={`context-status${readinessFor(entry.global_id) === "READY" ? " is-ready" : ""}`}
                      >
                        {readinessFor(entry.global_id) === "READY"
                          ? "就绪"
                          : "待复核"}
                      </span>
                    </td>
                    <td>›</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <table>
              <thead>
                <tr>
                  <th>问题</th>
                  <th>工作包</th>
                  <th>上下文</th>
                  <th>状态</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {issues.map((entry) => (
                  <tr
                    key={entry.id}
                    className={selectedIssue === entry.id ? "selected" : ""}
                    onClick={() => chooseIssue(entry)}
                  >
                    <td>
                      <i className="dot red" />
                      {demoConstraintText(entry.kind, entry.description)}
                    </td>
                    <td>
                      {demoWorkPackageName(
                        entry.work_package_id,
                        workspace?.state.work_packages.find(
                          (wp) => wp.id === entry.work_package_id,
                        )?.name ?? entry.work_package_id,
                      )}
                    </td>
                    <td>{demoConstraintKind(entry.kind)}</td>
                    <td>
                      <span className="context-status is-open">待处理</span>
                    </td>
                    <td>›</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          {(context === "changes" ? !rows.length : !issues.length) && (
            <p className="context-empty">
              {context === "changes"
                ? "当前上下文暂无模型变更。"
                : "当前上下文暂无空间问题。"}
            </p>
          )}
        </div>
      </section>
    </section>
  );
}
