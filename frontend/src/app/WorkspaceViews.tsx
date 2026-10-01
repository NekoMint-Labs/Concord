import {
  lazy,
  Suspense,
  useState,
  type ReactNode,
  type ComponentProps,
} from "react";
import {
  ProjectExplorer,
  type ExplorerTarget,
} from "../features/ProjectExplorer";
import { proposalRejected } from "../features/proposalState";
import { scopeFor } from "../features/agentContext";
import { Plus } from "lucide-react";
import type {
  AgentRun,
  InvestigationReport,
  ProjectSourceStatus,
  Workspace,
} from "../api/client";
import type { BimMappingContext } from "../features/BimMappingWorkspace";
import { ViewerBoundary } from "../components/ViewerBoundary";
import { WorkspaceState } from "../components/WorkspaceState";
import { Button } from "../components/ui/button";
import { icon } from "../components/ui/icon";
import { Pane, PaneDivider, PaneSplit } from "../layout/PaneSplit";
import {
  condensedFor,
  inspectorWidthFor,
  usePaneWidth,
} from "../layout/paneBudget";
import { CoordinationWorkspace } from "../features/CoordinationWorkspace";
import {
  demoDiscipline,
  demoWorkPackageName,
} from "../ui/demo/demoPresentation";
import { WorkList } from "../features/WorkList";
import { ProjectHome } from "./ProjectHome";
import { ChangeExplorer } from "../features/ChangeExplorer";
import { IssueExplorer } from "../features/IssueExplorer";
import { WorkPackageModelContext } from "../features/WorkPackageModelContext";
import { Inspector } from "../features/Inspector";
import {
  InvestigationInspector,
  type WorkspaceInspectorView,
} from "../features/InvestigationInspector";
import type { ConcordContext } from "../features/ConcordAgent";
import { Documents } from "../features/Documents";
import { Capabilities } from "../features/Capabilities";
import { Operations } from "../features/Operations";
import type { WorkspaceTab } from "./destinations";

const BIMWorkspace = lazy(() => import("../viewers/BIMWorkspace"));
const BimMappingWorkspace = lazy(() =>
  import("../features/BimMappingWorkspace").then((module) => ({
    default: module.BimMappingWorkspace,
  })),
);
const ProjectSources = lazy(() =>
  import("../features/ProjectSources").then((module) => ({
    default: module.ProjectSources,
  })),
);
const GISWorkspace = lazy(() => import("../viewers/GISWorkspace"));

/** Navigation owns destinations; this component only composes the selected work surface. */
export type { WorkspaceTab };

