import type { ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { Bell, PanelLeftOpen, Search } from "lucide-react";
import { api, type WorkPackage, type Workspace } from "../api/client";
import { AppTooltip } from "../components/ui/AppTooltip";
import { icon } from "../components/ui/icon";
import { demoAreaName, demoWorkPackageName } from "../ui/demo/demoPresentation";
import type { WorkspaceTab } from "./destinations";

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
  const project = data.state.project.id;
  const sources = useQuery({
    queryKey: ["sources", project],
    queryFn: () => api.sourceStatuses(project),
  });
  const source = sources.data?.find(
    (item) => item.source.kind === "BIM" && item.latest_revision_id,
  );
  const revisions = useQuery({
    queryKey: ["revisions", project, source?.source.id],
    queryFn: () => api.sourceRevisions(project, source!.source.id),
    enabled: !!source,
  });
  const latest = revisions.data?.find(
    (item) => item.id === source?.latest_revision_id,
  );
  const baselines = useQuery({
    queryKey: ["baselines", project],
    queryFn: () => api.baselines(project),
    enabled: !!source,
  });
  const baseline = baselines.data?.at(-1);
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
          {wp ? (
            <>
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
          ) : (
            <strong>{data.state.project.name}</strong>
          )}
          {tab && tab !== "bim" && (
            <span className="workspace-location">
              {
                (
                  {
                    coordination: "Overview",
                    "work-packages": "Work Packages",
                    sources: "Model lifecycle",
                    impact: "Changes",
                    packages: "Issues",
                    documents: "Documents",
                    operations: "Activity",
                    gis: "Site map",
                    capabilities: "Tools",
                  } as Record<string, string>
                )[tab]
              }
            </span>
          )}
        </div>
        {latest && (
          <div className="header-versions">
            <span className="version-current">
              <i />R{latest.sequence}⌄
            </span>
            {baseline && (
              <>
                <span>vs</span>
                <span>B{baseline.sequence}⌄</span>
              </>
            )}
          </div>
        )}
      </div>
      <div className="local-actions" aria-label="当前工作区操作">
        <label className="header-search">
          <Search size={14} />
          <input
            aria-label="Search model, issue, or document"
            placeholder="Search model, issue, or document..."
          />
          <kbd>/</kbd>
        </label>
        {children}
        <button
          type="button"
          className="header-icon"
          aria-label="Notifications"
        >
          <Bell size={16} />
        </button>
        <span className="header-avatar" aria-label="Account">
          J
        </span>
      </div>
    </header>
  );
}
