import type { ReactNode } from "react";
import { PanelLeftOpen } from "lucide-react";
import type { WorkPackage, Workspace } from "../api/client";
import { AppTooltip } from "../components/ui/AppTooltip";
import { icon } from "../components/ui/icon";
import {
  demoAreaName,
  demoProjectName,
  demoWorkPackageName,
} from "../ui/demo/demoPresentation";
import { WorkspaceTabs, type WorkspaceTab } from "./WorkspaceTabs";

/** Project context, destination navigation, and local actions are separate bands. */
export function WorkspaceHeader({
  data,
  wp,
  tab,
  onTab,
  navCollapsed = false,
  onToggleNav,
  children,
}: {
  data: Workspace;
  wp?: WorkPackage;
  tab?: WorkspaceTab;
  onTab?: (tab: WorkspaceTab) => void;
  navCollapsed?: boolean;
  onToggleNav?: () => void;
  children?: ReactNode;
}) {
  return (
    <header className="app-header">
      <div className="context-bar">
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
        <div className="breadcrumb" aria-label="当前工程上下文">
          <span>
            {demoProjectName(data.state.project.id, data.state.project.name)}
          </span>
          {wp && (
            <>
              <span className="crumb-sep">/</span>
              <span>{demoAreaName(wp.area_id, wp.area_id)}</span>
              <span className="crumb-sep">/</span>
              <strong>{demoWorkPackageName(wp.id, wp.name)}</strong>
              <code>{wp.id}</code>
            </>
          )}
        </div>
      </div>
      <div className="destination-bar">
        {tab && onTab && <WorkspaceTabs tab={tab} onTab={onTab} />}
        <div className="local-actions" aria-label="当前工作区操作">
          {children}
        </div>
      </div>
    </header>
  );
}
