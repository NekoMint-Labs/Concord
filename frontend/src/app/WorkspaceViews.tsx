/* The central workspace stage.
 *
 * Composition rule for this file: it composes the ONE dominant central surface
 * and the ONE contextual inspector. It never renders a page header, a tab strip,
 * a dashboard or a second navigator — the shell already owns the chrome, the
 * navigator and the tool rail (see App.tsx's `[data-canvas-workspace]`).
 *
 * `work` is not composed here: its docked panel and its evidence stage must be
 * siblings of the rail and the navigator, so `FindingWorkbench` is mounted by
 * App inside `[data-canvas-workspace]`, exactly as the donor mounts its
 * WorkspacePanel beside the canvas.
 */
import { lazy, Suspense } from "react";

import { ViewerBoundary } from "../components/ViewerBoundary";
import { WorkspaceState } from "../components/WorkspaceState";
import { Pane, PaneDivider, PaneSplit } from "../layout/PaneSplit";
import {
  condensedFor,
  inspectorWidthFor,
  usePaneWidth,
} from "../layout/paneBudget";
import { ChangeExplorer } from "../features/ChangeExplorer";
import { IssueExplorer } from "../features/IssueExplorer";
import { Documents } from "../features/Documents";
import { Capabilities } from "../features/Capabilities";
import { Operations } from "../features/Operations";
import { ModelWorkspaceView } from "./ModelWorkspaceView";
import { BrowseStage } from "./BrowseStage";
import { ProjectStage } from "./ProjectStage";
import { ContextInspector } from "./ContextInspector";
import type { StageObject } from "./stageContracts";
import { useWorkspaceNavigation } from "./useWorkspaceNavigation";
import type { WorkspaceViewsProps } from "./WorkspaceViewsProps";

const GISWorkspace = lazy(() => import("../viewers/GISWorkspace"));

// Preserve the existing entry-point exports without changing callers.
export { EmptyWorkPackages } from "./WorkPackageDirectory";
export type { WorkspaceTab } from "./destinations";

type StageProps = WorkspaceViewsProps & {
  /** The one selected engineering object, owned by the shell. */
  stage?: StageObject | null;
  onStage?: (object: StageObject) => void;
  onOpenFinding?: (id: string, evidenceId?: string) => void;
};

export function WorkspaceViews(props: StageProps) {
  const {
    project,
    data,
    modelSources = [],
    localIfcFile,
    onLocalIfcFile,
    selected,
    selectedElement,
    onElementSelected,
    onSpatialIssueSelected,
    tab,
    detailsOpen,
    perform,
    onTab,
    onDetailsOpen,
    onRecheck,
    onStructure,
    report,
    run,
    onInvestigateSource,
    onInspectImpact,
    stage,
    onStage,
    onOpenFinding,
  } = props;
  const navigation = useWorkspaceNavigation(props);
  const width = usePaneWidth();
  const condensed = condensedFor(width, detailsOpen);
  const stackedInspector = detailsOpen && width <= 1120;
  const stageProps = {
    project,
    data,
    sources: modelSources,
    perform,
    object: stage ?? null,
    onOpen: onStage ?? (() => {}),
    onTab,
    onWorkPackage: (id: string) => props.onSelected(id),
    onOpenFinding: onOpenFinding ?? (() => {}),
    onSource: (id: string) => props.onProjectSourceSelected?.(id),
    onInvestigate: (input: {
      sourceId: string;
      revisionId: string;
      fromRevisionId?: string;
      elementIds?: string[];
    }) =>
      onInvestigateSource(
        input.sourceId,
        input.revisionId,
        input.fromRevisionId,
        input.elementIds,
      ),
    localIfcFile,
    onLocalIfcFile,
  };
  return (
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
            {tab === "browse" && <BrowseStage {...stageProps} />}
            {tab === "project" && (
              <ProjectStage
                {...stageProps}
                onRecheck={onRecheck}
                onStructure={onStructure}
                onWorkPackage={(id) => {
                  props.onSelected(id);
                  onTab("coordination");
                }}
              />
            )}
            {tab === "operations" && (
              <Operations project={project} perform={perform} />
            )}
            {tab === "impact" && (
              <ChangeExplorer
                project={project}
                workspace={data}
                onWorkPackage={navigation.openWorkPackage}
                initialElement={selectedElement}
                onElementSelected={onElementSelected}
                localFile={localIfcFile}
                onLocalFile={onLocalIfcFile}
                onModels={() => onTab("browse")}
                onInvestigate={(
                  sourceId: string,
                  revisionId: string,
                  fromRevisionId: string | undefined,
                  ids: string[] | undefined,
                ) =>
                  onInvestigateSource(sourceId, revisionId, fromRevisionId, ids)
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
                selectedIssue={props.selectedSpatialIssue}
                onWorkPackage={navigation.openWorkPackage}
                onElementSelected={onElementSelected}
                onIssueSelected={onSpatialIssueSelected}
                localFile={localIfcFile}
                onLocalFile={onLocalIfcFile}
                onResolve={navigation.selectConstraint}
                onSelectWorkPackage={(id: string) => {
                  navigation.setExplorerTarget(null);
                  props.onSelected(id);
                }}
              />
            )}
            {tab === "documents" && (
              <Documents
                initialDocumentId={
                  stage?.kind === "document" ? stage.id : undefined
                }
                project={project}
                perform={perform}
                condensed={condensed}
              />
            )}
            {tab === "capabilities" && <Capabilities />}
            {tab === "bim" && (
              <ModelWorkspaceView
                {...props}
                modelTarget={navigation.modelTarget}
                condensed={condensed}
                openInvestigation={navigation.openInvestigation}
                openWorkPackage={navigation.openWorkPackage}
              />
            )}
            {tab === "gis" && (
              <GISWorkspace
                project={project}
                selected={selected}
                onSelected={props.onSelected}
              />
            )}
            {tab === "coordination" && (
              <ProjectStage
                {...stageProps}
                object={
                  stage ??
                  (selected ? { kind: "work-package", id: selected } : null)
                }
                onRecheck={onRecheck}
                onStructure={onStructure}
                onWorkPackage={(id) => props.onSelected(id)}
              />
            )}
            {tab === "history" && <BrowseStage {...stageProps} />}
            {tab === "work-packages" && (
              <ProjectStage
                {...stageProps}
                onRecheck={onRecheck}
                onStructure={onStructure}
              />
            )}
          </Suspense>
        </ViewerBoundary>
      </Pane>
      {detailsOpen && (
        <PaneDivider
          label={stackedInspector ? "调整检查器高度" : "调整检查器宽度"}
        />
      )}
      {detailsOpen && (
        <Pane
          id="inspector-pane"
          className="inspector-pane pane-stack"
          defaultSize={
            stackedInspector ? "250px" : inspectorWidthFor(width)
          }
          minSize={stackedInspector ? "180px" : "240px"}
          maxSize={stackedInspector ? "50%" : "480px"}
        >
          <ContextInspector
            project={project}
            data={data}
            sources={modelSources}
            object={
              stage ??
              (selected ? { kind: "work-package" as const, id: selected } : null)
            }
            report={report}
            run={run}
            context={props.investigationContext}
            busy={props.busy}
            perform={perform}
            onClose={() => onDetailsOpen(false)}
            onOpen={onStage}
            onWorkPackage={(id) => {
              props.onSelected(id);
              onTab("coordination");
            }}
            onTab={onTab}
          />
        </Pane>
      )}
    </PaneSplit>
  );
}
