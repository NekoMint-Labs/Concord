import { ChevronDown } from "lucide-react";
import type { DTO, Workspace } from "../api/client";
import { Status } from "../components/Status";
import { AppMenu, AppMenuItem } from "../components/ui/AppMenu";
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
  selected,
  onProject,
  onSelect,
}: {
  data: Workspace;
  project: string;
  projects: DTO<"Project">[] | undefined;
  selected: string;
  onProject: (id: string) => void;
  onSelect: (id: string) => void;
}) {
  const current =
    projects?.find((item) => item.id === project)?.name ?? project;
  return (
    <aside className="sidebar" aria-label="项目与工作包">
      <div className="brand">
        <strong>Concord</strong>
        <span>施工协同</span>
      </div>
      {/*
        The project picker is a menu, not a native <select>: the platform's own
        dropdown is a different control language, it renders its own arrow and
        popup, and on the WebView it is the one control on this surface whose
        appearance the product does not decide. The menu also states which
        project is current, which a closed select cannot do at a glance.
      */}
      <div className="project-picker">
        <AppMenu
          label="项目"
          align="start"
          triggerClassName="project-trigger"
          trigger={
            <>
              <span className="project-name">{current}</span>
              <ChevronDown size={14} aria-hidden="true" />
            </>
          }
        >
          {projects?.map((item) => (
            <AppMenuItem
              key={item.id}
              active={item.id === project}
              onSelect={() => onProject(item.id)}
            >
              {item.name}
            </AppMenuItem>
          ))}
        </AppMenu>
      </div>
      <nav className="sidebar-section" aria-label="工作包">
        <div className="sidebar-label">工作包</div>
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
                  <button
                    key={item.id}
                    className={`package-nav ${selected === item.id ? "selected" : ""}`}
                    aria-current={selected === item.id ? "page" : undefined}
                    onClick={() => onSelect(item.id)}
                  >
                    <span>
                      <strong>{demoWorkPackageName(item.id, item.name)}</strong>
                      <small>
                        {item.id} · {demoDiscipline(item.discipline)}
                      </small>
                    </span>
                    {notable.has(status) && <Status value={status} />}
                  </button>
                );
              })}
          </div>
        ))}
      </nav>
    </aside>
  );
}
