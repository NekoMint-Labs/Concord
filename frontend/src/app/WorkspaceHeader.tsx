import type { ReactNode } from "react";
import type { Workspace, WorkPackage } from "../api/client";
import { demoAreaName } from "../ui/demo/demoPresentation";

/**
 * Global chrome only. The selected work package's title, status, and actions
 * belong to the coordination workspace, not here.
 */
export function WorkspaceHeader({
  data,
  wp,
  children,
}: {
  data: Workspace;
  wp: WorkPackage;
  children?: ReactNode;
}) {
  return (
    <header className="topbar">
      <div className="breadcrumb">
        <span>{data.state.project.name}</span>
        <span className="crumb-sep">/</span>
        <span>{demoAreaName(wp.area_id, wp.area_id)}</span>
        <span className="crumb-sep">/</span>
        <strong>{wp.id}</strong>
      </div>
      <div className="header-tools">{children}</div>
    </header>
  );
}
