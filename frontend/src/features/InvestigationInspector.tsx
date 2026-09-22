import type { AgentRun, InvestigationReport } from "../api/client";
import { DetailInspectorHeader } from "../components/DetailInspector";
import {
  PropertyRow,
  PropertyTable,
} from "../components/PropertyTable";
import { Status } from "../components/Status";
import { domainLabel } from "../ui/labels";
import {
  demoEvidenceFact,
  demoInvestigationText,
  demoSourceLabel,
} from "../ui/demo/demoPresentation";
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
    <aside className="investigation-inspector" aria-label="工程调查详情">
      <DetailInspectorHeader
        eyebrow="工程调查"
        title="调查详情"
        meta={run ? <Status value={run.status} /> : undefined}
        onClose={onClose}
      />

      <div className="investigation-body">
        {report ? (
          <>
            <section className="investigation-answer">
              <span className="fact-label">调查结论</span>
              <p>{demoInvestigationText(report.answer.summary)}</p>
              {report.answer.limitations.map((item) => (
                <small key={item}>{item}</small>
              ))}
            </section>

            <section aria-labelledby="investigation-properties">
              <h4 id="investigation-properties">上下文</h4>
              <PropertyTable className="investigation-properties">
                <PropertyRow
                  label="状态"
                  value={
                    run ? (
                      <Status value={run.status} />
                    ) : report.persisted ? (
                      "已持久化"
                    ) : (
                      "只读"
                    )
                  }
                />
                <PropertyRow label="来源" value={source || "当前项目"} />
                {(scope?.from_revision_id || scope?.to_revision_id) && (
                  <PropertyRow
                    label="版本"
                    value={
                      scope.from_revision_id
                        ? `${fromRevision} → ${toRevision}`
                        : toRevision
                    }
                    mono
                  />
                )}
                <PropertyRow
                  label="工作包"
                  value={workPackages.length ? workPackages.join("、") : "—"}
                />
                <PropertyRow
                  label="BIM 构件"
                  value={elements.length ? `${elements.length} 个` : "—"}
                />
                <PropertyRow
                  label="判断依据"
                  value={`${report.evidence.length} 条`}
                />
                <PropertyRow label="运行" value={shortId(report.run_id)} mono />
                <PropertyRow
                  label="分析"
                  value={shortId(report.analysis_id)}
                  mono
                />
                <PropertyRow label="代次" value={report.generation} />
                {run && (
                  <PropertyRow
                    label="更新时间"
                    value={
                      <time dateTime={run.updated_at}>
                        {new Date(run.updated_at).toLocaleString("zh-CN")}
                      </time>
                    }
                  />
                )}
              </PropertyTable>
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
                        <strong>{domainLabel("runTrace", tool.tool)}</strong>
                        <small>
                          {tool.available ? "已完成" : "不可用"} ·{" "}
                          {tool.evidence_ids.length} 条依据
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
                <h4 id="investigation-evidence">判断依据</h4>
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
                        <strong>{demoSourceLabel(evidence.source_id)}</strong>
                        <p>
                          {demoEvidenceFact(evidence.source_id, evidence.fact)}
                        </p>
                        <small>
                          {evidence.source_revision} ·{" "}
                          {domainLabel("quality", evidence.quality)} ·{" "}
                          {evidence.location || "无位置"}
                        </small>
                      </div>
                    </li>
                  ))}
                </ol>
              ) : (
                <p className="quiet-message">本次调查没有持久化判断依据。</p>
              )}
            </section>
          </>
        ) : (
          <div className="investigation-pending">
            {run && <Status value={run.status} />}
            <strong>调查正在进行</strong>
            <p>完成后将在此显示上下文、调查步骤和判断依据。</p>
          </div>
        )}
      </div>
    </aside>
  );
}
