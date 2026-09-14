import { lazy, Suspense } from "react";
import { motion } from "motion/react";
import { ArrowLeft } from "lucide-react";
import type { Workspace } from "../api/client";
import { ViewerBoundary } from "../components/ViewerBoundary";
import { AppMenu, AppMenuItem } from "../components/ui/AppMenu";
import { Pane, PaneDivider, PaneSplit } from "../layout/PaneSplit";
import {
  condensedFor,
  inspectorWidthFor,
  usePaneWidth,
} from "../layout/paneBudget";
import { useMotion } from "../motion";
import { CoordinationWorkspace } from "../features/CoordinationWorkspace";
import { Inspector, type InspectorView } from "../features/Inspector";
import { WorkPackages } from "../features/WorkPackages";
import { Documents } from "../features/Documents";
import { Capabilities } from "../features/Capabilities";
import { Operations } from "../features/Operations";

const ImpactGraph = lazy(() => import("../features/ImpactGraph"));
const BIMWorkspace = lazy(() => import("../viewers/BIMWorkspace"));
const GISWorkspace = lazy(() => import("../viewers/GISWorkspace"));

/** Primary navigation: the competition workflow only. Text labels, no icons. */
const primaryTabs = [
  { id: "coordination", label: "协调" },
  { id: "bim", label: "BIM" },
  { id: "documents", label: "文档" },
] as const;

/** Secondary navigation. None of these is the product's main story. */
const secondaryTabs = [
  { id: "impact", label: "影响关系" },
  { id: "packages", label: "工作包" },
  { id: "gis", label: "现场" },
  { id: "operations", label: "运行" },
  { id: "capabilities", label: "能力" },
] as const;

const tabs = [...primaryTabs, ...secondaryTabs] as const;
export type WorkspaceTab = (typeof tabs)[number]["id"];

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
  const { transition } = useMotion();
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
      <nav className="workspace-tabs" aria-label="工作区视图">
        {primaryTabs.map(({ id, label }) => (
          <button
            key={id}
            className={tab === id ? "active" : ""}
            aria-current={tab === id ? "page" : undefined}
            onClick={() => onTab(id)}
          >
            <span className="tab-label">{label}</span>
            {/*
              One surface element shared across the strip. `layoutId` makes
              Motion move it between the tabs it belongs to, so the active view
              is an object the user watched arrive rather than a rule that
              switched on somewhere new - and it says what every selected row in
              this application says, in area rather than in a 2px underline.
            */}
            {tab === id && (
              <motion.span
                className="tab-surface"
                layoutId="workspace-view-surface"
                transition={transition()}
              />
            )}
          </button>
        ))}
        <div className="more-views">
          <AppMenu label="更多">
            {secondaryTabs.map(({ id, label }) => (
              <AppMenuItem
                key={id}
                active={tab === id}
                onSelect={() => onTab(id)}
              >
                {label}
              </AppMenuItem>
            ))}
          </AppMenu>
        </div>
      </nav>
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
              <ArrowLeft size={13} /> 返回协调
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
            <PaneDivider />
            <Pane
              id="inspector-pane"
              className="inspector-pane pane-stack"
              /* A wide window can afford the Inspector's designed width; a
                 constrained one gives its own column back to the content. */
              defaultSize={inspectorWidthFor(width)}
              minSize="240px"
              maxSize="40%"
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
