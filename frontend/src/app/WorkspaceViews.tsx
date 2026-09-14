import { lazy, Suspense } from "react";
import { ArrowLeft } from "lucide-react";
import type { Workspace } from "../api/client";
import { ViewerBoundary } from "../components/ViewerBoundary";
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
            {label}
          </button>
        ))}
        <details className="more-views">
          <summary>更多</summary>
          <div>
            {secondaryTabs.map(({ id, label }) => (
              <button
                key={id}
                className={tab === id ? "active" : ""}
                aria-current={tab === id ? "page" : undefined}
                onClick={() => onTab(id)}
              >
                {label}
              </button>
            ))}
          </div>
        </details>
      </nav>
      <div className={`workspace-body ${detailsOpen ? "has-details" : ""}`}>
        <div className="central-workspace">
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
                <Documents project={project} perform={perform} />
              )}
              {tab === "capabilities" && <Capabilities />}
              {tab === "bim" && (
                <BIMWorkspace
                  project={project}
                  impacted={data.analysis?.impact.element_ids ?? []}
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
        </div>
        {detailsOpen && (
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
      </div>
    </>
  );
}
