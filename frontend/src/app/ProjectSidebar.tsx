import { useState } from "react";
import {
  Box,
  Building2,
  ChevronsUpDown,
  FolderOpen,
  Home,
  PanelLeftClose,
  Plus,
  Search,
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
import {
  demoAreaName,
  demoDiscipline,
  demoProjectName,
  demoWorkPackageName,
} from "../ui/demo/demoPresentation";
import { statusLabel, statusTone } from "../ui/labels";
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
  data,
  project,
  projects,
  recent = [],
  sources = [],
  selected,
  tab = "work",
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
  sources?: ProjectSourceStatus[];
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
  const models = sources.filter(
    (item) => item.source.kind === "BIM" && item.latest_revision_id,
  );
  const readiness = (id: string) =>
    data.analysis?.readiness.find((item) => item.work_package_id === id)
      ?.status ?? "UNCHECKED";
  const visiblePackages = data.state.work_packages.filter((item) =>
    `${demoWorkPackageName(item.id, item.name)} ${item.id} ${demoDiscipline(item.discipline)}`
      .toLocaleLowerCase()
      .includes(search),
  );

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
                      {demoProjectName(item.id, item.name)}
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
                    {demoProjectName(item.id, item.name)}
                    {item.id === "harbor-east" && " · 演示"}
                  </AppMenuItem>
                ))}
              </>
            )}
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
                onClick={() => onTab?.(item.tab)}
              >
                <Icon {...icon} />
                {item.label}
              </button>
            );
          })}
        </nav>

        <nav
          className="sidebar-group"
          aria-label={search ? "搜索工作包结果" : "工作包"}
        >
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
                    return (
                      <li className="package-nav-row" key={item.id}>
                        <button
                          className={`package-nav ${selected === item.id ? "selected" : ""}`}
                          aria-current={
                            selected === item.id ? "page" : undefined
                          }
                          onClick={() => onSelect(item.id)}
                        >
                          <i
                            className={`package-state is-${statusTone(readiness(item.id))}`}
                            title={statusLabel(readiness(item.id))}
                            aria-hidden="true"
                          />
                          <span>
                            <strong>
                              {demoWorkPackageName(item.id, item.name)}
                            </strong>
                            <small>
                              {demoDiscipline(item.discipline)}
                              <span className="sr-only">
                                ，{statusLabel(readiness(item.id))}
                              </span>
                            </small>
                          </span>
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
        {!search && !!models.length && (
          <nav className="sidebar-group sidebar-models" aria-label="项目模型">
            <div className="sidebar-group-heading">
              <span>模型</span>
            </div>
            <ul className="package-nav-list">
              {models.map((item) => (
                <li className="package-nav-row" key={item.source.id}>
                  <button
                    type="button"
                    className="package-nav"
                    onClick={() => onTab?.("bim")}
                  >
                    <i
                      className={`package-state is-${item.has_pending_revision ? "waiting" : item.accepted_revision_id ? "ready" : "neutral"}`}
                      aria-hidden="true"
                    />
                    <span>
                      <strong>{item.source.name}</strong>
                      <small>
                        {item.has_pending_revision
                          ? "新版本待审核"
                          : item.accepted_revision_id
                            ? "已纳入基线"
                            : "尚未确认"}
                      </small>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </nav>
        )}
      </div>
      <div className="sidebar-footer">
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
        <button type="button" onClick={() => onProjectSettings?.()}>
          <Settings2 {...icon} /> 设置
        </button>
      </div>
    </aside>
  );
}