export function WorkspaceViews({
  project,
  data,
  modelSource,
  modelSources = [],
  localIfcFile,
  onLocalIfcFile,
  selected,
  selectedConstraint,
  selectedElement,
  selectedSpatialIssue,
  onElementSelected,
  onSpatialIssueSelected,
  tab,
  busy,
  detailsOpen,
  inspectorView,
  perform,
  onTab,
  onSelected,
  onConstraint,
  onDetailsOpen,
  onInspectorView,
  onRecheck,
  onStructure,
  mappingMode = false,
  mappingContext,
  report,
  run,
  investigationContext,
  onSourceContext,
  onBimContext,
  onAgentRun,
  onInvestigateSource,
  onInvestigateBim,
  onInspectImpact,
  projectSourceId,
  onProjectSourceSelected,
  onLinkBim,
  onInvestigateWorkPackage,
  onInvestigateWork,
  investigationProgress,
  investigationError,
  onRetryInvestigation,
}: {
  project: string;
  data: Workspace;
  modelSource?: ProjectSourceStatus;
  modelSources?: ProjectSourceStatus[];
  localIfcFile?: File | null;
  onLocalIfcFile?: (file: File | null) => void;
  selected: string;
  selectedConstraint: string;
  selectedElement: string;
  selectedSpatialIssue: string;
  onElementSelected: (id: string) => void;
  onSpatialIssueSelected: (id: string) => void;
  tab: WorkspaceTab;
  busy: boolean;
  detailsOpen: boolean;
  inspectorView: WorkspaceInspectorView;
  perform: (operation: () => Promise<unknown>) => Promise<void>;
  onTab: (tab: WorkspaceTab) => void;
  onSelected: (id: string) => void;
  onConstraint: (id: string) => void;
  onDetailsOpen: (open: boolean) => void;
  onInspectorView: (view: WorkspaceInspectorView) => void;
  onRecheck: () => void;
  onStructure: () => void;
  mappingMode?: boolean;
  mappingContext?: BimMappingContext;
  report?: InvestigationReport | null;
  run?: AgentRun | null;
  investigationContext: ConcordContext;
  onSourceContext: (
    sourceId: string,
    revisionId?: string,
    revisionLabel?: string,
    fromRevisionId?: string,
    fromRevisionLabel?: string,
  ) => void;
  onBimContext: (
    sourceId: string,
    revisionId: string,
    elementIds: string[],
    fromRevisionId?: string,
    revisionLabel?: string,
    fromRevisionLabel?: string,
  ) => void;
  onAgentRun: (run: AgentRun) => void;
  onInvestigateSource: (
    sourceId: string,
    revisionId: string,
    fromRevisionId?: string,
    elementIds?: string[],
    revisionLabel?: string,
    fromRevisionLabel?: string,
  ) => void;
  onInvestigateBim: (
    sourceId: string,
    revisionId: string,
    elementIds: string[],
    fromRevisionId?: string,
  ) => void;
  onInspectImpact: (workPackageId: string, context: BimMappingContext) => void;
  projectSourceId?: string;
  onProjectSourceSelected?: (id: string) => void;
  onLinkBim?: () => void;
  onInvestigateWorkPackage?: (id: string) => void;
  onInvestigateWork?: ComponentProps<typeof WorkList>["onInvestigate"];
  investigationProgress?: ReactNode;
  investigationError?: string;
  onRetryInvestigation?: () => void;
}) {
  /*
   * The pane budget: the Inspector is what the user just opened, so it always
   * wins the column it needs. Below 1280px the nested list pane yields to it and
   * is reached as a menu instead of as a third column
   * (frontend/src/layout/paneBudget.ts).
   */
  const [explorerTarget, setExplorerTarget] = useState<ExplorerTarget | null>(
    null,
  );
  const [modelTarget, setModelTarget] = useState<{
    sourceId: string;
    revisionId: string;
  } | null>(null);
  const openModel = (sourceId: string, revisionId: string) => {
    setModelTarget({ sourceId, revisionId });
    onProjectSourceSelected?.(sourceId);
    onLocalIfcFile?.(null);
    onElementSelected("");
    onTab("bim");
  };
  const openSource = (target: Extract<ExplorerTarget, { kind: "source" }>) => {
    setExplorerTarget(target);
    onProjectSourceSelected?.(target.id);
    onTab("project");
  };
  const openDocument = (id: string) => {
    setExplorerTarget({ kind: "document", id });
    onTab("documents");
  };
  const width = usePaneWidth();
  const condensed = condensedFor(width, detailsOpen);
  const stackedInspector = detailsOpen && width <= 1120;
  const selectConstraint = (id: string) => {
    setExplorerTarget(null);
    onConstraint(id);
  };
  const openWorkPackage = (id: string) => {
    setExplorerTarget(null);
    onSelected(id);
    onTab("coordination");
  };
  const reportProposal =
    report &&
    data.analysis?.id === report.analysis_id &&
    data.analysis_run?.id === report.run_id &&
    data.analysis_run.generation === report.generation
      ? data.proposals.find(
          (proposal) =>
            proposal.run_id === report.run_id &&
            proposal.generation === report.generation &&
            !proposalRejected(data, proposal.id),
        )
      : undefined;
  const openInvestigation = () => {
    onInspectorView("investigation");
    onDetailsOpen(true);
  };
  return (
    <>
      {/*
        The workspace and its detail pane are one adjustable split. The pane is a
        real desktop pane: it can be dragged, it can be moved with the arrow keys
        while the divider has focus, and it states its own minimum so it can never
        be collapsed into an unreadable strip.
      */}
      <PaneSplit
        id={`workspace-${stackedInspector ? "stacked" : "wide"}`}
        orientation={stackedInspector ? "vertical" : "horizontal"}
      >
        <Pane
          className={`central-workspace${detailsOpen ? " has-detail" : ""}`}
          minSize={stackedInspector ? "300px" : "480px"}
          maxSize={stackedInspector ? "75%" : undefined}
        >
          <ViewerBoundary key={`${project}:${tab}`}>
            <Suspense
              fallback={
                <WorkspaceState
                  kind="loading"
                  title="正在加载工作区"
                  description="正在准备工程数据与视图。"
                />
              }
            >
              <>
                {tab === "work" && (
                  <WorkList
                    workspace={data}
                    sources={modelSources}
                    report={report}
                    run={run}
                    onSource={(id) => openSource({ kind: "source", id })}
                    onInvestigate={
                      onInvestigateWork ??
                      ((context) => {
                        onSourceContext?.(
                          context.sourceId,
                          context.revisionId,
                          context.revisionLabel,
                          context.fromRevisionId,
                          context.fromRevisionLabel,
                        );
                        onInvestigateSource?.(
                          context.sourceId,
                          context.revisionId,
                          context.fromRevisionId,
                        );
                      })
                    }
                    onPackage={openWorkPackage}
                    onModels={() => onTab("sources")}
                    onRecheck={onRecheck}
                    onReport={openInvestigation}
                    onProject={() => onTab("project")}
                    onTab={onTab}
                  />
                )}
                {tab === "browse" && (
                  <ProjectExplorer
                    workspace={data}
                    sources={modelSources}
                    onTab={onTab}
                    onOpen={(target) => {
                      if (target.kind === "source") openSource(target);
                      else if (target.kind === "package")
                        openWorkPackage(target.id);
                      else if (target.kind === "document")
                        openDocument(target.id);
                      else if (target.kind === "baseline") onTab("history");
                      else {
                        const evidence = data.analysis?.evidence.find(
                          (item) => item.id === target.id,
                        );
                        const constraint = data.analysis?.constraints.find(
                          (item) => item.evidence_ids.includes(target.id),
                        );
                        const packageId =
                          evidence?.work_package_id ??
                          constraint?.work_package_id;
                        if (packageId) openWorkPackage(packageId);
                        else onTab("project");
                        onInspectorView("evidence");
                        onDetailsOpen(true);
                      }
                      setExplorerTarget(target);
                    }}
                  />
                )}
                {tab === "project" && (
                  <ProjectHome
                    workspace={data}
                    sources={modelSources}
                    selected={selected}
                    onStructure={onStructure}
                    onTab={onTab}
                    onPackage={openWorkPackage}
                    onDocument={openDocument}
                    onSource={(id, revisionId) =>
                      openSource({ kind: "source", id, revisionId })
                    }
                    onModel={openModel}
                    sourceId={projectSourceId}
                    onSourceSelected={(id) => {
                      setExplorerTarget(null);
                      onProjectSourceSelected?.(id);
                    }}
                    sourceContext={{
                      onRun: onAgentRun,
                      focusRevisionId:
                        explorerTarget?.kind === "source" &&
                        explorerTarget.id === projectSourceId
                          ? explorerTarget.revisionId
                          : undefined,
                      focusComparisonId:
                        explorerTarget?.kind === "source" &&
                        explorerTarget.id === projectSourceId
                          ? explorerTarget.comparisonId
                          : undefined,
                      onOpenModel: openModel,
                      onContext: onSourceContext,
                      onInvestigate: onInvestigateSource,
                      onInspectImpact,
                      onOpenInvestigation: openInvestigation,
                      report,
                      investigation: {
                        scope: scopeFor(investigationContext),
                        run:
                          run?.category === "investigation" ? run : undefined,
                        error: investigationError,
                        progress: investigationProgress,
                        onRetry: onRetryInvestigation,
                      },
                    }}
                  />
                )}
                {tab === "work-packages" && (
                  <section className="project-home" aria-label="项目工作包">
                    <header>
                      <h1>工作包</h1>
                      {!!data.state.work_packages.length && (
                        <Button onClick={onStructure}>
                          <Plus {...icon} /> 新建工作包
                        </Button>
                      )}
                    </header>
                    <div className="work-rows">
                      {data.state.work_packages.map((wp) => (
                        <button
                          type="button"
                          className="work-row"
                          key={wp.id}
                          onClick={() => openWorkPackage(wp.id)}
                        >
                          <strong>{demoWorkPackageName(wp.id, wp.name)}</strong>
                          <span>
                            {demoDiscipline(wp.discipline)} · 查看详情 →
                          </span>
                        </button>
                      ))}
                    </div>
                    {!data.state.work_packages.length && (
                      <EmptyWorkPackages onCreate={onStructure} />
                    )}
                  </section>
                )}
                {tab === "coordination" && !selected && (
                  <EmptyWorkPackages onCreate={onStructure} />
                )}
                {tab === "coordination" && !!selected && (
                  <>
                    {report?.scope.work_package_ids.includes(selected) && (
                      <section className="context-agent-result workspace-agent-result">
                        <span className="eyebrow">工程调查</span>
                        <strong>调查结果已保存到当前工作包</strong>
                        <div className="context-agent-result-footer">
                          <small>
                            {report.evidence.length} 条判断依据 ·{" "}
                            {report.tools.length} 个调查步骤
                          </small>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={openInvestigation}
                          >
                            查看调查结果
                          </Button>
                        </div>
                      </section>
                    )}
                    <CoordinationWorkspace
                      workspace={data}
                      surface="coordination"
                      selected={selected}
                      busy={busy}
                      pendingModel={!!modelSource?.has_pending_revision}
                      onRecheck={onRecheck}
                      onConstraint={selectConstraint}
                      onDetails={(view) => {
                        setExplorerTarget(null);
                        onInspectorView(view);
                        onDetailsOpen(true);
                      }}
                      onImpact={() => onTab("impact")}
                      onModel={() => onTab("bim")}
                      onIssues={() => onTab("packages")}
                      onDocuments={() => onTab("documents")}
                      modelContext={
                        <>
                          <div className="source-heading-actions">
                            <Button
                              size="sm"
                              variant="secondary"
                              onClick={onLinkBim}
                            >
                              关联 BIM
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() =>
                                onInvestigateWorkPackage?.(selected)
                              }
                            >
                              调查工作包
                            </Button>
                          </div>
                          <WorkPackageModelContext
                            project={project}
                            workPackageId={selected}
                            elementIds={
                              data.state.work_packages.find(
                                (item) => item.id === selected,
                              )?.element_ids ?? []
                            }
                            impacted={data.analysis?.impact.element_ids ?? []}
                            revision={
                              data.analysis?.snapshot.sources.find(
                                (source) => source.source === "bim",
                              )?.revision ??
                              data.state.work_packages.find(
                                (item) => item.id === selected,
                              )?.design_revision ??
                              "—"
                            }
                            onOpenModel={(id, context) => {
                              if (context)
                                onInspectImpact(selected, {
                                  ...context,
                                  highlightIds: id
                                    ? [id]
                                    : context.highlightIds,
                                });
                              else {
                                if (id) onElementSelected(id);
                                onTab("bim");
                              }
                            }}
                            onModels={() => onTab("sources")}
                            onChanges={(context) =>
                              context
                                ? onInspectImpact(selected, context)
                                : onTab("impact")
                            }
                          />
                        </>
                      }
                    />
                  </>
                )}
                {tab === "operations" && (
                  <Operations project={project} perform={perform} />
                )}
                {tab === "impact" && (
                  <ChangeExplorer
                    project={project}
                    workspace={data}
                    onWorkPackage={openWorkPackage}
                    initialElement={selectedElement}
                    onElementSelected={onElementSelected}
                    localFile={localIfcFile}
                    onLocalFile={onLocalIfcFile}
                    onModels={() => onTab("sources")}
                    onInvestigate={(
                      sourceId,
                      revisionId,
                      fromRevisionId,
                      ids,
                    ) =>
                      onInvestigateSource(
                        sourceId,
                        revisionId,
                        fromRevisionId,
                        ids,
                      )
                    }
                    onInspect={(workPackageId, sourceId, comparison, change) =>
                      onInspectImpact(workPackageId, {
                        sourceId,
                        fromRevisionId: comparison.from_revision_id,
                        revisionId: comparison.to_revision_id,
                        highlightIds: [change.global_id],
                        changes: [change],
                      })
                    }
                  />
                )}
                {tab === "packages" && (
                  <IssueExplorer
                    project={project}
                    workspace={data}
                    selectedElement={selectedElement}
                    selectedIssue={selectedSpatialIssue}
                    onWorkPackage={openWorkPackage}
                    onElementSelected={onElementSelected}
                    onIssueSelected={onSpatialIssueSelected}
                    localFile={localIfcFile}
                    onLocalFile={onLocalIfcFile}
                    onResolve={selectConstraint}
                    onSelectWorkPackage={(id) => {
                      setExplorerTarget(null);
                      onSelected(id);
                    }}
                  />
                )}
                {tab === "documents" && (
                  <Documents
                    key={
                      explorerTarget?.kind === "document"
                        ? explorerTarget.id
                        : "documents"
                    }
                    initialDocumentId={
                      explorerTarget?.kind === "document"
                        ? explorerTarget.id
                        : undefined
                    }
                    project={project}
                    perform={perform}
                    condensed={condensed}
                  />
                )}
                {tab === "capabilities" && <Capabilities />}
                {(tab === "sources" || tab === "history") && (
                  <ProjectSources
                    project={project}
                    historyOnly={tab === "history"}
                    focusBaselineId={
                      explorerTarget?.kind === "baseline"
                        ? explorerTarget.id
                        : undefined
                    }
                    onProject={() => onTab("project")}
                    onOpenModel={openModel}
                    workPackages={data.state.work_packages}
                    report={report}
                    onContext={onSourceContext}
                    onRun={onAgentRun}
                    onInvestigate={onInvestigateSource}
                    onInspectImpact={onInspectImpact}
                    onOpenInvestigation={openInvestigation}
                    readyForNewBaseline={
                      !!data.analysis &&
                      !data.stale &&
                      data.state.work_packages.every((item) =>
                        data.analysis?.readiness.some(
                          (entry) =>
                            entry.work_package_id === item.id &&
                            entry.status === "READY",
                        ),
                      )
                    }
                    lastCheckAt={data.analysis?.snapshot.captured_at}
                    checkFailed={data.analysis_run?.status === "FAILED"}
                    onRecheck={onRecheck}
                    onWorkPackage={() => onTab("coordination")}
                    onChanges={() => onTab("impact")}
                  />
                )}
                {tab === "bim" && mappingMode && !!selected && (
                  <BimMappingWorkspace
                    project={project}
                    workspace={data}
                    workPackageId={selected}
                    investigationProgress={
                      investigationContext.workPackageId === selected
                        ? investigationProgress
                        : undefined
                    }
                    initial={mappingContext}
                    report={report}
                    condensed={condensed}
                    onContext={onBimContext}
                    onInvestigate={onInvestigateBim}
                    onOpenInvestigation={openInvestigation}
                    onWorkPackage={() => onTab("coordination")}
                    onModels={() => onTab("sources")}
                  />
                )}
                {tab === "bim" && !mappingMode && (
                  <BIMWorkspace
                    key={`${modelTarget?.sourceId ?? ""}:${modelTarget?.revisionId ?? ""}`}
                    selectedSourceId={modelTarget?.sourceId}
                    selectedRevisionId={modelTarget?.revisionId}
                    project={project}
                    impacted={data.analysis?.impact.element_ids ?? []}
                    focusId={selectedElement || undefined}
                    onViewerSelected={onElementSelected}
                    selectedIssueId={selectedSpatialIssue}
                    onIssueSelected={onSpatialIssueSelected}
                    onInvestigate={
                      !localIfcFile &&
                      (modelTarget?.revisionId ||
                        modelSource?.latest_revision_id)
                        ? (id) =>
                            onInvestigateBim(
                              modelTarget?.sourceId ?? modelSource!.source.id,
                              modelTarget?.revisionId ??
                                modelSource!.latest_revision_id!,
                              [id],
                            )
                        : undefined
                    }
                    localFile={localIfcFile}
                    onLocalFile={onLocalIfcFile}
                    autoProjectModel
                    workspace={data}
                    issues={
                      data.analysis?.constraints.filter(
                        (item) => item.blocking,
                      ) ?? []
                    }
                    onModels={() => onTab("sources")}
                    onNavigate={onTab}
                    onWorkPackage={openWorkPackage}
                    condensed={condensed}
                  />
                )}
                {tab === "gis" && (
                  <GISWorkspace
                    project={project}
                    selected={selected}
                    onSelected={onSelected}
                  />
                )}
              </>
            </Suspense>
          </ViewerBoundary>
        </Pane>
        {detailsOpen && (
          <>
            <PaneDivider
              label={stackedInspector ? "调整详情面板高度" : "调整详情面板宽度"}
            />
            <Pane
              id="inspector-pane"
              className="inspector-pane pane-stack"
              /* A wide window can afford the Inspector's designed width; a
                 constrained one gives its own column back to the content. */
              defaultSize={
                stackedInspector ? "250px" : inspectorWidthFor(width)
              }
              minSize={stackedInspector ? "180px" : "240px"}
              maxSize={stackedInspector ? "50%" : "480px"}
            >
              {inspectorView === "investigation" ? (
                <InvestigationInspector
                  report={report}
                  run={run}
                  context={investigationContext}
                  proposal={reportProposal}
                  onReview={() => {
                    if (!reportProposal) return;
                    onSelected(reportProposal.work_package_id);
                    onTab("coordination");
                    onInspectorView("action");
                    onDetailsOpen(true);
                  }}
                  onClose={() => onDetailsOpen(false)}
                />
              ) : (
                <Inspector
                  busy={busy}
                  workspace={data}
                  selected={selected}
                  selectedConstraint={selectedConstraint}
                  selectedEvidenceId={
                    explorerTarget?.kind === "evidence"
                      ? explorerTarget.id
                      : undefined
                  }
                  view={inspectorView}
                  perform={perform}
                  onClose={() => onDetailsOpen(false)}
                  onView={onInspectorView}
                />
              )}
            </Pane>
          </>
        )}
      </PaneSplit>
    </>
  );
}

export function EmptyWorkPackages({ onCreate }: { onCreate: () => void }) {
  return (
    <WorkspaceState
      kind="empty"
      title="还没有工作包"
      description="创建区域和工作包后，可以关联模型、跟踪变更并运行协调检查。"
      action={
        <Button onClick={onCreate}>
          <Plus {...icon} /> 新建工作包
        </Button>
      }
    />
  );
}
