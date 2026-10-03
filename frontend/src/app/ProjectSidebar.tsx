import {
  Box,
  Building2,
  ChevronsUpDown,
  FolderOpen,
  Home,
  PanelLeftClose,
  PanelLeftOpen,
  Plus,
  Settings2,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { DTO, ProjectSourceStatus, Workspace } from "../api/client";
import {
  AppMenu,
  AppMenuItem,
  AppMenuLabel,
  AppMenuSeparator,
} from "../components/ui/AppMenu";
import { AppTooltip } from "../components/ui/AppTooltip";
import { icon } from "../components/ui/icon";
import { demoProjectName } from "../ui/demo/demoPresentation";
import type { WorkspaceTab } from "./destinations";

const workspaceLinks: {
  tab: WorkspaceTab;
  label: string;
  icon: LucideIcon;
}[] = [
  { tab: "work", label: "工作", icon: Home },
  { tab: "bim", label: "模型", icon: Box },
  { tab: "project", label: "项目", icon: Building2 },
];

export function ProjectSidebar({
  project,
  projects,
  recent = [],
  tab = "work",
  collapsed = false,
  onCollapse,
  onProject,
  onNewProject,
  onOpenProject,
  onOpenDemo,
  onProjectSettings,
  onTab,
}: {
  data: Workspace;
  project: string;
  projects: DTO<"Project">[] | undefined;
  recent?: DTO<"Project">[];
  sources?: ProjectSourceStatus[];
  selected: string;
  tab?: WorkspaceTab;
  collapsed?: boolean;
  onCollapse: () => void;
  onProject: (id: string) => void;
  onNewProject?: () => void;
  onOpenProject?: () => void;
  onOpenDemo?: () => void;
  onProjectSettings?: () => void;
  onStructure?: () => void;
  onSelect: (id: string) => void;
  onTab?: (tab: WorkspaceTab) => void;
}) {
  const storedName =
    projects?.find((item) => item.id === project)?.name ?? project;
  const current = demoProjectName(project, storedName);
  const demo = project === "harbor-east";
  const otherProjects = projects
    ?.filter(
      (item) =>
        item.id !== project &&
        !recent.some((recentItem) => recentItem.id === item.id),
    )
    .slice(0, 5);

  return (
    <aside className="sidebar" aria-label="项目导航" inert={collapsed}>
      <header className="sidebar-header">
        <div className="brand">
          <span className="brand-mark" aria-hidden="true">
            C
          </span>
          <span className="brand-name">
            <strong>Concord</strong>
          </span>
          <AppTooltip label="收起侧栏" side="right">
            <button
              type="button"
              className="icon-button"
              aria-label="收起侧栏"
              onClick={onCollapse}
            >
              <PanelLeftClose {...icon} />
            </button>
          </AppTooltip>
        </div>
        <div className="project-picker">
          <AppMenu
            label="切换项目"
            align="start"
            triggerClassName="project-trigger"
            trigger={
              <>
                <Building2 className="project-mark" {...icon} />
                <span className="project-name">
                  <strong>{current}</strong>
                </span>
                <ChevronsUpDown className="project-chevron" {...icon} />
              </>
            }
          >
            <AppMenuLabel>当前项目</AppMenuLabel>
            <AppMenuItem active onSelect={() => onProject(project)}>
              {current}
              {demo && " · 示例项目"}
            </AppMenuItem>
            {recent.some((item) => item.id !== project) && (
              <>
                <AppMenuSeparator />
                <AppMenuLabel>最近项目</AppMenuLabel>
                {recent
                  .filter((item) => item.id !== project)
                  .map((item) => (
                    <AppMenuItem
                      key={item.id}
                      onSelect={() => onProject(item.id)}
                    >
                      {demoProjectName(item.id, item.name)}
                      {item.id === "harbor-east" && " · 示例项目"}
                    </AppMenuItem>
                  ))}
              </>
            )}
            {!!otherProjects?.length && (
              <>
                <AppMenuSeparator />
                <AppMenuLabel>其他项目</AppMenuLabel>
                {otherProjects.map((item) => (
                  <AppMenuItem
                    key={item.id}
                    onSelect={() => onProject(item.id)}
                  >
                    {demoProjectName(item.id, item.name)}
                    {item.id === "harbor-east" && " · 示例项目"}
                  </AppMenuItem>
                ))}
              </>
            )}
            <AppMenuSeparator />
            <AppMenuItem onSelect={() => onNewProject?.()}>
              <Plus {...icon} /> 新建项目
            </AppMenuItem>
            <AppMenuItem onSelect={() => onOpenProject?.()}>
              <FolderOpen {...icon} /> 打开项目…
            </AppMenuItem>
            <AppMenuItem onSelect={() => onOpenDemo?.()}>
              <FolderOpen {...icon} /> 打开示例项目
            </AppMenuItem>
            <AppMenuItem onSelect={() => onProjectSettings?.()}>
              <Settings2 {...icon} /> 项目设置
            </AppMenuItem>
          </AppMenu>
        </div>
      </header>

      <div className="sidebar-content">
        <nav className="sidebar-primary" aria-label="主要工作区">
          {workspaceLinks.map((item) => {
            const Icon = item.icon;
            return (
              <button
                key={item.tab}
                type="button"
                className={tab === item.tab ? "active" : ""}
                aria-current={tab === item.tab ? "page" : undefined}
                aria-label={item.label}
                onClick={() => {
                  onTab?.(item.tab);
                }}
              >
                <Icon {...icon} />
                {item.label}
              </button>
            );
          })}
        </nav>
        <div className="sidebar-browse">
          <button
            type="button"
            className={tab === "browse" ? "active" : ""}
            aria-label="浏览"
            aria-current={tab === "browse" ? "page" : undefined}
            onClick={() => {
              onTab?.("browse");
            }}
          >
            <PanelLeftOpen {...icon} />
            浏览
          </button>
        </div>
      </div>
      <div className="sidebar-footer">
        <button type="button" onClick={() => onProjectSettings?.()}>
          <Settings2 {...icon} /> 设置
        </button>
      </div>
    </aside>
  );
}
