import type { ReactNode } from "react";
import { useQueries } from "@tanstack/react-query";
import { api, type Workspace } from "../api/client";
import type { ProjectContext } from "../app/useProjectContext";
import type { WorkspaceTab } from "../app/destinations";
import {
  demoAreaName,
  demoDiscipline,
  demoProjectName,
  demoWorkPackageName,
} from "../ui/demo/demoPresentation";
import { statusLabel, statusTone } from "../ui/labels";
import { AppMenu, AppMenuItem } from "../components/ui/AppMenu";

/** Current project state, package inventory, and its revision history. */
export function ProjectOverview({
  workspace,
  context,
  onTab,
  onPackage,
  selected,
  onStructure,
  sourcesRegister,
}: {
  workspace: Workspace;
  context: ProjectContext;
  onTab: (tab: WorkspaceTab) => void;
  onPackage: (id: string) => void;
  selected?: string;
  onStructure?: () => void;
  sourcesRegister?: ReactNode;
  onSource?: (id: string, revisionId?: string) => void;
}) {
  const project = workspace.state.project;
  const { baseline, models, pendingModels } = context;
  const packages = workspace.state.work_packages;
  const bindings = useQueries({
    queries: models.map((item) => ({
      queryKey: [
        "bim-bindings",
        project.id,
        item.source.id,
        item.latest_revision_id,
      ],
      queryFn: () =>
        api.bimBindings(project.id, item.source.id, item.latest_revision_id!),
    })),
  });
  const linkedCount = (wp: Workspace["state"]["work_packages"][number]) => {
    const keys = new Set<string>();
    for (const query of bindings)
      for (const entry of query.data ?? []) {
        if (entry.binding.work_package_id === wp.id)
          keys.add(`${entry.binding.source_id}:${entry.binding.global_id}`);
      }
    return keys.size || wp.element_ids.length;
  };
  const readiness = (id: string) =>
    workspace.analysis?.readiness.find((item) => item.work_package_id === id)
      ?.status ?? "UNCHECKED";
  const blocked = packages.filter(
    (wp) => readiness(wp.id) === "BLOCKED",
  ).length;
  const ready = packages.filter((wp) => readiness(wp.id) === "READY").length;
  const readinessText = !packages.length
    ? "还没有工作包"
    : workspace.stale
      ? "当前判断待复核"
      : !workspace.analysis
        ? "尚未检查施工条件"
        : blocked
          ? `${blocked} 个工作包暂不能施工`
          : ready === packages.length
            ? `${ready} / ${packages.length} 工作包可施工`
            : `${ready} / ${packages.length} 个工作包可施工`;

  const nextLabel = !packages.length
    ? "添加工作包"
    : pendingModels.length
      ? "核对待审核模型"
      : !models.length
        ? "添加项目模型"
        : workspace.stale || !workspace.analysis
          ? "检查当前施工条件"
          : blocked
            ? "处理受阻工作包"
            : !baseline
              ? "确认资料基线"
              : "查看工作事项";
  const stateReason = pendingModels.length
    ? `有 ${pendingModels.length} 份模型的新版本尚未确认；施工判断仍依据当前基线，不代表新版本已经可施工。`
    : !packages.length
      ? "当前缺少工程检查范围，尚不能判断施工条件。"
      : !models.length
        ? "尚未上传项目 IFC；本地预览不会成为项目工程依据。"
        : workspace.stale
          ? "工程事实已更新，现有施工判断需要重新检查。"
          : !workspace.analysis
            ? "尚未运行施工检查，当前没有可施工结论。"
            : blocked
              ? "检查发现未解决的施工条件；请核对工作包的阻塞原因与依据。"
              : !baseline
                ? "已有项目资料，但尚未人工确认资料版本集合。"
                : "当前资料版本已确认，施工检查没有未解决的阻塞条件。";
  return (
    <div className="project-primary">
      <header className="project-overview-head">
        <div>
          <h1>{demoProjectName(project.id, project.name)}</h1>
        </div>
        <AppMenu label="项目操作">
          {onStructure && (
            <AppMenuItem onSelect={onStructure}>添加工作包</AppMenuItem>
          )}
          <AppMenuItem onSelect={() => onTab("settings")}>项目设置</AppMenuItem>
        </AppMenu>
      </header>
      <section className="project-state" aria-label="当前状态">
        <h2>{pendingModels.length ? "有新版本待检查" : readinessText}</h2>
        <p className="project-state-reason">{stateReason}</p>
        <div className="project-state-footer">
          <p>
            <span>下一步</span> ·{" "}
            <button
              type="button"
              className="text-button"
              onClick={() => {
                if (!packages.length && onStructure) onStructure();
                else
                  onTab(
                    pendingModels.length || !models.length || !baseline
                      ? "sources"
                      : "work",
                  );
              }}
            >
              {nextLabel} →
            </button>
          </p>
        </div>
      </section>
      <div className="project-main">
        {sourcesRegister}
        {!!packages.length && (
          <section className="project-ledger" aria-label="工作包状态">
            <header className="project-ledger-head">
              <div>
                <h2>工作包</h2>
                <span>{packages.length} 个</span>
              </div>
              <div>
                <button type="button" onClick={() => onTab("work-packages")}>
                  查看全部 →
                </button>
              </div>
            </header>
            <ul className="project-package-list">
              {packages.map((wp) => {
                const status = readiness(wp.id);
                const area = workspace.state.areas.find(
                  (item) => item.id === wp.area_id,
                );
                return (
                  <li key={wp.id}>
                    <button
                      type="button"
                      aria-pressed={selected === wp.id}
                      onClick={() => onPackage(wp.id)}
                    >
                      <span className="project-package-id mono" title={wp.id}>
                        {wp.id}
                      </span>
                      <span className="project-package-name">
                        <strong title={demoWorkPackageName(wp.id, wp.name)}>
                          {demoWorkPackageName(wp.id, wp.name)}
                        </strong>
                        <small className="project-package-meta">
                          {demoAreaName(wp.area_id, area?.name ?? wp.area_id)}
                          {" · "}
                          {demoDiscipline(wp.discipline)}
                        </small>
                      </span>
                      <span className="numeric">{linkedCount(wp)} 个构件</span>
                      <span
                        className={`package-status is-${workspace.stale ? "waiting" : statusTone(status)}`}
                      >
                        <i aria-hidden="true" />
                        {workspace.stale ? "需复核" : statusLabel(status)}
                      </span>
                      <span className="project-package-open" aria-hidden="true">
                        →
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </section>
        )}
      </div>
      {!packages.length &&
        !models.length &&
        !context.documents.length &&
        !context.baselines.length &&
        !workspace.events.length && (
          <nav aria-label="项目内容" className="project-empty-record-links">
            <button
              type="button"
              className="text-button"
              onClick={() => onTab("documents")}
            >
              文档 →
            </button>
            <button
              type="button"
              className="text-button"
              onClick={() => onTab("history")}
            >
              历史 →
            </button>
          </nav>
        )}
    </div>
  );
}
