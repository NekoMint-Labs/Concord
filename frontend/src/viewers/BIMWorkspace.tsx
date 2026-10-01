import {
  lazy,
  Suspense,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useQuery } from "@tanstack/react-query";
import { Box, FolderOpen, PackageOpen } from "lucide-react";
import { api, readSource, type DTO, type Workspace } from "../api/client";
import { useBIMSource } from "./useBIMSource";
import {
  demoConstraintText,
  demoElementName,
} from "../ui/demo/demoPresentation";
import { notify } from "../components/ui/AppToaster";
import { Pane, PaneDivider, PaneSplit, usePanelRef } from "../layout/PaneSplit";
import { SpatialContext } from "./SpatialContext";
import { SpatialInspector } from "./SpatialInspector";
import { AppDisclosure } from "../components/ui/AppDisclosure";
import { propertySections } from "./bimProperties";

const IFCViewer = lazy(() => import("./IFCViewer"));
type Change = DTO<"BimElementChange">;
type Snapshot = DTO<"BimElementSnapshot">;
type Issue = DTO<"Constraint">;
const processingLabels = {
  QUEUED: "等待处理",
  RUNNING: "正在处理",
  WAITING_APPROVAL: "等待审批",
  COMPLETED: "处理完成",
  FAILED: "处理失败",
  CANCELLED: "已取消",
  EXPIRED: "已过期",
};

export type MappingPresentation = {
  contextBar: ReactNode;
  dock: ReactNode;
  candidateIds: readonly string[];
  selectedIds: readonly string[];
  allowedIds: readonly string[];
};

