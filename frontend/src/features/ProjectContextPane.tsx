import type { Workspace } from "../api/client";
import type { ProjectContext } from "../app/useProjectContext";
import type { WorkspaceTab } from "../app/destinations";
import { demoWorkPackageName } from "../ui/demo/demoPresentation";
import { shortDate } from "../ui/labels";
import { AppDisclosure } from "../components/ui/AppDisclosure";

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
  onDocument,
}: {
  workspace: Workspace;
  context: ProjectContext;
  onTab: (tab: WorkspaceTab) => void;
  onPackage: (id: string) => void;
  onDocument?: (id: string) => void;
  onSource?: (id: string, revisionId?: string) => void;
  onModel?: (sourceId: string, revisionId: string) => void;
}) {
  const { baselines, documents, models } = context;
  const packages = workspace.state.work_packages;
  const activity = [...workspace.events]
    .sort((a, b) => b.observed_at.localeCompare(a.observed_at))
    .slice(0, 4);

  if (!(
    packages.length ||
    models.length ||
    documents.length ||
    baselines.length ||
    activity.length
  ))
    return null;

  return (
    <aside className="project-side" aria-label="项目上下文">
      <section aria-label="项目记录">
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
      {!!(documents.length || baselines.length || activity.length) && (
        <AppDisclosure label="项目记录详情" className="project-support">
          {!!documents.length && (
            <section aria-label="项目文件">
              <h2>
                项目文件 <span>{documents.length}</span>
                <button type="button" onClick={() => onTab("documents")}>
                  全部 →
                </button>
              </h2>
              <div className="project-files">
                {documents.slice(0, 4).map((document) => (
                  <button
                    type="button"
                    key={document.id}
                    onClick={() =>
                      onDocument ? onDocument(document.id) : onTab("documents")
                    }
                  >
                    <span>
                      <strong title={document.filename}>
                        {document.filename}
                      </strong>
                    </span>
                    <time dateTime={document.created_at}>
                      {shortDate(document.created_at)}
                    </time>
                  </button>
                ))}
              </div>
            </section>
          )}
          {!!baselines.length && (
            <section aria-label="基线记录">
              <h2>
                基线记录 <span>{baselines.length}</span>
                <button type="button" onClick={() => onTab("history")}>
                  全部 →
                </button>
              </h2>
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
            </section>
          )}
          {!!activity.length && (
            <section aria-label="最近活动">
              <h2>最近活动</h2>
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
            </section>
          )}
        </AppDisclosure>
      )}
    </aside>
  );
}
