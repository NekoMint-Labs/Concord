import type { ReactNode } from "react";
import { useQueries } from "@tanstack/react-query";
import { api, type Workspace } from "../api/client";
import type { ProjectContext } from "../app/useProjectContext";
import type { WorkspaceTab } from "../app/destinations";
import {
  demoAreaName,
  demoDiscipline,
  demoProjectDescription,
  demoProjectName,
  demoWorkPackageName,
} from "../ui/demo/demoPresentation";
import { shortDate, statusLabel, statusTone } from "../ui/labels";

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
}) {
  const project = workspace.state.project;
  const { baseline, documents, models, revisionsFor, pendingModels } = context;
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

  return (
    <div className="project-primary">
      <header className="project-overview-head">
        <div>
          <h1>{demoProjectName(project.id, project.name)}</h1>
          <p>
            {demoProjectDescription(project.id, project.description) ||
              "项目协调工作区"}
          </p>
        </div>
        <button type="button" onClick={() => onTab("settings")}>
          项目设置
        </button>
      </header>
      <section className="project-state" aria-label="当前状态">
        <div className="project-state-flow">
          <div className="project-state-baseline">
            <span>当前基线 ·</span>
            <strong>{baseline ? `B${baseline.sequence}` : "尚未确认"}</strong>
            {baseline && <small>{shortDate(baseline.created_at)} 已确认</small>}
          </div>
          <div className="project-state-readiness">
            <span>施工判断 ·</span>
            <strong
              className={blocked || workspace.stale ? "is-attention" : ""}
            >
              {readinessText}
            </strong>
          </div>
        </div>
        <div className="project-state-footer">
          <p>
            {pendingModels.length ||
            (packages.length && (workspace.stale || !workspace.analysis)) ||
            blocked ||
            !baseline ? (
              <>
                <span>下一步</span> ·{" "}
                {pendingModels.length
                  ? "核对待审核模型"
                  : packages.length && (workspace.stale || !workspace.analysis)
                    ? "检查当前施工条件"
                    : blocked
                      ? "处理受阻工作包"
                      : !models.length
                        ? "添加项目模型"
                        : "确认当前基线"}
              </>
            ) : (
              "当前没有待处理的模型或受阻工作包"
            )}
          </p>
          <span>
            {[
              `工作包 ${packages.length}`,
              `模型 ${models.length}`,
              pendingModels.length ? `待审核 ${pendingModels.length}` : "",
              `项目文件 ${documents.length}`,
            ]
              .filter(Boolean)
              .join(" · ")}
          </span>
        </div>
      </section>
      <div className="project-main">
        {sourcesRegister}
        <section className="project-ledger" aria-label="工作包状态">
          <header className="project-ledger-head">
            <div>
              <h2>工作包</h2>
              <span>{packages.length} 个</span>
            </div>
            <div>
              {onStructure && (
                <button type="button" onClick={onStructure}>
                  + 添加工作包
                </button>
              )}
              <button type="button" onClick={() => onTab("work-packages")}>
                查看全部 →
              </button>
            </div>
          </header>
          {packages.length ? (
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
          ) : (
            <p className="quiet-message">还没有工作包。</p>
          )}
        </section>
        {/* The lifecycle the state band summarises: every revision the project
              holds, newest first, and which of them the baseline was cut from.
              The band answers "what is current"; this answers "how it got
              there", which is the record a coordinator is asked for. */}
        {!!models.length && (
          <section aria-label="版本记录">
            <h2>
              版本记录
              <button type="button" onClick={() => onTab("sources")}>
                管理 →
              </button>
            </h2>
            <div className="project-revisions">
              {models.map((item, index) => {
                const revisions = [...revisionsFor(index)].sort(
                  (a, b) => b.sequence - a.sequence,
                );
                return revisions.map((revision) => {
                  const isLatest = revision.id === item.latest_revision_id;
                  const isBaseline = revision.id === item.accepted_revision_id;
                  return (
                    <div className="project-revision" key={revision.id}>
                      <span className="mono">R{revision.sequence}</span>
                      <span className="project-revision-name">
                        {item.source.name}
                      </span>
                      <span
                        className={`package-status is-${isBaseline ? "ready" : isLatest && item.has_pending_revision ? "waiting" : "neutral"}`}
                      >
                        <i aria-hidden="true" />
                        {isBaseline
                          ? "已纳入基线"
                          : isLatest && item.has_pending_revision
                            ? "待审核"
                            : isLatest
                              ? "最新版本"
                              : "历史版本"}
                      </span>
                      <time dateTime={revision.imported_at}>
                        {shortDate(revision.imported_at)}
                      </time>
                    </div>
                  );
                });
              })}
            </div>
          </section>
        )}
      </div>
    </div>
  );
}
