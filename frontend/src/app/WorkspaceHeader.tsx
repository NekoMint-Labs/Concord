import type { ReactNode } from "react";
import { PanelLeftOpen } from "lucide-react";
import type { Workspace, WorkPackage } from "../api/client";
import { AppTooltip } from "../components/ui/AppTooltip";
import { icon } from "../components/ui/icon";
import { demoAreaName } from "../ui/demo/demoPresentation";

/**
 * Global chrome only. The selected work package's title, status, and actions
 * belong to the coordination workspace, not here.
 *
 * The band also owns the way back to a collapsed navigation column. That control
 * appears only while the column is gone, in the window's own top-left corner - the
 * corner the navigation vacated - so there is exactly one sidebar control on
 * screen at a time and it is always where the column's edge is. The path beside it
 * absorbs the band's free width (`styles/shell.css`), which is what keeps the
 * actions pinned to the right edge in both states instead of sliding with it.
 */
export function WorkspaceHeader({
  data,
  wp,
  navCollapsed = false,
  onToggleNav,
  children,
}: {
  data: Workspace;
  wp: WorkPackage;
  navCollapsed?: boolean;
  onToggleNav?: () => void;
  children?: ReactNode;
}) {
  return (
    <header className="topbar">
      {navCollapsed && (
        <AppTooltip label="展开侧栏">
          <button
            type="button"
            className="icon-button"
            aria-label="展开侧栏"
            onClick={onToggleNav}
          >
            <PanelLeftOpen {...icon} />
          </button>
        </AppTooltip>
      )}
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
