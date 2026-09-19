import { Building2, ChevronDown, PanelLeftClose } from "lucide-react";
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
  return (
    /*
      Collapsed, the column is off the window's own edge rather than unmounted -
      the slide is a state of the shell, and a column that left the tree could not
      be animated out of one. `inert` is what keeps that honest: a region that is
      not on screen must not be reachable by Tab, and it is the one attribute that
      takes an off-canvas subtree out of focus, pointer, and assistive-technology
      reach in the same statement.
    */
    <aside className="sidebar" aria-label="项目与工作包" inert={collapsed}>
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
      {/*
        The project picker is a menu, not a native <select>: the platform's own
        dropdown is a different control language, it renders its own arrow and
        popup, and on the WebView it is the one control on this surface whose
        appearance the product does not decide. The menu also states which
        project is current, which a closed select cannot do at a glance.

        It reads as a workspace switcher rather than as a form field because it
        states the three things a picker states - the kind of thing (a mark), the
        current one (the name), and that there are others (a chevron) - and spends
        its boundary on interaction instead of on rest (styles/shell.css).
      */}
      <div className="project-picker">
        <AppMenu
          label="项目"
          align="start"
          triggerClassName="project-trigger"
          trigger={
            <>
              <Building2 className="project-mark" {...icon} />
              <span className="project-name">
                {current}
                {demo && <small>演示 / 示例</small>}
              </span>
              <ChevronDown className="project-chevron" {...icon} />
            </>
          }
        >
          <AppMenuLabel>当前项目</AppMenuLabel>
          <AppMenuItem active onSelect={() => onProject(project)}>
            {current}
            {project === "harbor-east" && " · 演示 / 示例"}
          </AppMenuItem>
          {recent.length > 0 && (
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
          <AppMenuSeparator />
          <AppMenuLabel>切换项目</AppMenuLabel>
          {projects
            ?.filter(
              (item) =>
                item.id !== project &&
                !recent.some((recentItem) => recentItem.id === item.id),
            )
            .slice(0, 5)
            .map((item) => (
              <AppMenuItem key={item.id} onSelect={() => onProject(item.id)}>
                {item.name}
                {item.id === "harbor-east" && " · 演示"}
              </AppMenuItem>
            ))}
          <AppMenuSeparator />
          <AppMenuItem onSelect={() => onNewProject?.()}>新建项目</AppMenuItem>
          <AppMenuItem onSelect={() => onOpenProject?.()}>
            打开项目…
          </AppMenuItem>
          <AppMenuItem onSelect={() => onProjectSettings?.()}>
            项目设置
          </AppMenuItem>
        </AppMenu>
      </div>
      <nav className="sidebar-section" aria-label="工作包">
        <div className="sidebar-label sidebar-label-action">
          <span>工作包</span>
          <button type="button" onClick={() => onStructure?.()}>
            添加
          </button>
        </div>
        {data.state.areas.map((area) => (
          <div key={area.id} className="area-group">
            <div className="area-title">{demoAreaName(area.id, area.name)}</div>
            {data.state.work_packages
              .filter((item) => item.area_id === area.id)
              .map((item) => {
                const status =
                  data.analysis?.readiness.find(
                    (readiness) => readiness.work_package_id === item.id,
                  )?.status ?? "UNCHECKED";
                return (
                  <div className="package-nav-row" key={item.id}>
                    <button
                      className={`package-nav ${selected === item.id ? "selected" : ""}`}
                      aria-current={selected === item.id ? "page" : undefined}
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
                  </div>
                );
              })}
          </div>
        ))}
      </nav>
    </aside>
  );
}
