import type { Workspace } from "../api/client";
import type { ProjectContext } from "../app/useProjectContext";
import type { WorkspaceTab } from "../app/destinations";
import { demoWorkPackageName } from "../ui/demo/demoPresentation";
import { shortDate } from "../ui/labels";

// Package lanes and model records have their own actions; these links open the
// full project records.
const links: { tab: WorkspaceTab; title: string; description: string }[] = [
  { tab: "documents", title: "文档", description: "项目文件与解析内容" },
  { tab: "history", title: "历史", description: "模型基线与版本记录" },
];

/** Standing project records, independent of the selected package's detail inspector. */
export function ProjectContextPane({
  workspace,
  context,
  onTab,
  onPackage,
}: {
  workspace: Workspace;
  context: ProjectContext;
  onTab: (tab: WorkspaceTab) => void;
  onPackage: (id: string) => void;
}) {
  const { baselines, documents, models, revisionNo } = context;
  const packages = workspace.state.work_packages;
  const activity = [...workspace.events]
    .sort((a, b) => b.observed_at.localeCompare(a.observed_at))
    .slice(0, 4);

  return (
    <aside className="project-side" aria-label="项目上下文">
      <section className="state-models" aria-label="模型与版本">
        <div className="state-models-head">
          <h2>模型与版本</h2>
          <button type="button" onClick={() => onTab("sources")}>
            {models.length ? "管理 →" : "添加模型 →"}
          </button>
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
      </section>
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
                  <strong title={document.filename}>{document.filename}</strong>
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
                  <span title={entry.accepted_by}>{entry.accepted_by}</span>
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
                  <strong title={event.title}>{event.title}</strong>
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
  );
}
