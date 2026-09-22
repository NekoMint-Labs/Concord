import type { Workspace } from "../api/client";
import { Status } from "../components/Status";
import {
  demoConstraintText,
  demoDiscipline,
  demoWorkPackageName,
} from "../ui/demo/demoPresentation";

/** Project issues and the work packages they currently constrain. */
function activityLabel(value: string) {
  return (
    {
      ANALYSIS_RECHECK: "重新检查",
      PROJECT_SEEDED: "项目已初始化",
      EVENT_RECORDED: "已记录变更",
      "coordination-core": "协调引擎",
      bootstrap: "系统",
    }[value] ?? value
  );
}

export function WorkPackages({
  workspace,
  onSelect,
}: {
  workspace: Workspace;
  onSelect: (id: string) => void;
}) {
  const constraints = workspace.analysis?.constraints ?? [];
  const blocking = constraints.filter((item) => item.blocking);
  const readiness = new Map(
    (workspace.analysis?.readiness ?? []).map((item) => [
      item.work_package_id,
      item.status,
    ]),
  );

  return (
    <section className="issues-workspace">
      <header className="view-toolbar">
        <h2>问题</h2>
        <span className="viewer-toolbar-note">
          施工约束、受影响工作包与最近处理记录
        </span>
        <div className="viewer-toolbar-actions issue-summary">
          <span>
            <strong>{blocking.length}</strong> 项阻塞
          </span>
          <span>{constraints.length - blocking.length} 项提示</span>
        </div>
      </header>

      <div className="issues-body">
        <section className="issue-register" aria-label="当前问题">
          <header className="section-heading">
            <div>
              <span className="eyebrow">当前问题</span>
              <h3>需要协调的施工条件</h3>
            </div>
            <span className="count">{blocking.length}</span>
          </header>
          {blocking.length ? (
            <div className="issue-table">
              <div className="issue-table-head" aria-hidden="true">
                <span>问题</span>
                <span>工作包</span>
                <span>关联变更</span>
                <span>依据</span>
                <span>状态</span>
              </div>
              {blocking.map((constraint) => {
                const wp = workspace.state.work_packages.find(
                  (item) => item.id === constraint.work_package_id,
                );
                const linkedEvent = [...workspace.events]
                  .reverse()
                  .find(
                    (event) =>
                      event.work_package_id === constraint.work_package_id,
                  );
                return (
                  <button
                    type="button"
                    className="issue-row"
                    key={constraint.id}
                    onClick={() => onSelect(constraint.work_package_id)}
                  >
                    <span className="issue-title">
                      <strong>
                        {demoConstraintText(
                          constraint.kind,
                          constraint.description,
                        )}
                      </strong>
                      <small>{constraint.kind}</small>
                    </span>
                    <span>
                      <strong>
                        {wp
                          ? demoWorkPackageName(wp.id, wp.name)
                          : constraint.work_package_id}
                      </strong>
                      <small>
                        {constraint.work_package_id}
                        {wp ? ` · ${demoDiscipline(wp.discipline)}` : ""}
                      </small>
                    </span>
                    <span className="issue-linked-change">
                      {linkedEvent?.title ?? "—"}
                    </span>
                    <span>{constraint.evidence_ids.length} 项</span>
                    <Status value="BLOCKED" />
                  </button>
                );
              })}
            </div>
          ) : (
            <div className="impact-empty">
              <strong>当前没有阻塞问题</strong>
              <span>记录变更或重新检查后，新约束会显示在这里。</span>
            </div>
          )}
        </section>

        <aside className="package-register" aria-label="工作包状态">
          <header className="section-heading">
            <div>
              <span className="eyebrow">工作包</span>
              <h3>就绪状态</h3>
            </div>
            <span className="count">
              {workspace.state.work_packages.length}
            </span>
          </header>
          <div className="package-status-list">
            {workspace.state.work_packages.map((wp) => (
              <button type="button" key={wp.id} onClick={() => onSelect(wp.id)}>
                <span>
                  <strong>{demoWorkPackageName(wp.id, wp.name)}</strong>
                  <small>
                    {wp.id} · {demoDiscipline(wp.discipline)}
                  </small>
                </span>
                <Status
                  value={
                    workspace.stale
                      ? "STALE"
                      : (readiness.get(wp.id) ?? "UNCHECKED")
                  }
                />
              </button>
            ))}
          </div>
        </aside>

        <section className="issue-activity" aria-label="最近处理记录">
          <header className="section-heading">
            <div>
              <span className="eyebrow">活动</span>
              <h3>最近处理记录</h3>
            </div>
          </header>
          <div className="audit-list">
            {workspace.audit.slice(0, 8).map((row) => (
              <div key={row.id}>
                <time className="mono">
                  {new Date(row.created_at ?? "").toLocaleTimeString([], {
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </time>
                <strong>{activityLabel(row.action)}</strong>
                <span>{activityLabel(row.actor)}</span>
                {row.operation_id && (
                  <code>{row.operation_id.slice(0, 8)}</code>
                )}
              </div>
            ))}
          </div>
        </section>
      </div>
    </section>
  );
}
