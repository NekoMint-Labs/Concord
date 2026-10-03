import { useState } from "react";
import type { ExplorerTarget } from "../features/ProjectExplorer";
import type { InspectorView } from "../features/Inspector";
import type { WorkspaceViewsProps } from "./WorkspaceViewsProps";

export type ModelTarget = { sourceId: string; revisionId: string };

/** Local explorer/model targets and the existing destination callbacks. */
export function useWorkspaceNavigation({
  data,
  onProjectSourceSelected,
  onLocalIfcFile,
  onElementSelected,
  onTab,
  onConstraint,
  onSelected,
  onInspectorView,
  onDetailsOpen,
}: Pick<
  WorkspaceViewsProps,
  | "data"
  | "onProjectSourceSelected"
  | "onLocalIfcFile"
  | "onElementSelected"
  | "onTab"
  | "onConstraint"
  | "onSelected"
  | "onInspectorView"
  | "onDetailsOpen"
>) {
  const [explorerTarget, setExplorerTarget] = useState<ExplorerTarget | null>(
    null,
  );
  const [modelTarget, setModelTarget] = useState<ModelTarget | null>(null);
  const openModel = (sourceId: string, revisionId: string) => {
    setModelTarget({ sourceId, revisionId });
    onProjectSourceSelected?.(sourceId);
    onLocalIfcFile?.(null);
    onElementSelected("");
    onTab("bim");
  };
  const openSource = (target: Extract<ExplorerTarget, { kind: "source" }>) => {
    setExplorerTarget(target);
    onProjectSourceSelected?.(target.id);
    onTab("project");
  };
  const openDocument = (id: string) => {
    setExplorerTarget({ kind: "document", id });
    onTab("documents");
  };

  const selectConstraint = (id: string) => {
    setExplorerTarget(null);
    onConstraint(id);
  };
  const openWorkPackage = (id: string) => {
    setExplorerTarget(null);
    onSelected(id);
    onTab("coordination");
  };

  const openInvestigation = () => {
    onInspectorView("investigation");
    onDetailsOpen(true);
  };

  const showDetails = (view: InspectorView) => {
    setExplorerTarget(null);
    onInspectorView(view);
    onDetailsOpen(true);
  };
  const openExplorerTarget = (target: ExplorerTarget) => {
    if (target.kind === "source") openSource(target);
    else if (target.kind === "package") openWorkPackage(target.id);
    else if (target.kind === "document") openDocument(target.id);
    else if (target.kind === "baseline") onTab("history");
    else {
      const evidence = data.analysis?.evidence.find(
        (item) => item.id === target.id,
      );
      const constraint = data.analysis?.constraints.find((item) =>
        item.evidence_ids.includes(target.id),
      );
      const packageId =
        evidence?.work_package_id ?? constraint?.work_package_id;
      if (packageId) openWorkPackage(packageId);
      else onTab("project");
      onInspectorView("evidence");
      onDetailsOpen(true);
    }
    setExplorerTarget(target);
  };
  return {
    explorerTarget,
    setExplorerTarget,
    modelTarget,
    openModel,
    openSource,
    openDocument,
    selectConstraint,
    openWorkPackage,
    openInvestigation,
    showDetails,
    openExplorerTarget,
  };
}
