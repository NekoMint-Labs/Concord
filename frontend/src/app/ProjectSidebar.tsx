import { useState } from "react";
import {
  Box,
  Building2,
  ChevronsUpDown,
  CircleDot,
  FileText,
  FolderOpen,
  History,
  Home,
  PanelLeftClose,
  Plus,
  Search,
  Settings2,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { DTO, Workspace } from "../api/client";
import { Status } from "../components/Status";
import {
  AppMenu,
  AppMenuItem,
  AppMenuLabel,
  AppMenuSeparator,
} from "../components/ui/AppMenu";
import { AppTooltip } from "../components/ui/AppTooltip";
import { icon } from "../components/ui/icon";
import {
  demoAreaName,
  demoDiscipline,
  demoProjectName,
  demoWorkPackageName,
} from "../ui/demo/demoPresentation";
import type { WorkspaceTab } from "./destinations";

/** Abnormal states earn the only labels here; normal rows stay plain text. */
const notable = new Set(["BLOCKED", "WAITING_APPROVAL", "STALE"]);

const workspaceLinks: {
  tab: WorkspaceTab;
  label: string;
  icon: LucideIcon;
}[] = [
  { tab: "coordination", label: "概览", icon: Home },
  { tab: "bim", label: "模型", icon: Box },
  { tab: "sources", label: "版本", icon: Building2 },
  { tab: "impact", label: "变更", icon: History },
  { tab: "packages", label: "问题", icon: CircleDot },
  { tab: "documents", label: "文档", icon: FileText },
  { tab: "operations", label: "活动 / 运行", icon: History },
];

export function ProjectSidebar({
  data,
  project,
  projects,
  recent = [],
  selected,
  tab = "coordination",
  collapsed = false,
  onCollapse,
  onProject,
  onNewProject,
  onOpenProject,
  onProjectSettings,
  onStructure,
  onSelect,
  onTab,
}: {
  data: Workspace;
  project: string;
  projects: DTO<"Project">[] | undefined;
  recent?: DTO<"Project">[];
  selected: string;
  tab?: WorkspaceTab;
  collapsed?: boolean;
  onCollapse: () => void;
  onProject: (id: string) => void;
  onNewProject?: () => void;
  onOpenProject?: () => void;
  onProjectSettings?: () => void;
  onStructure?: () => void;
  onSelect: (id: string) => void;
  onTab?: (tab: WorkspaceTab) => void;
}) {
  const [query, setQuery] = useState("");
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
  const search = query.trim().toLocaleLowerCase();
  const visiblePackages = data.state.work_packages.filter((item) =>
    `${demoWorkPackageName(item.id, item.name)} ${item.id} ${demoDiscipline(item.discipline)}`
      .toLocaleLowerCase()
      .includes(search),
  );

  return (
    <aside className="sidebar" aria-label="项目与工作包" inert={collapsed}>
      <header className="sidebar-header">
        <div className="brand">
          <span className="brand-mark" aria-hidden="true">
            C
          </span>
          <span className="brand-name">
            <strong>Concord</strong>
            <span>工程协同</span>
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
            label="项目"
            align="start"
            triggerClassName="project-trigger"
            trigger={
              <>
                <Building2 className="project-mark" {...icon} />
                <span className="project-name">
                  <strong>{current}</strong>
                  {demo && <span>演示 / 示例</span>}
                </span>
                <ChevronsUpDown className="project-chevron" {...icon} />
              </>
            }
          >
            <AppMenuLabel>项目操作</AppMenuLabel>
            <AppMenuItem onSelect={() => onNewProject?.()}>
              <Plus {...icon} /> 新建项目
            </AppMenuItem>
            <AppMenuItem onSelect={() => onOpenProject?.()}>
              <FolderOpen {...icon} /> 打开项目…
            </AppMenuItem>
            <AppMenuItem onSelect={() => onProjectSettings?.()}>
              <Settings2 {...icon} /> 项目设置
            </AppMenuItem>
            <AppMenuSeparator />
            <AppMenuLabel>当前项目</AppMenuLabel>
            <AppMenuItem active onSelect={() => onProject(project)}>
              {current}
              {demo && " · 演示"}
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
                      {item.name}
                      {item.id === "harbor-east" && " · 演示"}
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
                    {item.name}
                    {item.id === "harbor-east" && " · 演示"}
                  </AppMenuItem>
                ))}
              </>
            )}
          </AppMenu>
        </div>
        <label className="sidebar-search">
          <Search {...icon} />
          <span className="sr-only">搜索工作包</span>
          <input
            type="search"
            placeholder="搜索工作包"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
        </label>
      </header>

      <div className="sidebar-content">
        <nav className="sidebar-primary" aria-label="主要工作区">
          <span className="sidebar-section-label">工作区</span>
          {workspaceLinks.map((item) => {
            const Icon = item.icon;
            return (
              <button
                key={item.tab}
                type="button"
                className={tab === item.tab ? "active" : ""}
                aria-current={tab === item.tab ? "page" : undefined}
                onClick={() => onTab?.(item.tab)}
              >
                <Icon {...icon} />
                {item.label}
              </button>
            );
          })}
        </nav>

        <nav className="sidebar-group" aria-label="工作包">
          <div className="sidebar-group-heading">
            <span>工作包</span>
            <AppTooltip label="新建工作包" side="right">
              <button
                type="button"
                className="sidebar-group-create"
                aria-label="新建工作包"
                onClick={() => onStructure?.()}
              >
                <Plus {...icon} />
              </button>
            </AppTooltip>
          </div>
          {data.state.areas.map((area) => {
            const packages = visiblePackages.filter(
              (item) => item.area_id === area.id,
            );
            if (search && !packages.length) return null;
            return (
              <section key={area.id} className="area-group">
                <h2 className="area-title">
                  {demoAreaName(area.id, area.name)}
                </h2>
                <ul className="package-nav-list">
                  {packages.map((item) => {
                    const status =
                      data.analysis?.readiness.find(
                        (readiness) => readiness.work_package_id === item.id,
                      )?.status ?? "UNCHECKED";
                    return (
                      <li className="package-nav-row" key={item.id}>
                        <button
                          className={`package-nav ${selected === item.id ? "selected" : ""}`}
                          aria-current={
                            selected === item.id ? "page" : undefined
                          }
                          onClick={() => onSelect(item.id)}
                        >
                          <span>
                            <strong>
                              {demoWorkPackageName(item.id, item.name)}
                            </strong>
                            <small>{demoDiscipline(item.discipline)}</small>
                          </span>
                          {notable.has(status) && <Status value={status} />}
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </section>
            );
          })}
          {!visiblePackages.length && (
            <p className="quiet-message sidebar-empty">
              {search ? "没有匹配的工作包。" : "还没有区域或工作包。"}
            </p>
          )}
        </nav>
      </div>

      <footer className="sidebar-footer">
        <button type="button" onClick={() => onProjectSettings?.()}>
          <Settings2 {...icon} />
          项目设置
        </button>
      </footer>
    </aside>
  );
}
