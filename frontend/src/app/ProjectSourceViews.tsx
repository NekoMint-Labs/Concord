import { lazy } from "react";
import type { DTO } from "../api/client";
import { ProjectHome } from "./ProjectHome";
import type { WorkspaceViewsProps } from "./WorkspaceViewsProps";
import type { useWorkspaceNavigation } from "./useWorkspaceNavigation";

const ProjectSources = lazy(() =>
  import("../features/ProjectSources").then((module) => ({
    default: module.ProjectSources,
  })),
);

type Navigation = Pick<
  ReturnType<typeof useWorkspaceNavigation>,
  | "openSource"
  | "openWorkPackage"
  | "openDocument"
  | "openModel"
  | "openInvestigation"
  | "explorerTarget"
  | "setExplorerTarget"
>;
type ProjectProps = Pick<
  WorkspaceViewsProps,
  | "data"
  | "modelSources"
  | "selected"
  | "onStructure"
  | "onTab"
  | "projectSourceId"
  | "onProjectSourceSelected"
  | "onAgentRun"
  | "onSourceContext"
  | "onInvestigateSource"
  | "onInspectImpact"
  | "report"
  | "run"
  | "investigationError"
  | "investigationProgress"
  | "onRetryInvestigation"
> & {
  navigation: Navigation;
  investigationScope: DTO<"AgentScope-Input">;
};

/** Wire source context into the project composition without owning project state. */
export function ProjectWorkspaceView({
  data,
  modelSources = [],
  selected,
  onStructure,
  onTab,
  projectSourceId,
  onProjectSourceSelected,
  onAgentRun,
  onSourceContext,
  onInvestigateSource,
  onInspectImpact,
  report,
  investigationScope,
  run,
  investigationError,
  investigationProgress,
  onRetryInvestigation,
  navigation,
}: ProjectProps) {
  const {
    openWorkPackage,
    openDocument,
    openSource,
    openModel,
    setExplorerTarget,
    explorerTarget,
    openInvestigation,
  } = navigation;
  return (
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
          scope: investigationScope,
          run: run?.category === "investigation" ? run : undefined,
          error: investigationError,
          progress: investigationProgress,
          onRetry: onRetryInvestigation,
        },
      }}
    />
  );
}

type SourcesProps = Pick<
  WorkspaceViewsProps,
  | "project"
  | "data"
  | "tab"
  | "report"
  | "onSourceContext"
  | "onAgentRun"
  | "onInvestigateSource"
  | "onInspectImpact"
  | "onRecheck"
  | "onTab"
> & {
  navigation: Pick<
    Navigation,
    "explorerTarget" | "openModel" | "openInvestigation"
  >;
};

/** The compatibility source register and history keep their existing callback contracts. */
export function SourceHistoryView({
  project,
  data,
  tab,
  report,
  onSourceContext,
  onAgentRun,
  onInvestigateSource,
  onInspectImpact,
  onRecheck,
  onTab,
  navigation,
}: SourcesProps) {
  const { explorerTarget, openModel, openInvestigation } = navigation;
  return (
    <ProjectSources
      project={project}
      historyOnly={tab === "history"}
      focusBaselineId={
        explorerTarget?.kind === "baseline" ? explorerTarget.id : undefined
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
              entry.work_package_id === item.id && entry.status === "READY",
          ),
        )
      }
      lastCheckAt={data.analysis?.snapshot.captured_at}
      checkFailed={data.analysis_run?.status === "FAILED"}
      onRecheck={onRecheck}
      onWorkPackage={() => onTab("coordination")}
      onChanges={() => onTab("impact")}
    />
  );
}
