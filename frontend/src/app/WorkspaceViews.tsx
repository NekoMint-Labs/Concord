import { lazy, Suspense } from "react";
import { ProjectExplorer } from "../features/ProjectExplorer";
import { scopeFor } from "../features/agentContext";
import { ViewerBoundary } from "../components/ViewerBoundary";
import { WorkspaceState } from "../components/WorkspaceState";
import { Pane, PaneSplit } from "../layout/PaneSplit";
import { condensedFor, usePaneWidth } from "../layout/paneBudget";
import { WorkList } from "../features/WorkList";
import { ChangeExplorer } from "../features/ChangeExplorer";
import { IssueExplorer } from "../features/IssueExplorer";
import { Documents } from "../features/Documents";
import { Capabilities } from "../features/Capabilities";
import { Operations } from "../features/Operations";
import { WorkPackageDirectory } from "./WorkPackageDirectory";
import { CoordinationView } from "./CoordinationView";
import { ModelWorkspaceView } from "./ModelWorkspaceView";
import { ProjectWorkspaceView, SourceHistoryView } from "./ProjectSourceViews";
import { WorkspaceDetailPane } from "./WorkspaceDetailPane";
import { useWorkspaceNavigation } from "./useWorkspaceNavigation";
import type { WorkspaceViewsProps } from "./WorkspaceViewsProps";

const GISWorkspace = lazy(() => import("../viewers/GISWorkspace"));

// Preserve the existing entry-point exports without changing callers.
export { EmptyWorkPackages } from "./WorkPackageDirectory";
export type { WorkspaceTab } from "./destinations";

/** Navigation owns destinations; this component only composes the selected work surface. */
export function WorkspaceViews(props: WorkspaceViewsProps) {
  const {
    project,
    data,
    modelSources = [],
    localIfcFile,
    onLocalIfcFile,
    selected,
    selectedElement,
    selectedSpatialIssue,
    onElementSelected,
    onSpatialIssueSelected,
    tab,
    detailsOpen,
    perform,
    onTab,
    onSelected,
    onRecheck,
    onStructure,
    report,
    run,
    onSourceContext,
    onInvestigateSource,
    onInspectImpact,
    onInvestigateWork,
  } = props;
  const navigation = useWorkspaceNavigation(props);
  const {
    explorerTarget,
    setExplorerTarget,
    openSource,
    openWorkPackage,
    openInvestigation,
    selectConstraint,
  } = navigation;
  /*
   * The Inspector owns its pane budget; constrained windows yield the nested list
   * instead of creating an unreadable third column (layout/paneBudget.ts).
   */
  const width = usePaneWidth();
  const condensed = condensedFor(width, detailsOpen);
  const stackedInspector = detailsOpen && width <= 1120;
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
                    onOpen={navigation.openExplorerTarget}
                  />
                )}
                {tab === "project" && (
                  <ProjectWorkspaceView
                    {...props}
                    investigationScope={scopeFor(props.investigationContext)}
                    modelSources={modelSources}
                    navigation={navigation}
                  />
                )}
                {tab === "work-packages" && (
                  <WorkPackageDirectory
                    data={data}
                    onStructure={onStructure}
                    openWorkPackage={openWorkPackage}
                  />
                )}
                {tab === "coordination" && (
                  <CoordinationView
                    {...props}
                    openInvestigation={openInvestigation}
                    selectConstraint={selectConstraint}
                    showDetails={navigation.showDetails}
                  />
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
                  <SourceHistoryView {...props} navigation={navigation} />
                )}
                {tab === "bim" && (
                  <ModelWorkspaceView
                    {...props}
                    modelTarget={navigation.modelTarget}
                    condensed={condensed}
                    openInvestigation={openInvestigation}
                    openWorkPackage={openWorkPackage}
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
          <WorkspaceDetailPane
            {...props}
            explorerTarget={explorerTarget}
            stackedInspector={stackedInspector}
            width={width}
          />
        )}
      </PaneSplit>
    </>
  );
}
