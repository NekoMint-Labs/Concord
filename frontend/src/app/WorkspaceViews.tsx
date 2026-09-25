import { lazy, Suspense } from "react";
import { Plus } from "lucide-react";
import type { AgentRun, InvestigationReport, Workspace } from "../api/client";
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
import { ChangeExplorer } from "../features/ChangeExplorer";
import { IssueExplorer } from "../features/IssueExplorer";
import { InvestigationWorkspace } from "../features/InvestigationWorkspace";
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
  localIfcFile,
  onLocalIfcFile,
  selected,
  selectedConstraint,
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
}: {
  project: string;
  data: Workspace;
  localIfcFile?: File | null;
  onLocalIfcFile?: (file: File | null) => void;
  selected: string;
  selectedConstraint: string;
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
}) {
  /*
   * The pane budget: the Inspector is what the user just opened, so it always
   * wins the column it needs. Below 1280px the nested list pane yields to it and
   * is reached as a menu instead of as a third column
   * (frontend/src/layout/paneBudget.ts).
   */
  const width = usePaneWidth();
  const condensed = condensedFor(width, detailsOpen);
  const stackedInspector = detailsOpen && width <= 1120;
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
              {detailsOpen && inspectorView === "investigation" ? (
                <InvestigationWorkspace
                  project={project}
                  context={investigationContext}
                  report={report}
                />
              ) : (
                <>
                  {(tab === "coordination" || tab === "work-packages") &&
                    !selected && <EmptyWorkPackages onCreate={onStructure} />}
                  {(tab === "coordination" || tab === "work-packages") &&
                    !!selected && (
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
                          surface={tab}
                          selected={selected}
                          busy={busy}
                          onRecheck={onRecheck}
                          onDetails={(view) => {
                            onInspectorView(view);
                            onDetailsOpen(true);
                          }}
                          onImpact={() => onTab("impact")}
                          onModel={() => onTab("bim")}
                          onDocuments={() => onTab("documents")}
                          modelContext={
                            <WorkPackageModelContext
                              project={project}
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
                              onOpenModel={() => onTab("bim")}
                            />
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
                      onInspect={(
                        workPackageId,
                        sourceId,
                        comparison,
                        change,
                      ) =>
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
                      localFile={localIfcFile}
                      onLocalFile={onLocalIfcFile}
                      onResolve={onConstraint}
                      onSelectWorkPackage={onSelected}
                      perform={perform}
                    />
                  )}
                  {tab === "documents" && (
                    <Documents
                      project={project}
                      perform={perform}
                      condensed={condensed}
                    />
                  )}
                  {tab === "capabilities" && <Capabilities />}
                  {tab === "sources" && (
                    <ProjectSources
                      project={project}
                      workPackages={data.state.work_packages}
                      report={report}
                      onContext={onSourceContext}
                      onRun={onAgentRun}
                      onInvestigate={onInvestigateSource}
                      onInspectImpact={onInspectImpact}
                      onOpenInvestigation={openInvestigation}
                    />
                  )}
                  {tab === "bim" && mappingMode && !!selected && (
                    <BimMappingWorkspace
                      project={project}
                      workPackageId={selected}
                      initial={mappingContext}
                      report={report}
                      condensed={condensed}
                      onContext={onBimContext}
                      onInvestigate={onInvestigateBim}
                      onOpenInvestigation={openInvestigation}
                    />
                  )}
                  {tab === "bim" && !mappingMode && (
                    <BIMWorkspace
                      project={project}
                      impacted={data.analysis?.impact.element_ids ?? []}
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
                      onWorkPackage={(id) => {
                        onSelected(id);
                        onTab("coordination");
                      }}
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
              )}
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
                  proposal={data.proposals.find((item) =>
                    report?.scope.work_package_ids.includes(
                      item.work_package_id,
                    ),
                  )}
                  onReview={() => {
                    const workPackage = data.proposals.find((item) =>
                      report?.scope.work_package_ids.includes(
                        item.work_package_id,
                      ),
                    );
                    if (workPackage) onSelected(workPackage.work_package_id);
                    onInspectorView("action");
                  }}
                  onClose={() => onDetailsOpen(false)}
                />
              ) : (
                <Inspector
                  busy={busy}
                  workspace={data}
                  selected={selected}
                  selectedConstraint={selectedConstraint}
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
