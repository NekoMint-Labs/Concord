import { X } from "lucide-react";
import type { AgentRun, InvestigationReport } from "../api/client";
import { Status } from "../components/Status";
import { AppTooltip } from "../components/ui/AppTooltip";
import { icon } from "../components/ui/icon";
import type { InspectorView } from "./Inspector";
import type { ConcordContext } from "./ConcordAgent";

export type WorkspaceInspectorView = InspectorView | "investigation";

const shortId = (value?: string | null) => (value ? value.slice(0, 8) : "—");

export function InvestigationInspector({
  report,
  run,
  context,
  onClose,
}: {
  report?: InvestigationReport | null;
  run?: AgentRun | null;
  context: ConcordContext;
  onClose: () => void;
}) {
  const scope = report?.scope;
  const source =
    scope?.source_id && scope.source_id === context.sourceId
      ? context.sourceName
      : scope?.source_id;
  const fromRevision =
    scope?.from_revision_id === context.fromRevisionId
      ? (context.fromRevisionLabel ?? shortId(scope?.from_revision_id))
      : shortId(scope?.from_revision_id);
  const toRevision =
    scope?.to_revision_id === context.revisionId
      ? (context.revisionLabel ?? shortId(scope?.to_revision_id))
      : shortId(scope?.to_revision_id);
  const workPackages = scope?.work_package_ids ?? [];
  const elements = scope?.element_ids ?? [];

  return (
    <aside className="investigation-inspector" aria-label="Concord 调查详情">
      <header className="pane-header investigation-header">
        <div>
          <span className="eyebrow">Concord</span>
          <h3>调查详情</h3>
        </div>
        <AppTooltip label="关闭详情" side="left">
          <button
            type="button"
            className="icon-button"
            aria-label="关闭详情"
            onClick={onClose}
          >
            <X {...icon} />
          </button>
        </AppTooltip>
      </header>

      <div className="investigation-body">
        {report ? (
          <>
            <section className="investigation-answer">
              <span className="fact-label">调查结论</span>
              <p>{report.answer.summary}</p>
              {report.answer.limitations.map((item) => (
                <small key={item}>{item}</small>
              ))}
            </section>

            <section aria-labelledby="investigation-properties">
              <h4 id="investigation-properties">上下文</h4>
              <dl className="investigation-properties">
                <dt>状态</dt>
                <dd>
                  {run ? (
                    <Status value={run.status} />
                  ) : report.persisted ? (
                    "已持久化"
                  ) : (
                    "只读"
                  )}
                </dd>
                <dt>来源</dt>
                <dd>{source || "当前项目"}</dd>
                {(scope?.from_revision_id || scope?.to_revision_id) && (
                  <>
                    <dt>版本</dt>
                    <dd className="mono">
                      {scope.from_revision_id
                        ? `${fromRevision} → ${toRevision}`
                        : toRevision}
                    </dd>
                  </>
                )}
                <dt>工作包</dt>
                <dd>{workPackages.length ? workPackages.join("、") : "—"}</dd>
                <dt>BIM 构件</dt>
                <dd>{elements.length ? `${elements.length} 个` : "—"}</dd>
                <dt>Evidence</dt>
                <dd>{report.evidence.length} 条</dd>
                <dt>运行</dt>
                <dd className="mono">{shortId(report.run_id)}</dd>
                <dt>分析</dt>
                <dd className="mono">{shortId(report.analysis_id)}</dd>
                <dt>代次</dt>
                <dd>{report.generation}</dd>
                {run && (
                  <>
                    <dt>更新时间</dt>
                    <dd>
                      <time dateTime={run.updated_at}>
                        {new Date(run.updated_at).toLocaleString()}
                      </time>
                    </dd>
                  </>
                )}
              </dl>
            </section>

            <section aria-labelledby="investigation-trace">
              <div className="investigation-section-heading">
                <h4 id="investigation-trace">调查步骤</h4>
                <span className="count">{report.tools.length}</span>
              </div>
              {report.tools.length ? (
                <ol className="investigation-trace">
                  {report.tools.map((tool, index) => (
                    <li key={`${tool.tool}:${index}`}>
                      <span className="investigation-step" aria-hidden="true" />
                      <div>
                        <strong>{tool.tool}</strong>
                        <small>
                          {tool.available ? "已完成" : "不可用"} ·{" "}
                          {tool.evidence_ids.length} 条 Evidence
                        </small>
                      </div>
                    </li>
                  ))}
                </ol>
              ) : (
                <p className="quiet-message">本次调查没有工具调用记录。</p>
              )}
            </section>

            <section aria-labelledby="investigation-evidence">
              <div className="investigation-section-heading">
                <h4 id="investigation-evidence">Evidence</h4>
                <span className="count">{report.evidence.length}</span>
              </div>
              {report.evidence.length ? (
                <ol className="investigation-evidence">
                  {report.evidence.map((evidence, index) => (
                    <li key={evidence.id}>
                      <span className="evidence-index">
                        {String(index + 1).padStart(2, "0")}
                      </span>
                      <div>
                        <strong>{evidence.source_id}</strong>
                        <p>{evidence.fact}</p>
                        <small>
                          {evidence.source_revision} · {evidence.quality} ·{" "}
                          {evidence.location || "无位置"}
                        </small>
                      </div>
                    </li>
                  ))}
                </ol>
              ) : (
                <p className="quiet-message">本次调查没有持久化 Evidence。</p>
              )}
            </section>
          </>
        ) : (
          <div className="investigation-pending">
            {run && <Status value={run.status} />}
            <strong>调查正在进行</strong>
            <p>完成后将在此显示上下文、调查步骤和 Evidence。</p>
          </div>
        )}
      </div>
    </aside>
  );
}
