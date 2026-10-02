import { Plus } from "lucide-react";
import type { Workspace } from "../api/client";
import { WorkspaceState } from "../components/WorkspaceState";
import { Button } from "../components/ui/button";
import { icon } from "../components/ui/icon";
import {
  demoDiscipline,
  demoWorkPackageName,
} from "../ui/demo/demoPresentation";

/** The existing package inventory and its creation empty state. */
export function WorkPackageDirectory({
  data,
  onStructure,
  openWorkPackage,
}: {
  data: Workspace;
  onStructure: () => void;
  openWorkPackage: (id: string) => void;
}) {
  return (
    <section className="project-home" aria-label="项目工作包">
      <header>
        <h1>工作包</h1>
        {!!data.state.work_packages.length && (
          <Button onClick={onStructure}>
            <Plus {...icon} /> 新建工作包
          </Button>
        )}
      </header>
      <div className="work-rows">
        {data.state.work_packages.map((wp) => (
          <button
            type="button"
            className="work-row"
            key={wp.id}
            onClick={() => openWorkPackage(wp.id)}
          >
            <strong>{demoWorkPackageName(wp.id, wp.name)}</strong>
            <span>{demoDiscipline(wp.discipline)} · 查看详情 →</span>
          </button>
        ))}
      </div>
      {!data.state.work_packages.length && (
        <EmptyWorkPackages onCreate={onStructure} />
      )}
    </section>
  );
}

export function EmptyWorkPackages({ onCreate }: { onCreate: () => void }) {
  return (
    <WorkspaceState
      kind="empty"
      title="还没有工作包"
      description="创建区域和工作包后，可以关联模型、跟踪变更并运行协调检查。"
      action={
        <Button onClick={onCreate}>
          <Plus {...icon} /> 新建工作包
        </Button>
      }
    />
  );
}
