import type { ProjectSourceStatus, Workspace } from "../api/client";
import { useProjectContext } from "./useProjectContext";
import {
  demoAreaName,
  demoDiscipline,
  demoProjectDescription,
  demoProjectName,
  demoWorkPackageName,
} from "../ui/demo/demoPresentation";
import { shortDate, statusLabel, statusTone } from "../ui/labels";
import type { WorkspaceTab } from "./destinations";

// Work packages and models are reached from their own tables, settings from the
// header; this index holds only the project records that have no table here.
const links: { tab: WorkspaceTab; title: string; description: string }[] = [
  { tab: "documents", title: "文档", description: "项目文件与解析内容" },
  { tab: "history", title: "历史", description: "模型基线与版本记录" },
];

export function ProjectHome({
  workspace,
  sources,
  onTab,
  onPackage,
}: {
  workspace: Workspace;
  sources: ProjectSourceStatus[];
  onTab: (tab: WorkspaceTab) => void;
  onPackage: (id: string) => void;
}) {
  const project = workspace.state.project;
  const {
    baseline,
    baselines,
    documents,
    models,
    revisionsFor,
    revisionNo,
    pendingModels,
  } = useProjectContext(project.id, sources);
  const packages = workspace.state.work_packages;
  const readiness = (id: string) =>
    workspace.analysis?.readiness.find((item) => item.work_package_id === id)
      ?.status ?? "UNCHECKED";
  const blocked = packages.filter(
    (wp) => readiness(wp.id) === "BLOCKED",
  ).length;
  const activity = [...workspace.events]
    .sort((a, b) => b.observed_at.localeCompare(a.observed_at))
    .slice(0, 4);
  return (
    <section className="project-home" aria-label="项目管理">
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
      {/* One composition instead of four equal counters: the baseline in force,
          what it means for the work packages, and the model ledger that will
          change it. */}
      <div className="project-state">
        <div className="state-chain">
          <span className="state-label">当前基线</span>
          <div className="state-line">
            <span className="state-figure">
              <strong>{baseline ? `B${baseline.sequence}` : "—"}</strong>
              <small>{baseline ? "已确认" : "尚未确认"}</small>
            </span>
            <span className="state-arrow" aria-hidden="true">
              →
            </span>
            <span className={`state-blocked${blocked ? " is-attention" : ""}`}>
              {blocked ? (
                <>
                  <strong>{blocked}</strong> 个工作包暂不能施工
                </>
              ) : (
                <>
                  全部 <strong>{packages.length}</strong> 个工作包可施工
                </>
              )}
            </span>
          </div>
          <p className="state-totals">
            {/* Label/count clauses joined by one separator, so every gap on the
                line is the same. The pending count used to sit in a full-width
                pair of parentheses, and `）` carries its own side bearing, so
                the separator after it read visibly wider than the ones before
                it. The clause is still omitted when nothing is pending. */}
            {[
              `工作包 ${packages.length}`,
              `模型 ${models.length}`,
              pendingModels.length ? `待审核 ${pendingModels.length}` : "",
              `项目文件 ${documents.length}`,
            ]
              .filter(Boolean)
              .join(" · ")}
          </p>
        </div>
        <div className="state-models" aria-label="模型与版本">
          <div className="state-models-head">
            <span>模型与版本</span>
            {!!models.length && (
              <button type="button" onClick={() => onTab("sources")}>
                管理 →
              </button>
            )}
          </div>
          {models.length ? (
            <ul>
              {models.map((item, index) => (
                <li key={item.source.id}>
                  <button type="button" onClick={() => onTab("bim")}>
                    {item.source.name}
                  </button>
                  <span className="state-rev">
                    <small>最新</small>
                    <span className="mono">
                      {revisionNo(index, item.latest_revision_id)}
                    </span>
                  </span>
                  <span className="state-rev">
                    <small>基线</small>
                    <span className="mono">
                      {revisionNo(index, item.accepted_revision_id)}
                    </span>
                  </span>
                  <span
                    className={`package-status is-${item.has_pending_revision ? "waiting" : item.accepted_revision_id ? "ready" : "neutral"}`}
                  >
                    <i aria-hidden="true" />
                    {item.has_pending_revision
                      ? "新版本待审核"
                      : item.accepted_revision_id
                        ? "已纳入基线"
                        : "尚未确认"}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="quiet-message">还没有上传模型。</p>
          )}
        </div>
      </div>
      {/* The sheet below the state band is the project's record, split by what
          each column is for: the main column holds the tables that carry
          columns of facts, the rail holds the short records and the way out to
          the full ones. Both columns read the same real data, which is what
          keeps the page balanced instead of trailing off after the table. */}
      <div className="project-columns">
        <div className="project-main">
          <section aria-label="工作包状态">
            <h2>
              工作包 <span>{packages.length}</span>
              <button type="button" onClick={() => onTab("work-packages")}>
                全部 →
              </button>
            </h2>
            {packages.length ? (
              <table className="project-packages">
                <thead>
                  <tr>
                    <th scope="col">名称</th>
                    <th scope="col">区域</th>
                    <th scope="col">专业</th>
                    <th scope="col">构件</th>
                    <th scope="col">状态</th>
                  </tr>
                </thead>
                <tbody>
                  {packages.map((wp) => {
                    const status = readiness(wp.id);
                    const area = workspace.state.areas.find(
                      (item) => item.id === wp.area_id,
                    );
                    return (
                      <tr key={wp.id}>
                        <td>
                          <button
                            type="button"
                            onClick={() => onPackage(wp.id)}
                          >
                            {demoWorkPackageName(wp.id, wp.name)}
                          </button>
                          <small>{wp.id}</small>
                        </td>
                        <td>
                          {demoAreaName(wp.area_id, area?.name ?? wp.area_id)}
                        </td>
                        <td>{demoDiscipline(wp.discipline)}</td>
                        <td className="numeric">{wp.element_ids.length}</td>
                        <td>
                          <span
                            className={`package-status is-${statusTone(status)}`}
                          >
                            <i aria-hidden="true" />
                            {statusLabel(status)}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
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
                    const isBaseline =
                      revision.id === item.accepted_revision_id;
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
        <aside className="project-side">
          <section aria-label="项目文件">
            <h2>
              项目文件 <span>{documents.length}</span>
              <button type="button" onClick={() => onTab("documents")}>
                全部 →
              </button>
            </h2>
            {documents.length ? (
              <div className="project-files">
                {documents.slice(0, 4).map((document) => (
                  <button
                    type="button"
                    key={document.id}
                    onClick={() => onTab("documents")}
                  >
                    <span>
                      <strong>{document.filename}</strong>
                    </span>
                    <time dateTime={document.created_at}>
                      {shortDate(document.created_at)}
                    </time>
                  </button>
                ))}
              </div>
            ) : (
              <p className="quiet-message">还没有项目文件。</p>
            )}
          </section>
          <section aria-label="基线记录">
            <h2>
              基线记录 <span>{baselines.length}</span>
              <button type="button" onClick={() => onTab("history")}>
                全部 →
              </button>
            </h2>
            {baselines.length ? (
              <div className="project-baselines">
                {[...baselines]
                  .sort((a, b) => b.sequence - a.sequence)
                  .slice(0, 4)
                  .map((entry) => (
                    <div key={entry.id}>
                      <span className="mono">B{entry.sequence}</span>
                      <span>{entry.accepted_by}</span>
                      <time dateTime={entry.created_at}>
                        {shortDate(entry.created_at)}
                      </time>
                    </div>
                  ))}
              </div>
            ) : (
              <p className="quiet-message">还没有确认的基线。</p>
            )}
          </section>
          <section aria-label="最近活动">
            <h2>最近活动</h2>
            {activity.length ? (
              <div className="project-activity">
                {activity.map((event) => (
                  <button
                    type="button"
                    key={event.id}
                    onClick={() => onPackage(event.work_package_id)}
                  >
                    <span>
                      <strong>{event.title}</strong>
                      <small>
                        {demoWorkPackageName(
                          event.work_package_id,
                          packages.find((wp) => wp.id === event.work_package_id)
                            ?.name ?? event.work_package_id,
                        )}
                      </small>
                    </span>
                    <time dateTime={event.observed_at}>
                      {shortDate(event.observed_at)}
                    </time>
                  </button>
                ))}
              </div>
            ) : (
              <p className="quiet-message">暂无活动记录。</p>
            )}
          </section>
          <section aria-label="项目记录">
            <h2>项目记录</h2>
            <nav aria-label="项目内容">
              {links.map((link) => (
                <button
                  type="button"
                  key={link.tab}
                  onClick={() => onTab(link.tab)}
                >
                  <strong>{link.title}</strong>
                  <small>{link.description}</small>
                </button>
              ))}
            </nav>
          </section>
        </aside>
      </div>
    </section>
  );
}
