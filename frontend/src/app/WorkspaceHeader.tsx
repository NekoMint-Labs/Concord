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
import type { WorkspaceTab } from "./destinations";

/** Project context, destination navigation, and local actions are separate bands. */
export function WorkspaceHeader({
  data,
  wp,
  tab,
  navCollapsed = false,
  onToggleNav,
  children,
}: {
  data: Workspace;
  wp?: WorkPackage;
  tab?: WorkspaceTab;
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
              <span>
                {demoAreaName(
                  wp.area_id,
                  data.state.areas.find((area) => area.id === wp.area_id)
                    ?.name ?? wp.area_id,
                )}
              </span>
              <span className="crumb-sep">/</span>
              <strong>{demoWorkPackageName(wp.id, wp.name)}</strong>
            </>
          )}
          {tab && (
            <span className="workspace-location">
              {
                (
                  {
                    coordination: "概览",
                    bim: "模型",
                    sources: "模型版本",
                    impact: "影响",
                    packages: "问题",
                    documents: "文档",
                    operations: "运行记录",
                    gis: "现场地图",
                    capabilities: "能力诊断",
                  } satisfies Record<WorkspaceTab, string>
                )[tab]
              }
            </span>
          )}
        </div>
      </div>
      <div className="local-actions" aria-label="当前工作区操作">
        {children}
      </div>
    </header>
  );
}
