import { lazy } from "react";
import type { ModelTarget } from "./useWorkspaceNavigation";
import type { WorkspaceViewsProps } from "./WorkspaceViewsProps";

const BIMWorkspace = lazy(() => import("../viewers/BIMWorkspace"));
const BimMappingWorkspace = lazy(() =>
  import("../features/BimMappingWorkspace").then((module) => ({
    default: module.BimMappingWorkspace,
  })),
);

type Props = Pick<
  WorkspaceViewsProps,
  | "project"
  | "data"
  | "selected"
  | "mappingMode"
  | "mappingContext"
  | "report"
  | "investigationContext"
  | "investigationProgress"
  | "onBimContext"
  | "onInvestigateBim"
  | "onTab"
  | "modelSource"
  | "localIfcFile"
  | "onLocalIfcFile"
  | "selectedElement"
  | "onElementSelected"
  | "selectedSpatialIssue"
  | "onSpatialIssueSelected"
> & {
  modelTarget: ModelTarget | null;
  condensed: boolean;
  openInvestigation: () => void;
  openWorkPackage: (id: string) => void;
};

/** The two existing BIM modes keep their exact model, revision and selection contracts. */
export function ModelWorkspaceView({
  project,
  data,
  selected,
  mappingMode = false,
  mappingContext,
  report,
  investigationContext,
  investigationProgress,
  onBimContext,
  onInvestigateBim,
  onTab,
  modelSource,
  localIfcFile,
  onLocalIfcFile,
  selectedElement,
  onElementSelected,
  selectedSpatialIssue,
  onSpatialIssueSelected,
  modelTarget,
  condensed,
  openInvestigation,
  openWorkPackage,
}: Props) {
  return (
    <>
      {mappingMode && !!selected && (
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
      {!mappingMode && (
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
            (modelTarget?.revisionId || modelSource?.latest_revision_id)
              ? (id) =>
                  onInvestigateBim(
                    modelTarget?.sourceId ?? modelSource!.source.id,
                    modelTarget?.revisionId ?? modelSource!.latest_revision_id!,
                    [id],
                  )
              : undefined
          }
          localFile={localIfcFile}
          onLocalFile={onLocalIfcFile}
          autoProjectModel
          workspace={data}
          issues={
            data.analysis?.constraints.filter((item) => item.blocking) ?? []
          }
          onModels={() => onTab("sources")}
          onNavigate={onTab}
          onWorkPackage={openWorkPackage}
          condensed={condensed}
        />
      )}
    </>
  );
}
