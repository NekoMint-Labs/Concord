import { lazy } from "react";
import { ThatOpenViewport } from "../components/ThatOpenUI";
import { StageBand, StageFact } from "./StageBand";
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
  /*
   * The model workspace wears the same band as every other stage, because it is the
   * same kind of surface: an engineering object, its revision, what is known about it,
   * and the verbs that act on it. Before this the only thing naming the model was a
   * row of five unlabelled icons floating over the canvas, which told a reader nothing
   * about which revision they were looking at or how much had changed.
   */
  const impacted = data.analysis?.impact.element_ids.length ?? 0;
  const blocking =
    data.analysis?.constraints.filter((item) => item.blocking).length ?? 0;
  return (
    <div className="model-workspace">
      <StageBand
        kind={mappingMode ? "模型 · 构件关联" : "模型工作区"}
        title={modelSource?.source.name ?? "项目模型"}
        meta={
          <>
            <StageFact label="版本">
              {modelTarget?.revisionId
                ? "指定版本"
                : modelSource?.latest_revision_id
                  ? "最新版本"
                  : "尚无版本"}
            </StageFact>
            <StageFact label="变更构件">{impacted}</StageFact>
            <StageFact
              label="阻塞问题"
              tone={blocking > 0 ? "attention" : "neutral"}
            >
              {blocking}
            </StageFact>
          </>
        }
        actions={
          <>
            <button type="button" onClick={() => onTab("browse")}>
              资料与版本
            </button>
            <button type="button" onClick={() => onTab("impact")}>
              变更影响
            </button>
          </>
        }
      />
      <ThatOpenViewport
        className="model-workspace-viewport"
        aria-label="模型工作区"
      >
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
                      modelTarget?.revisionId ??
                        modelSource!.latest_revision_id!,
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
      </ThatOpenViewport>
    </div>
  );
}
