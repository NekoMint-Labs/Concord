import type { ReactNode } from "react";
import { Box } from "lucide-react";
import { Button } from "../components/ui/button";
import { icon } from "../components/ui/icon";
import { demoProposalExplanation } from "../ui/demo/demoPresentation";
import type { InspectorView } from "./Inspector";
import type { CoordinationProjection } from "./coordinationProjection";

function checkedAt(value?: string | null) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleString("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

export function CoordinationOverview({
  projection,
  busy,
  onRecheck,
  onDetails,
  onImpact,
  onModel,
  modelContext,
}: {
  projection: CoordinationProjection;
  busy: boolean;
  onRecheck: () => void;
  onDetails: (view: InspectorView) => void;
  onImpact: () => void;
  onModel?: () => void;
  modelContext?: ReactNode;
}) {
  const {
    wp,
    state,
    analyzing,
    snapshot,
    showRecheck,
    showImpact,
    blocked,
    proposal,
    constraints,
    activeEvent,
    impactCount,
  } = projection;
  const StateIcon = state.icon;
  const openModel = () => (onModel ?? onImpact)();

  return (
    <>
      <section className={`readiness-summary is-${state.tone}`}>
        <StateIcon
          {...icon}
          className={analyzing ? "is-spinning" : undefined}
          aria-hidden="true"
        />
        <div className="readiness-copy">
          <div className="readiness-title-row">
            <h2>{state.label}</h2>
            {analyzing && <span>正在检查</span>}
          </div>
          <h3>{state.title}</h3>
          <p>{state.description}</p>
          <div className="readiness-meta">
            {snapshot && (
              <span>上次检查 {checkedAt(snapshot.captured_at)}</span>
            )}
          </div>
        </div>
        <div className="readiness-actions">
          {showRecheck && (
            <Button
              variant="secondary"
              size="sm"
              disabled={busy}
              onClick={onRecheck}
            >
              重新检查
            </Button>
          )}
          {showImpact && (
            <Button variant="ghost" size="sm" onClick={onImpact}>
              查看影响
            </Button>
          )}
        </div>
      </section>

      {blocked && !analyzing && (
        <section className="overview-decision">
          <div className="decision-copy">
            <span className="section-label">建议处理</span>
            <h3>
              {proposal
                ? demoProposalExplanation(proposal.resolution.explanation)
                : "等待协调方案"}
            </h3>
            <p>
              {proposal
                ? `R${proposal.risk} · 批准后执行并重新检查`
                : "处理方案准备后会显示在详情中。"}
            </p>
          </div>
          <div className="decision-actions">
            {constraints[0] && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => onDetails("evidence")}
              >
                {constraints[0].evidence_ids.length} 项判断依据
              </Button>
            )}
            <Button
              size="sm"
              disabled={busy || !proposal}
              onClick={() => onDetails("action")}
            >
              审查处理方案
            </Button>
          </div>
        </section>
      )}

      {modelContext ?? (
        <section className="model-context model-context-fallback">
          <header className="overview-section-header">
            <div>
              <span className="section-label">模型上下文</span>
              <h2>{wp.element_ids.length} 个关联构件</h2>
            </div>
            <Button variant="ghost" size="sm" onClick={openModel}>
              打开模型
            </Button>
          </header>
          <div className="model-stage-state">
            <Box {...icon} aria-hidden="true" />
            <div>
              <strong>模型上下文将在项目工作区中加载</strong>
              <p>打开模型可查看关联构件、属性与变化范围。</p>
            </div>
          </div>
        </section>
      )}

      {(activeEvent || impactCount > 0 || !modelContext) && (
        <section className="relevant-change-strip">
          <div>
            <span className="section-label">最近相关变化</span>
            <h3>
              {activeEvent?.title ??
                (impactCount
                  ? `${impactCount} 个关联构件进入当前影响范围`
                  : "当前没有影响本工作包的模型变化")}
            </h3>
            <p>
              {activeEvent?.change.revision
                ? `待检查版本 ${activeEvent.change.revision}`
                : impactCount
                  ? "查看变更详情，确认对工作包的影响"
                  : "有新版本时，可在模型版本中查看变化"}
            </p>
          </div>
          {(activeEvent || impactCount > 0) && (
            <Button variant="ghost" size="sm" onClick={onImpact}>
              查看变化
            </Button>
          )}
        </section>
      )}
    </>
  );
}