/** The same spatial surface serves the current model, revision comparisons and issues. */
export default function BIMWorkspace({
  project,
  impacted: projectImpacted,
  externalFile,
  externalFileOrigin,
  localFile,
  onLocalFile,
  hideSourceActions = false,
  onViewerSelected,
  focusId,
  autoProjectModel = false,
  selectedSourceId,
  selectedRevisionId,
  workspace: projectWorkspace,
  changes: projectChanges = [],
  snapshots: suppliedSnapshots = [],
  issues: projectIssues = [],
  revisionLabel,
  toolbar,
  onInvestigate,
  onModels,
  mode: projectMode = "model",
  onIssueResolution,
  selectedIssueId,
  onIssueSelected,
  mapping: projectMapping,
  sourceName,
  fromRevisionLabel,
  workPackage: explicitWorkPackage,
  revisionScoped: suppliedRevisionScoped = false,
}: {
  project: string;
  impacted: readonly string[];
  condensed?: boolean;
  externalFile?: File | null;
  externalFileOrigin?: "local" | "project";
  localFile?: File | null;
  onLocalFile?: (file: File | null) => void;
  hideSourceActions?: boolean;
  onViewerSelected?: (id: string) => void;
  focusId?: string;
  autoProjectModel?: boolean;
  selectedSourceId?: string;
  selectedRevisionId?: string;
  workspace?: Workspace;
  changes?: Change[];
  snapshots?: Snapshot[];
  issues?: Issue[];
  revisionLabel?: string;
  toolbar?: ReactNode;
  onInvestigate?: (id: string) => void;
  onModels?: () => void;
  onNavigate?: (tab: "sources" | "documents" | "history") => void;
  onWorkPackage?: (id: string) => void;
  mode?: "model" | "changes" | "issues";
  onIssueResolution?: (id: string) => void;
  selectedIssueId?: string;
  onIssueSelected?: (id: string) => void;
  mapping?: MappingPresentation;
  sourceName?: string;
  fromRevisionLabel?: string;
  workPackage?: DTO<"WorkPackage">;
  revisionScoped?: boolean;
}) {
  const elements = useQuery({
    queryKey: ["bim", project],
    queryFn: () => api.bim(project),
  });
  const {
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
    retry,
    chooseFile,
  } = useBIMSource(project);
  const input = useRef<HTMLInputElement>(null);
  const modelMenu = useRef<HTMLDetailsElement>(null);
  const inspectorPane = usePanelRef();
  useEffect(() => {
    const local =
      localFile ?? (externalFileOrigin === "local" ? externalFile : null);
    if (local && file !== local) {
      setFile(local);
      setSelected("");
    }
  }, [file, localFile, externalFile, externalFileOrigin, setFile, setSelected]);
  const sources = useQuery({
    queryKey: ["sources", project],
    queryFn: () => api.sourceStatuses(project),
    enabled: externalFile === undefined || !hideSourceActions,
  });
  const projectModels =
    sources.data?.filter(
      (item) => item.source.kind === "BIM" && item.latest_revision_id,
    ) ?? [];
  const targetSourceId =
    selectedSourceId ??
    (origin?.kind === "project" ? origin.sourceId : undefined);
  const source =
    externalFile === undefined
      ? targetSourceId
        ? projectModels.find((item) => item.source.id === targetSourceId)
        : autoProjectModel && projectModels.length === 1
          ? projectModels[0]
          : undefined
      : undefined;
  const projectRevisionId =
    selectedRevisionId ??
    (origin?.kind === "project" && origin.sourceId === source?.source.id
      ? origin.revisionId
      : source?.latest_revision_id);
  const sourceImport = useQuery({
    queryKey: [
      "revision-import",
      project,
      source?.source.id,
      projectRevisionId,
    ],
    queryFn: () =>
      api.revisionImport(project, source!.source.id, projectRevisionId!),
    enabled: !!source && !!projectRevisionId,
    refetchInterval: (query) =>
      ["QUEUED", "RUNNING"].includes(query.state.data?.status ?? "")
        ? 1500
        : false,
  });
  const modelRevisions = useQuery({
    queryKey: ["source-revisions", project, source?.source.id],
    queryFn: () => api.sourceRevisions(project, source!.source.id),
    enabled: !!source,
  });
  const revision = useQuery({
    queryKey: ["model-content", project, source?.source.id, projectRevisionId],
    enabled: !!source && !!projectRevisionId && autoProjectModel,
    retry: false,
    queryFn: async () =>
      new File(
        [
          await readSource(
            `/api/projects/${encodeURIComponent(project)}/sources/${encodeURIComponent(source!.source.id)}/revisions/${encodeURIComponent(projectRevisionId!)}/content`,
          ),
        ],
        "project-model.ifc",
      ),
  });
  const hookFile =
    origin?.kind === "project" &&
    ((selectedSourceId && origin.sourceId !== selectedSourceId) ||
      (selectedRevisionId && origin.revisionId !== selectedRevisionId))
      ? null
      : file;
  const viewFile =
    externalFile === undefined
      ? (hookFile ?? revision.data ?? null)
      : externalFile;
  useEffect(() => {
    if (!viewFile) return;
    const dismiss = (event: PointerEvent) => {
      const menu = modelMenu.current;
      if (menu && event.target instanceof Node && !menu.contains(event.target))
        menu.open = false;
    };
    document.addEventListener("pointerdown", dismiss);
    return () => document.removeEventListener("pointerdown", dismiss);
  }, [viewFile]);
  const hasViewFile = !!viewFile;
  useEffect(() => {
    if (!hasViewFile) inspectorPane.current?.collapse();
    else if (inspectorPane.current?.isCollapsed())
      inspectorPane.current.expand();
  }, [hasViewFile, inspectorPane]);
  const isLocal =
    !!viewFile &&
    (externalFile === undefined
      ? origin?.kind === "local" && viewFile === file
      : externalFileOrigin
        ? externalFileOrigin === "local"
        : viewFile === localFile);
  const projectSnapshot = useQuery({
    queryKey: ["bim-snapshot", project, source?.source.id, projectRevisionId],
    queryFn: () =>
      api.bimSnapshot(project, source!.source.id, projectRevisionId!),
    enabled: !isLocal && !!source && !!projectRevisionId,
    retry: false,
  });
  const revisionScoped = !isLocal && (suppliedRevisionScoped || !!source);
  const snapshots = isLocal
    ? []
    : source
      ? (projectSnapshot.data?.elements ?? [])
      : suppliedSnapshots;
  const historical =
    !!source && projectRevisionId !== source.latest_revision_id;
  // Current analysis is not evidence about a historical or local file.
  const impacted = isLocal || historical ? [] : projectImpacted;
  const changes = isLocal || historical ? [] : projectChanges;
  const issues = isLocal || historical ? [] : projectIssues;
  const workspace = isLocal || historical ? undefined : projectWorkspace;
  const mode = isLocal ? "model" : projectMode;
  const mapping = isLocal ? undefined : projectMapping;
  useEffect(() => {
    if (viewFile && !selected && focusId === undefined && impacted.length)
      setSelected(impacted[0]);
  }, [viewFile, selected, focusId, impacted, setSelected]);
  const [context, setContext] = useState<"changes" | "issues">("changes");
  const [listOpen, setListOpen] = useState(false);
  const [inspectorTab, setInspectorTab] = useState<
    "overview" | "changes" | "issues"
  >("overview");
  const [localIssue, setLocalIssue] = useState("");
  const selectedIssue = selectedIssueId ?? localIssue;
  const setSelectedIssue = (id: string) => {
    setLocalIssue(id);
    if (!isLocal) onIssueSelected?.(id);
  };
  const [propertyResult, setPropertyResult] = useState<{
    id: string;
    file: File | null;
    properties: unknown;
  } | null>(null);
  const [inspectorOpen, setInspectorOpen] = useState(true);
  const activeId = isLocal ? selected : (focusId ?? selected);
  const viewerProperties =
    propertyResult?.id === activeId &&
    propertyResult.file === viewFile &&
    (isLocal ||
      !suppliedRevisionScoped ||
      snapshots.some((element) => element.global_id === activeId))
      ? propertyResult.properties
      : null;
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
  const item =
    isLocal || revisionScoped
      ? undefined
      : elements.data?.find((element) => element.id === activeId);
  const snapshot = snapshots.find((element) => element.global_id === activeId);
  const change =
    changes.find((entry) => entry.global_id === activeId) ??
    (!revisionScoped && impacted.includes(activeId)
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
    (activeId
      ? change?.change_kind === "deleted"
        ? "历史变更构件"
        : "所选构件"
      : "选择构件");
  const classification =
    snapshot?.ifc_class ??
    item?.type ??
    (typeof viewerRecord?.type === "string" ? viewerRecord.type : "模型构件");
  const select = (id: string) => {
    if (
      mapping &&
      id &&
      !mapping.allowedIds.includes(id) &&
      !changes.some((change) => change.global_id === id)
    )
      return;
    setSelected(id);
    setPropertyResult(null);
    setSelectedIssue("");
    if (!isLocal) onViewerSelected?.(id);
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
    if (imported.data?.status === "COMPLETED") {
      setFile(null);
      onLocalFile?.(null);
      notify.success("项目模型已处理完成");
    }
    if (imported.data?.status === "FAILED")
      notify.error("模型处理失败", imported.data.error ?? undefined);
  }, [imported.data?.status, imported.data?.error]);
  const feedback =
    error ||
    imported.error?.message ||
    imported.data?.error ||
    sources.error?.message ||
    (!isLocal &&
      (revision.error?.message ||
        projectSnapshot.error?.message ||
        sourceImport.error?.message ||
        modelRevisions.error?.message)) ||
    (!viewFile && !source && sources.isSuccess
      ? elements.error?.message
      : null);
  const opening = !!source && autoProjectModel && revision.isFetching;
  const emptyTitle = revision.isError
    ? "项目模型无法打开"
    : sources.isError
      ? "项目资料暂时不可用"
      : opening
        ? "正在打开项目模型"
        : sources.isPending && sources.fetchStatus !== "idle"
          ? "正在读取项目资料"
          : projectModels.length
            ? "选择项目模型"
            : "当前项目还没有模型";
  const importStatus = sourceImport.data?.status;
  const statusLabel = sourceImport.isError
    ? "处理状态读取失败"
    : importStatus
      ? processingLabels[importStatus]
      : sourceImport.isPending
        ? "正在读取处理状态"
        : "尚未处理";
  const missingModel =
    !viewFile &&
    (feedback?.includes("CCA_IFC_PATH") ||
      feedback?.includes("此项目尚无可打开的模型"));
  const issue = issues.find((entry) => entry.id === selectedIssue);
  const packageFor = (id: string) =>
    workspace?.state.work_packages.find((wp) => wp.element_ids.includes(id));
  const workPackage = isLocal
    ? undefined
    : (explicitWorkPackage ??
      packageFor(activeId) ??
      workspace?.state.work_packages.find(
        (wp) => wp.id === issue?.work_package_id,
      ));
  const rows = isLocal
    ? []
    : changes.length
      ? changes
      : source && !historical
        ? snapshots
            .filter((element) => impacted.includes(element.global_id))
            .map((element) => ({
              global_id: element.global_id,
              change_kind: "changed" as const,
              changed_aspects: ["impact"],
            }))
        : revisionScoped
          ? []
          : (elements.data ?? [])
              .filter((element) => impacted.includes(element.id))
              .map((element) => ({
                global_id: element.id,
                change_kind: "changed" as const,
                changed_aspects: ["impact"],
              }));
  return (
    <section
      className={`bim-workspace spatial-workspace is-${mode}${mapping ? " is-mapping" : ""}${viewFile && listOpen ? " is-list-open" : ""}${!viewFile ? " is-empty" : ""}`}
      aria-label="模型工作区"
    >
      {mapping?.contextBar}
      <PaneSplit id="spatial-inspector" persist>
        <Pane id="spatial-main-pane" className="spatial-main" minSize="320px">
          <div className="spatial-stage">
            {!viewFile && (
              <header className="model-empty-heading">
                <h1>模型</h1>
              </header>
            )}
            {viewFile ? (
              <Suspense
                fallback={
                  <div className="loading-view">正在加载 IFC 查看器…</div>
                }
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
                  mapping={mapping}
                  onProperties={(properties, id) =>
                    setPropertyResult({
                      id: id ?? activeId,
                      file: viewFile,
                      properties,
                    })
                  }
                />
              </Suspense>
            ) : (
              <div className="spatial-stage-empty workspace-empty">
                <h2 className="object-kind">
                  <Box size={17} aria-hidden="true" /> 模型上下文
                </h2>
                <strong>{emptyTitle}</strong>
                <span>
                  {sources.isError || revision.isError
                    ? "项目模型暂时不可用。请重试读取资料或打开模型。"
                    : sources.isPending && sources.fetchStatus !== "idle"
                      ? "正在读取项目资料，请稍候。"
                      : opening
                        ? "正在读取所选 IFC 文件，请稍候。"
                        : projectModels.length
                          ? "到模型版本中选择资料与版本，查看构件和关联工作包。"
                          : "项目模型是版本比较、基线与工作包关联的共同依据。先在项目资料中上传 IFC。"}
                </span>
                {onModels && (
                  <button
                    type="button"
                    className="button button-primary button-sm model-primary-action"
                    onClick={onModels}
                  >
                    {projectModels.length ? "选择项目模型 →" : "添加项目模型 →"}
                  </button>
                )}
                <small>
                  本地 IFC 仅作临时预览，不会自动加入项目或改变基线。
                </small>
              </div>
            )}
            {!isLocal && toolbar && (
              <div className="spatial-context-controls">{toolbar}</div>
            )}
            {mapping && !inspectorOpen && (
              <button
                type="button"
                className="mapping-inspector-toggle"
                onClick={() => inspectorPane.current?.expand()}
              >
                展开检查器
              </button>
            )}
            {!hideSourceActions && (
              <details
                ref={modelMenu}
                onKeyDown={(event) => {
                  if (viewFile && event.key === "Escape") {
                    event.preventDefault();
                    event.stopPropagation();
                    event.currentTarget.open = false;
                    event.currentTarget.querySelector("summary")?.focus();
                  }
                }}
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
                    className="model-open-project"
                    onClick={() => {
                      void openImported(
                        selectedSourceId ?? source?.source.id,
                        selectedRevisionId ?? projectRevisionId ?? undefined,
                      ).then((opened) => {
                        if (opened) onLocalFile?.(null);
                      });
                    }}
                    disabled={
                      busy || (sources.isSuccess && !projectModels.length)
                    }
                    title={
                      sources.isSuccess && !projectModels.length
                        ? "请先添加项目模型"
                        : undefined
                    }
                  >
                    <PackageOpen size={14} /> 打开项目模型
                  </button>
                  {isLocal && file && (
                    <button
                      type="button"
                      onClick={() => void importSource()}
                      disabled={busy}
                    >
                      添加到项目
                    </button>
                  )}
                  {isLocal && file && (
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
                  {viewFile && onModels && (
                    <button type="button" onClick={onModels}>
                      模型版本 →
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
                  ? "还没有项目模型。请在项目资料中添加 IFC；本地 IFC 仅用于临时预览。"
                  : feedback}
                {error && retry && (
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() =>
                      void retry().then((opened) => {
                        if (opened) onLocalFile?.(null);
                      })
                    }
                  >
                    重试
                  </button>
                )}
                {sources.isError && (
                  <button type="button" onClick={() => void sources.refetch()}>
                    重试读取项目资料
                  </button>
                )}
                {!isLocal && revision.isError && (
                  <button type="button" onClick={() => void revision.refetch()}>
                    重试打开项目模型
                  </button>
                )}
                {!isLocal && projectSnapshot.isError && (
                  <button
                    type="button"
                    onClick={() => void projectSnapshot.refetch()}
                  >
                    重试读取构件属性
                  </button>
                )}
                {!isLocal && sourceImport.isError && (
                  <button
                    type="button"
                    onClick={() => void sourceImport.refetch()}
                  >
                    重试读取处理状态
                  </button>
                )}
                {!isLocal && modelRevisions.isError && (
                  <button
                    type="button"
                    onClick={() => void modelRevisions.refetch()}
                  >
                    重试读取模型版本
                  </button>
                )}
                {imported.isError && (
                  <button type="button" onClick={() => void imported.refetch()}>
                    重试读取导入结果
                  </button>
                )}
              </div>
            )}
            {viewFile && (
              <div className="viewer-status spatial-feedback" role="status">
                {isLocal
                  ? `本地预览 · ${viewFile.name} · ${imported.data ? `项目版本${processingLabels[imported.data.status]}` : notice ? "项目版本正在处理" : "尚未添加到项目"}`
                  : source && projectRevisionId
                    ? `${importStatus === "COMPLETED" ? "项目模型" : "项目文件预览"} · R${modelRevisions.data?.find((item) => item.id === projectRevisionId)?.sequence ?? "?"}${importStatus === "COMPLETED" ? "" : ` · ${statusLabel}`}`
                    : "项目模型"}
              </div>
            )}
            {(notice || imported.data) && (
              <div className="viewer-status spatial-feedback" role="status">
                {[
                  imported.data?.status === "COMPLETED"
                    ? "模型处理完成。下一步：关联工作包或确认基线。"
                    : notice,
                  imported.data?.status === "FAILED"
                    ? "模型处理失败，可重试添加到项目。"
                    : imported.data &&
                        ["QUEUED", "RUNNING"].includes(imported.data.status)
                      ? "正在处理项目模型…"
                      : null,
                ]
                  .filter(Boolean)
                  .join(" ")}
              </div>
            )}
          </div>
          {isLocal ? (
            <p className="quiet-message">
              本地预览仅显示文件属性，不关联项目变更、问题或工作包。
              {!inspectorOpen && (
                <button
                  type="button"
                  onClick={() => inspectorPane.current?.expand()}
                >
                  展开检查器
                </button>
              )}
            </p>
          ) : mapping ? (
            mapping.dock
          ) : viewFile ? (
            <SpatialContext
              context={context}
              setContext={setContext}
              open={!!viewFile && listOpen}
              setOpen={setListOpen}
              rows={rows}
              issues={issues}
              activeId={activeId}
              selectedIssue={selectedIssue}
              snapshots={snapshots}
              elements={revisionScoped ? undefined : elements.data}
              workspace={workspace}
              revisionLabel={revisionLabel}
              onSelect={select}
              onIssue={chooseIssue}
              onExpandInspector={
                inspectorOpen
                  ? undefined
                  : () => inspectorPane.current?.expand()
              }
            />
          ) : null}
        </Pane>
        {/* Keep the library's separator mapping registered while collapsed;
            native inert removes hidden controls from pointer and keyboard use. */}
        <PaneDivider
          label="调整构件详情宽度"
          inert={!inspectorOpen || !viewFile}
        />
        <Pane
          id="spatial-inspector-pane"
          panelRef={inspectorPane}
          className="spatial-inspector-pane"
          defaultSize="320px"
          minSize="270px"
          maxSize="460px"
          collapsible
          collapsedSize="0px"
          onResize={(size) => setInspectorOpen(size.inPixels > 0)}
        >
          {!viewFile ? null : isLocal ? (
            <aside
              className="spatial-inspector"
              aria-label="构件详情"
              inert={!inspectorOpen}
            >
              <header className="spatial-inspector-head">
                <Box size={18} />
                <div>
                  <h2>{title}</h2>
                  <span>{classification}</span>
                </div>
              </header>
              <div className="spatial-inspector-body">
                <p className="quiet-message">本地 IFC 文件属性 · 未关联项目</p>
                {!activeId ? (
                  <p>双击模型构件查看文件属性。</p>
                ) : (
                  <AppDisclosure label="技术详情">
                    <dl className="element-facts">
                      <div>
                        <dt>GlobalId</dt>
                        <dd>{activeId}</dd>
                      </div>
                    </dl>
                    {propertySections(viewerProperties).map((section, i) => (
                      <div className="technical-properties" key={i}>
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
                )}
              </div>
            </aside>
          ) : (
            <SpatialInspector
              mode={mode}
              issue={issue}
              title={title}
              classification={classification}
              inspectorTab={inspectorTab}
              setInspectorTab={setInspectorTab}
              activeId={activeId}
              change={change}
              linkedIssues={linkedIssues}
              item={item}
              snapshot={snapshot}
              geometryAvailable={
                mapping ? mapping.allowedIds.includes(activeId) : undefined
              }
              workPackage={workPackage}
              revisionLabel={revisionLabel}
              sourceName={sourceName ?? source?.source.name}
              fromRevisionLabel={fromRevisionLabel}
              viewFile={viewFile}
              viewerProperties={viewerProperties}
              elements={revisionScoped ? undefined : elements.data}
              workspace={workspace}
              inspectorOpen={inspectorOpen}
              inspectorPane={inspectorPane}
              select={select}
              chooseIssue={chooseIssue}
              onIssueResolution={onIssueResolution}
              onInvestigate={onInvestigate}
              openChanges={() => {
                setContext("changes");
                setListOpen(true);
              }}
            />
          )}
        </Pane>
      </PaneSplit>
    </section>
  );
}
