import { useState, type ReactNode } from "react";
import type { Workspace } from "../api/client";
import type { InspectorView } from "./Inspector";
import {
  demoAreaName,
  demoDiscipline,
  demoOwner,
  demoWorkPackageName,
} from "../ui/demo/demoPresentation";
import { coordinationProjection } from "./coordinationProjection";
import {
  CoordinationConditions,
  coordinationResources,
} from "./CoordinationConditions";
import {
  CoordinationInspector,
  type CoordinationInspectorTab,
} from "./CoordinationInspector";
import { CoordinationOverview } from "./CoordinationOverview";
import {
  CoordinationIssues,
  CoordinationSchedule,
} from "./CoordinationPackageSections";

export function CoordinationWorkspace({
  workspace,
  surface = "coordination",
  selected,
  busy,
  onRecheck,
  onDetails,
  onConstraint,
  onImpact,
  onModel,
  onIssues,
  onDocuments,
  modelContext,
  pendingModel = false,
}: {
  workspace: Workspace;
  surface?: "coordination" | "work-packages";
  selected: string;
  busy: boolean;
  onRecheck: () => void;
  onDetails: (view: InspectorView) => void;
  onConstraint?: (id: string) => void;
  onImpact: () => void;
  onModel?: () => void;
  onIssues?: () => void;
  onDocuments?: () => void;
  modelContext?: ReactNode;
  pendingModel?: boolean;
}) {
  const [overviewTab, setOverviewTab] = useState<
    "overview" | "schedule" | "issues"
  >("overview");
  const [inspectorTab, setInspectorTab] =
    useState<CoordinationInspectorTab>("properties");
  const projection = coordinationProjection(workspace, selected, pendingModel);
  const { wp, area, constraints } = projection;
  const resources = coordinationResources(workspace, wp);

  return (
    <section className="coordination-workspace" aria-label="工作包概览">
      <div className="overview-layout">
        <main className="overview-main">
          <header className="work-object-header">
            <div>
              <span className="object-kicker">
                {surface === "coordination" ? "工作包概览" : "工作包"}
              </span>
              <h1>{demoWorkPackageName(wp.id, wp.name)}</h1>
              <p>
                {demoAreaName(wp.area_id, area?.name ?? wp.area_id)} ·{" "}
                {demoDiscipline(wp.discipline)} · 负责人{" "}
                {demoOwner(wp.id, wp.owner)}
              </p>
            </div>
          </header>
          <nav className="work-package-tabs" aria-label="工作包栏目">
            {(
              [
                ["overview", surface === "coordination" ? "概览" : "工作包"],
                ["schedule", "进度"],
                ["issues", `问题 ${constraints.length}`],
              ] as const
            ).map(([id, label]) => (
              <button
                type="button"
                key={id}
                className={overviewTab === id ? "active" : ""}
                onClick={() => setOverviewTab(id)}
              >
                {label}
              </button>
            ))}
            {onDocuments && (
              <button type="button" onClick={onDocuments}>
                文档 →
              </button>
            )}
          </nav>
          {overviewTab === "overview" && (
            <>
              <CoordinationOverview
                projection={projection}
                busy={busy}
                onRecheck={onRecheck}
                onDetails={onDetails}
                onImpact={onImpact}
                onModel={onModel}
                modelContext={modelContext}
              />
              <CoordinationConditions wp={wp} resources={resources} />
            </>
          )}
          {overviewTab === "schedule" && <CoordinationSchedule wp={wp} />}
          {overviewTab === "issues" && (
            <CoordinationIssues
              constraints={constraints}
              analysis={workspace.analysis}
              onIssues={onIssues}
              onConstraint={onConstraint}
              onDetails={onDetails}
            />
          )}
        </main>

        <CoordinationInspector
          projection={projection}
          sources={workspace.state.sources}
          surface={surface}
          tab={inspectorTab}
          onTab={setInspectorTab}
          missingQualifications={resources.missingQualifications}
          onDetails={onDetails}
        />
      </div>
    </section>
  );
}
