import type {
  ActionProposal,
  AgentRun,
  InvestigationReport,
} from "../api/client";
import { Button } from "../components/ui/button";
import { DetailInspectorHeader } from "../components/DetailInspector";
import { PropertyRow, PropertyTable } from "../components/PropertyTable";
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
  proposal,
  onReview,
}: {
  report?: InvestigationReport | null;
  proposal?: ActionProposal;
  onReview?: () => void;
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
        eyebrow="工程判断"
        title="影响与依据"
        meta={run ? <Status value={run.status} /> : undefined}
        onClose={onClose}
      />

      <div className="investigation-body">
        {report ? (
          <>
            <section className="investigation-answer">
              <span className="fact-label">影响</span>
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
                  value={
                    workPackages.length ? `${workPackages.length} 个` : "—"
                  }
                />
                <PropertyRow
                  label="BIM 构件"
                  value={elements.length ? `${elements.length} 个` : "—"}
                />
                <PropertyRow
                  label="判断依据"
                  value={`${report.evidence.length} 条`}
                />
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
            {proposal && (
              <section className="investigation-proposal">
                <span className="fact-label">建议处理</span>
                <h4>{proposal.title}</h4>
                <p>{proposal.resolution.explanation}</p>
                <small>
                  {proposal.evidence_ids.length} 条依据 · 审批前不会执行
                </small>
                {onReview && (
                  <Button size="sm" onClick={onReview}>
                    审查处理方案 →
                  </Button>
                )}
              </section>
            )}
            <details className="investigation-process">
              <summary>过程 · {report.tools.length} 步</summary>
              <ol className="investigation-trace">
                {report.tools.map((tool, index) => (
                  <li key={`${tool.tool}:${index}`}>
                    <strong>{domainLabel("runTrace", tool.tool)}</strong>
                    <small>
                      {tool.available ? "已完成" : "不可用"} ·{" "}
                      {tool.evidence_ids.length} 条依据
                    </small>
                  </li>
                ))}
              </ol>
              <small>
                运行 {shortId(report.run_id)} · 分析{" "}
                {shortId(report.analysis_id)} · 代次 {report.generation}
              </small>
            </details>
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
