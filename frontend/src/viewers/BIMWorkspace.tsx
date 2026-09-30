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
  demoConstraintKind,
  demoConstraintText,
  demoElementName,
} from "../ui/demo/demoPresentation";
import { notify } from "../components/ui/AppToaster";
import { Pane, PaneDivider, PaneSplit, usePanelRef } from "../layout/PaneSplit";
import { SpatialContext } from "./SpatialContext";
import { SpatialInspector } from "./SpatialInspector";

const IFCViewer = lazy(() => import("./IFCViewer"));
type Change = DTO<"BimElementChange">;
type Snapshot = DTO<"BimElementSnapshot">;
type Issue = DTO<"Constraint">;

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
  onNavigate,
  onWorkPackage,
  mode = "model",
  onIssueResolution,
  selectedIssueId,
  onIssueSelected,
  mapping,
  sourceName,
  fromRevisionLabel,
  workPackage: explicitWorkPackage,
  revisionScoped = false,
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
  const inspectorPane = usePanelRef();
  useEffect(() => {
    if (localFile && file !== localFile) setFile(localFile);
  }, [file, localFile, setFile]);
  const sources = useQuery({
    queryKey: ["sources", project],
    queryFn: () => api.sourceStatuses(project),
    enabled: autoProjectModel && externalFile === undefined,
  });
  const projectModels =
    sources.data?.filter(
      (item) => item.source.kind === "BIM" && item.latest_revision_id,
    ) ?? [];
  const source =
    autoProjectModel && externalFile === undefined && projectModels.length === 1
      ? projectModels[0]
      : undefined;
  const sourceImport = useQuery({
    queryKey: [
      "revision-import",
      project,
      source?.source.id,
      source?.latest_revision_id,
    ],
    queryFn: () =>
      api.revisionImport(
        project,
        source!.source.id,
        source!.latest_revision_id!,
      ),
    enabled: !!source?.latest_revision_id,
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
    onIssueSelected?.(id);
  };
  const [propertyResult, setPropertyResult] = useState<{
    id: string;
    file: File | null;
    properties: unknown;
  } | null>(null);
  const [inspectorOpen, setInspectorOpen] = useState(true);
  const activeId = focusId ?? selected;
  const viewerProperties =
    propertyResult?.id === activeId &&
    propertyResult.file === viewFile &&
    (!revisionScoped ||
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
  const item = revisionScoped
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
    (!viewFile ? elements.error?.message : null) ||
    imported.error?.message ||
    imported.data?.error;
  const missingModel =
    !viewFile &&
    (feedback?.includes("CCA_IFC_PATH") ||
      feedback?.includes("此项目尚无可打开的模型"));
  const issue = issues.find((entry) => entry.id === selectedIssue);
  const packageFor = (id: string) =>
    workspace?.state.work_packages.find((wp) => wp.element_ids.includes(id));
  const workPackage =
    explicitWorkPackage ??
    packageFor(activeId) ??
    workspace?.state.work_packages.find(
      (wp) => wp.id === issue?.work_package_id,
    );
  const rows = changes.length
    ? changes
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
      className={`bim-workspace spatial-workspace is-${mode}${mapping ? " is-mapping" : ""}${listOpen ? " is-list-open" : ""}`}
      aria-label="模型工作区"
    >
      {mapping?.contextBar}
      <PaneSplit id="spatial-inspector" persist>
        <Pane id="spatial-main-pane" className="spatial-main" minSize="320px">
          <div className="spatial-stage">
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
              <div className="spatial-stage-empty">
                <Box aria-hidden="true" />
                <strong>打开模型以查看构件与上下文</strong>
                <span>
                  {revision.isPending && source
                    ? "正在打开项目模型…"
                    : projectModels.length > 1
                      ? "项目有多个模型。请到「模型版本」选择，再查看具体版本。"
                      : "打开本地 IFC 预览，然后添加到项目。"}
                </span>
              </div>
            )}
            {toolbar && (
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
                    onClick={() => {
                      void openImported().then((opened) => {
                        if (opened) onLocalFile?.(null);
                      });
                    }}
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
                      添加到项目
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
                  ? "还没有项目模型。打开本地 IFC 预览，再添加到项目。"
                  : feedback}
              </div>
            )}
            {viewFile && (
              <div className="viewer-status spatial-feedback" role="status">
                {localFile || (file && file.name !== "project-model.ifc")
                  ? `本地预览 · ${(localFile ?? file)!.name} · ${imported.data?.status === "FAILED" ? "项目版本处理失败" : notice ? "项目版本正在处理" : "尚未添加到项目"}`
                  : source?.latest_revision_id
                    ? `${sourceImport.data?.status === "COMPLETED" ? "项目模型" : "项目文件预览"} · R${modelRevisions.data?.find((item) => item.id === source.latest_revision_id)?.sequence ?? "?"}${sourceImport.data?.status === "FAILED" ? " · 处理失败" : sourceImport.data?.status === "COMPLETED" ? "" : " · 尚未完成处理"}`
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
          {mapping ? (
            mapping.dock
          ) : (
            <SpatialContext
              context={context}
              setContext={setContext}
              open={listOpen}
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
              onWorkPackage={onWorkPackage}
              onNavigate={onNavigate}
              workPackageId={workPackage?.id}
              onExpandInspector={
                inspectorOpen
                  ? undefined
                  : () => inspectorPane.current?.expand()
              }
            />
          )}
        </Pane>
        <PaneDivider label="调整构件详情宽度" disabled={!inspectorOpen} />
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
        </Pane>
      </PaneSplit>
    </section>
  );
}
