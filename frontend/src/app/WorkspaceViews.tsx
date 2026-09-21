import { lazy, Suspense } from "react";
import { ArrowLeft, Plus } from "lucide-react";
import type { AgentRun, InvestigationReport, Workspace } from "../api/client";
import type { BimMappingContext } from "../features/BimMappingWorkspace";
import { ViewerBoundary } from "../components/ViewerBoundary";
import { Button } from "../components/ui/button";
import { icon } from "../components/ui/icon";
import { Pane, PaneDivider, PaneSplit } from "../layout/PaneSplit";
import {
  condensedFor,
  inspectorWidthFor,
  usePaneWidth,
} from "../layout/paneBudget";
import { CoordinationWorkspace } from "../features/CoordinationWorkspace";
import { Inspector } from "../features/Inspector";
import {
  InvestigationInspector,
  type WorkspaceInspectorView,
} from "../features/InvestigationInspector";
import type { ConcordContext } from "../features/ConcordAgent";
import { WorkPackages } from "../features/WorkPackages";
import { Documents } from "../features/Documents";
import { Capabilities } from "../features/Capabilities";
import { Operations } from "../features/Operations";
import { WorkspaceTabs, type WorkspaceTab } from "./WorkspaceTabs";

const ImpactGraph = lazy(() => import("../features/ImpactGraph"));
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

/**
 * The view destinations are the navigation's own business, and they live there
 * rather than here: what counts as workflow, what is secondary, and what is a
 * diagnostic is a product decision, and it is stated once
 * (frontend/src/app/WorkspaceTabs.tsx).
 */
export type { WorkspaceTab };

export function WorkspaceViews({
  project,
  data,
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
  const openInvestigation = () => {
    onInspectorView("investigation");
    onDetailsOpen(true);
  };
  return (
    <>
      <WorkspaceTabs tab={tab} onTab={onTab} />
      {/*
        The workspace and its detail pane are one adjustable split. The pane is a
        real desktop pane: it can be dragged, it can be moved with the arrow keys
        while the divider has focus, and it states its own minimum so it can never
        be collapsed into an unreadable strip.
      */}
      <PaneSplit id="workspace">
        <Pane className="central-workspace">
          {tab === "impact" && (
            <button
              className="canvas-back text-button"
              onClick={() => onTab("coordination")}
            >
              <ArrowLeft {...icon} size={13} /> 返回协调
            </button>
          )}
          <ViewerBoundary key={`${project}:${tab}`}>
            <Suspense
              fallback={<div className="loading-view">正在加载工作区…</div>}
            >
              {tab === "coordination" && !selected && (
                <EmptyWorkPackages onCreate={onStructure} />
              )}
              {tab === "coordination" && !!selected && (
                <>
                  {report?.scope.work_package_ids.includes(selected) && (
                    <section className="context-agent-result workspace-agent-result">
                      <span className="eyebrow">Concord 调查结果</span>
                      <p>{report.answer.summary}</p>
                      <div className="context-agent-result-footer">
                        <small>
                          {report.evidence.length} 条已持久化 Evidence
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
                    selected={selected}
                    busy={busy}
                    onRecheck={onRecheck}
                    onDetails={(view) => {
                      onInspectorView(view);
                      onDetailsOpen(true);
                    }}
                    onImpact={() => onTab("impact")}
                  />
                </>
              )}
              {tab === "operations" && (
                <Operations project={project} perform={perform} />
              )}
              {tab === "impact" && (
                <ImpactGraph
                  workspace={data}
                  selected={selected}
                  onConstraint={onConstraint}
                />
              )}
              {tab === "packages" && (
                <WorkPackages workspace={data} onSelect={onSelected} />
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
            </Suspense>
          </ViewerBoundary>
        </Pane>
        {detailsOpen && (
          <>
            <PaneDivider label="调整详情面板宽度" />
            <Pane
              id="inspector-pane"
              className="inspector-pane pane-stack"
              /* A wide window can afford the Inspector's designed width; a
                 constrained one gives its own column back to the content. */
              defaultSize={inspectorWidthFor(width)}
              minSize="240px"
              /* A pixel ceiling, for the reason the local browsers state: a
                 percentage ceiling shrinks with the window and binds a width
                 the user chose. 480px is the 40% of the 1440px window this
                 layout is drawn at. */
              maxSize="480px"
            >
              {inspectorView === "investigation" ? (
                <InvestigationInspector
                  report={report}
                  run={run}
                  context={investigationContext}
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
    <section className="workspace-empty" aria-labelledby="empty-work-packages">
      <span className="eyebrow">工作包</span>
      <h2 id="empty-work-packages">还没有工作包</h2>
      <p>创建区域和工作包后，可以关联 BIM、跟踪变更并运行协调检查。</p>
      <Button onClick={onCreate}>
        <Plus {...icon} /> 创建工作包
      </Button>
    </section>
  );
}
