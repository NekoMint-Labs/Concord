import { lazy, Suspense } from "react";
import { ArrowLeft } from "lucide-react";
import type { Workspace } from "../api/client";
import { ViewerBoundary } from "../components/ViewerBoundary";
import { icon } from "../components/ui/icon";
import { Pane, PaneDivider, PaneSplit } from "../layout/PaneSplit";
import {
  condensedFor,
  inspectorWidthFor,
  usePaneWidth,
} from "../layout/paneBudget";
import { CoordinationWorkspace } from "../features/CoordinationWorkspace";
import { Inspector, type InspectorView } from "../features/Inspector";
import { WorkPackages } from "../features/WorkPackages";
import { Documents } from "../features/Documents";
import { Capabilities } from "../features/Capabilities";
import { Operations } from "../features/Operations";
import { WorkspaceTabs, type WorkspaceTab } from "./WorkspaceTabs";

const ImpactGraph = lazy(() => import("../features/ImpactGraph"));
const BIMWorkspace = lazy(() => import("../viewers/BIMWorkspace"));
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
}: {
  project: string;
  data: Workspace;
  selected: string;
  selectedConstraint: string;
  tab: WorkspaceTab;
  busy: boolean;
  detailsOpen: boolean;
  inspectorView: InspectorView;
  perform: (operation: () => Promise<unknown>) => Promise<void>;
  onTab: (tab: WorkspaceTab) => void;
  onSelected: (id: string) => void;
  onConstraint: (id: string) => void;
  onDetailsOpen: (open: boolean) => void;
  onInspectorView: (view: InspectorView) => void;
  onRecheck: () => void;
}) {
  /*
   * The pane budget: the Inspector is what the user just opened, so it always
   * wins the column it needs. Below 1280px the nested list pane yields to it and
   * is reached as a menu instead of as a third column
   * (frontend/src/layout/paneBudget.ts).
   */
  const width = usePaneWidth();
  const condensed = condensedFor(width, detailsOpen);
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
              {tab === "coordination" && (
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
              {tab === "bim" && (
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
            </Pane>
          </>
        )}
      </PaneSplit>
    </>
  );
}
