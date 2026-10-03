import { Pane, PaneDivider } from "../layout/PaneSplit";
import { inspectorWidthFor } from "../layout/paneBudget";
import { Inspector } from "../features/Inspector";
import { InvestigationInspector } from "../features/InvestigationInspector";
import { proposalRejected } from "../features/proposalState";
import type { ExplorerTarget } from "../features/ProjectExplorer";
import type { WorkspaceViewsProps } from "./WorkspaceViewsProps";

type Props = Pick<
  WorkspaceViewsProps,
  | "report"
  | "run"
  | "data"
  | "investigationContext"
  | "onSelected"
  | "onTab"
  | "onInspectorView"
  | "onDetailsOpen"
  | "inspectorView"
  | "busy"
  | "selected"
  | "selectedConstraint"
  | "perform"
> & {
  explorerTarget: ExplorerTarget | null;
  stackedInspector: boolean;
  width: number;
};

/** Detail presentation and proposal review stay bound to the matching report/run. */
export function WorkspaceDetailPane({
  report,
  run,
  data,
  investigationContext,
  onSelected,
  onTab,
  onInspectorView,
  onDetailsOpen,
  inspectorView,
  busy,
  selected,
  selectedConstraint,
  perform,
  explorerTarget,
  stackedInspector,
  width,
}: Props) {
  const reportProposal =
    report &&
    data.analysis?.id === report.analysis_id &&
    data.analysis_run?.id === report.run_id &&
    data.analysis_run.generation === report.generation
      ? data.proposals.find(
          (proposal) =>
            proposal.run_id === report.run_id &&
            proposal.generation === report.generation &&
            !proposalRejected(data, proposal.id),
        )
      : undefined;

  return (
    <>
      <PaneDivider
        label={stackedInspector ? "调整详情面板高度" : "调整详情面板宽度"}
      />
      <Pane
        id="inspector-pane"
        className="inspector-pane pane-stack"
        /* A wide window can afford the Inspector's designed width; a
                 constrained one gives its own column back to the content. */
        defaultSize={stackedInspector ? "250px" : inspectorWidthFor(width)}
        minSize={stackedInspector ? "180px" : "240px"}
        maxSize={stackedInspector ? "50%" : "480px"}
      >
        {inspectorView === "investigation" ? (
          <InvestigationInspector
            report={report}
            run={run}
            context={investigationContext}
            proposal={reportProposal}
            onReview={() => {
              if (!reportProposal) return;
              onSelected(reportProposal.work_package_id);
              onTab("coordination");
              onInspectorView("action");
              onDetailsOpen(true);
            }}
            onClose={() => onDetailsOpen(false)}
          />
        ) : (
          <Inspector
            busy={busy}
            workspace={data}
            selected={selected}
            selectedConstraint={selectedConstraint}
            selectedEvidenceId={
              explorerTarget?.kind === "evidence"
                ? explorerTarget.id
                : undefined
            }
            view={inspectorView}
            perform={perform}
            onClose={() => onDetailsOpen(false)}
            onView={onInspectorView}
          />
        )}
      </Pane>
    </>
  );
}
