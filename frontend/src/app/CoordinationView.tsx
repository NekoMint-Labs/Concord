import { Button } from "../components/ui/button";
import { CoordinationWorkspace } from "../features/CoordinationWorkspace";
import type { InspectorView } from "../features/Inspector";
import { WorkPackageModelContext } from "../features/WorkPackageModelContext";
import type { WorkspaceViewsProps } from "./WorkspaceViewsProps";
import { EmptyWorkPackages } from "./WorkPackageDirectory";

type Props = Pick<
  WorkspaceViewsProps,
  | "project"
  | "data"
  | "selected"
  | "busy"
  | "modelSource"
  | "report"
  | "onRecheck"
  | "onTab"
  | "onLinkBim"
  | "onInvestigateWorkPackage"
  | "onElementSelected"
  | "onInspectImpact"
  | "onStructure"
> & {
  openInvestigation: () => void;
  selectConstraint: (id: string) => void;
  showDetails: (view: InspectorView) => void;
};

/** Coordination's saved investigation and embedded, revision-aware model context. */
export function CoordinationView({
  project,
  data,
  selected,
  busy,
  modelSource,
  report,
  onRecheck,
  onTab,
  onLinkBim,
  onInvestigateWorkPackage,
  onElementSelected,
  onInspectImpact,
  onStructure,
  openInvestigation,
  selectConstraint,
  showDetails,
}: Props) {
  if (!selected) return <EmptyWorkPackages onCreate={onStructure} />;
  return (
    <>
      {report?.scope.work_package_ids.includes(selected) && (
        <section className="context-agent-result workspace-agent-result">
          <span className="eyebrow">工程调查</span>
          <strong>调查结果已保存到当前工作包</strong>
          <div className="context-agent-result-footer">
            <small>
              {report.evidence.length} 条判断依据 · {report.tools.length}{" "}
              个调查步骤
            </small>
            <Button size="sm" variant="ghost" onClick={openInvestigation}>
              查看调查结果
            </Button>
          </div>
        </section>
      )}
      <CoordinationWorkspace
        workspace={data}
        surface="coordination"
        selected={selected}
        busy={busy}
        pendingModel={!!modelSource?.has_pending_revision}
        onRecheck={onRecheck}
        onConstraint={selectConstraint}
        onDetails={showDetails}
        onImpact={() => onTab("impact")}
        onModel={() => onTab("bim")}
        onIssues={() => onTab("packages")}
        onDocuments={() => onTab("documents")}
        modelContext={
          <>
            <div className="source-heading-actions">
              <Button size="sm" variant="secondary" onClick={onLinkBim}>
                关联 BIM
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => onInvestigateWorkPackage?.(selected)}
              >
                调查工作包
              </Button>
            </div>
            <WorkPackageModelContext
              project={project}
              workPackageId={selected}
              elementIds={
                data.state.work_packages.find((item) => item.id === selected)
                  ?.element_ids ?? []
              }
              impacted={data.analysis?.impact.element_ids ?? []}
              revision={
                data.analysis?.snapshot.sources.find(
                  (source) => source.source === "bim",
                )?.revision ??
                data.state.work_packages.find((item) => item.id === selected)
                  ?.design_revision ??
                "—"
              }
              onOpenModel={(id, context) => {
                if (context)
                  onInspectImpact(selected, {
                    ...context,
                    highlightIds: id ? [id] : context.highlightIds,
                  });
                else {
                  if (id) onElementSelected(id);
                  onTab("bim");
                }
              }}
              onModels={() => onTab("sources")}
              onChanges={(context) =>
                context ? onInspectImpact(selected, context) : onTab("impact")
              }
            />
          </>
        }
      />
    </>
  );
}
