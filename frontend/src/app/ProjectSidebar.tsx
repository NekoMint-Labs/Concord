import {
  Building2,
  ChevronsUpDown,
  FolderOpen,
  PanelLeftClose,
  Plus,
  Settings2,
} from "lucide-react";
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
  demoWorkPackageName,
} from "../ui/demo/demoPresentation";

/** Abnormal states earn the only labels here; normal rows stay plain text. */
const notable = new Set(["BLOCKED", "WAITING_APPROVAL", "STALE"]);

export function ProjectSidebar({
  data,
  project,
  projects,
  recent = [],
  selected,
  collapsed = false,
  onCollapse,
  onProject,
  onNewProject,
  onOpenProject,
  onProjectSettings,
  onStructure,
  onLinkBim,
  onSelect,
}: {
  data: Workspace;
  project: string;
  projects: DTO<"Project">[] | undefined;
  recent?: DTO<"Project">[];
  selected: string;
  collapsed?: boolean;
  onCollapse: () => void;
  onProject: (id: string) => void;
  onNewProject?: () => void;
  onOpenProject?: () => void;
  onProjectSettings?: () => void;
  onStructure?: () => void;
  onLinkBim?: (workPackageId: string) => void;
  onSelect: (id: string) => void;
}) {
  const current =
    projects?.find((item) => item.id === project)?.name ?? project;
  const demo = project === "harbor-east";
  const otherProjects = projects
    ?.filter(
      (item) =>
        item.id !== project &&
        !recent.some((recentItem) => recentItem.id === item.id),
    )
    .slice(0, 5);

  return (
    <aside className="sidebar" aria-label="项目与工作包" inert={collapsed}>
      <header className="sidebar-header">
        <div className="brand">
          <span className="brand-name">
            <strong>Concord</strong>
            <span>施工协同</span>
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
                  <small>当前项目</small>
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
              {demo && " · 演示 / 示例"}
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
      </header>

      <div className="sidebar-content">
        <nav className="sidebar-group" aria-label="工作包">
          <div className="sidebar-group-heading">
            <span>工作包</span>
            <button
              type="button"
              className="sidebar-group-create"
              onClick={() => onStructure?.()}
            >
              <Plus {...icon} /> 新建工作包
            </button>
          </div>
          {data.state.areas.map((area) => (
            <section key={area.id} className="area-group">
              <h2 className="area-title">{demoAreaName(area.id, area.name)}</h2>
              <ul className="package-nav-list">
                {data.state.work_packages
                  .filter((item) => item.area_id === area.id)
                  .map((item) => {
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
                            <small>
                              {item.id} · {demoDiscipline(item.discipline)}
                            </small>
                          </span>
                          {notable.has(status) && <Status value={status} />}
                        </button>
                        {selected === item.id && (
                          <button
                            type="button"
                            className="package-link-bim"
                            onClick={() => onLinkBim?.(item.id)}
                          >
                            关联 BIM
                          </button>
                        )}
                      </li>
                    );
                  })}
              </ul>
            </section>
          ))}
          {!data.state.areas.length && (
            <p className="quiet-message sidebar-empty">还没有区域或工作包。</p>
          )}
        </nav>
      </div>
    </aside>
  );
}
