import type { Workspace } from "../api/client";
import { Button } from "../components/ui/button";
import { statusLabel } from "../components/Status";
import {
  activeCoordinationEvent,
  activeCoordinationRun,
} from "../app/coordination";
import type { InspectorView } from "./Inspector";
import {
  demoAreaName,
  demoConstraintText,
  demoProposalExplanation,
  demoWorkPackageName,
} from "../ui/demo/demoPresentation";

function checkedAt(value?: string | null) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  // Locale-independent engineering timestamp rather than a locale date format.
  const pad = (part: number) => String(part).padStart(2, "0");
  return (
    `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}` +
    ` ${pad(date.getHours())}:${pad(date.getMinutes())}`
  );
}

/**
 * One work item, stated as facts rather than as a narrated sequence. The
 * workspace owns the story; the inspector owns the selected detail.
 */
export function CoordinationWorkspace({
  workspace,
  selected,
  busy,
  onRecheck,
  onDetails,
  onImpact,
}: {
  workspace: Workspace;
  selected: string;
  busy: boolean;
  onRecheck: () => void;
  onDetails: (view: InspectorView) => void;
  onImpact: () => void;
}) {
  const wp = workspace.state.work_packages.find(
    (item) => item.id === selected,
  )!;
  const readiness = workspace.analysis?.readiness.find(
    (item) => item.work_package_id === selected,
  );
  const activeRun = activeCoordinationRun(workspace);
  const activeEvent = activeCoordinationEvent(workspace, selected);
  const constraints = (workspace.analysis?.constraints ?? []).filter(
    (item) => item.work_package_id === selected && item.blocking,
  );
  const blocker = constraints[0];
  const proposal = workspace.proposals.find(
    (item) => item.work_package_id === selected,
  );
  const analyzing =
    !!activeEvent &&
    !!activeRun &&
    ["QUEUED", "RUNNING"].includes(activeRun.status);
  // An active run belongs to the work package its event names; another package
  // must not inherit its analysis or approval state.
  const blocked =
    readiness?.status === "BLOCKED" ||
    (!!activeEvent && activeRun?.status === "WAITING_APPROVAL");
  const stale = workspace.stale && !analyzing;
  const revision = activeEvent?.change.revision;
  const area = workspace.state.areas.find((item) => item.id === wp.area_id);
  const name = demoWorkPackageName(wp.id, wp.name);
  const impactCount = workspace.analysis?.impact.element_ids.length ?? 0;
  const checked = checkedAt(workspace.analysis?.snapshot.captured_at);

  const stateText = blocked
    ? statusLabel("BLOCKED")
    : stale
      ? statusLabel("STALE")
      : statusLabel(readiness?.status ?? "UNCHECKED");
  // An in-flight re-check has produced no new judgement yet, so the recorded
  // one is labelled as the previous state instead of being read as the
  // current authoritative state.
  const stateDisplay = analyzing ? `上次状态：${stateText}` : stateText;

  return (
    <section className="coordination-workspace" aria-label="协调工作区">
      <header className="coordination-head">
        <div>
          <h2>{name}</h2>
          <p>
            {wp.id} · {demoAreaName(wp.area_id, area?.name ?? wp.area_id)}
          </p>
        </div>
        <div className="coordination-state-tag">
          {stale && (
            <Button
              variant="ghost"
              size="sm"
              disabled={busy}
              onClick={onRecheck}
            >
              重新检查
            </Button>
          )}
          <span className={`state-text ${blocked ? "is-blocked" : ""}`}>
            {stateDisplay}
          </span>
        </div>
      </header>

      {analyzing ? (
        <div className="coordination-body is-activity">
          <p className="activity-line">
            {activeRun?.status === "QUEUED" ? "准备重新检查" : "正在重新检查"}
          </p>
          <p>
            {revision
              ? `根据 ${revision} 重新评估施工条件。`
              : "汇集最新项目事实并核对施工条件。"}
          </p>
          {blocked && (
            <p className="activity-note">上次判断为阻塞，分析完成后更新。</p>
          )}
          <button className="text-button" onClick={onImpact}>
            查看影响
          </button>
        </div>
      ) : blocked ? (
        <div className="coordination-body">
          {stale && (
            <p className="stale-note">判断基于过期快照，重新检查后再处理。</p>
          )}
          {revision ? (
            <p className="revision-line">
              {wp.accepted_revision} → <strong>{revision}</strong>
            </p>
          ) : (
            activeEvent && <p className="revision-line">{activeEvent.title}</p>
          )}

          <p className="scope-line">
            {impactCount > 0 && <span>{impactCount} 个构件需要协调</span>}
            <button className="text-button" onClick={onImpact}>
              查看影响
            </button>
          </p>

          <p className="blocking-fact">
            {blocker
              ? demoConstraintText(blocker.kind, blocker.description)
              : "存在尚未解决的施工约束。"}
          </p>

          {blocker && (
            <p className="scope-line">
              <span>{blocker.evidence_ids.length} 项判断依据</span>
              <button
                className="text-button"
                onClick={() => onDetails("evidence")}
              >
                查看依据
              </button>
            </p>
          )}

          <div className="recommendation">
            <p>
              建议：
              {proposal
                ? demoProposalExplanation(proposal.resolution.explanation)
                : "处理方案准备后将在此显示。"}
            </p>
            {proposal && (
              <p className="approval-line">需批准后执行 · R{proposal.risk}</p>
            )}
            <div className="coordination-actions">
              <Button
                disabled={busy || !proposal}
                onClick={() => onDetails("action")}
              >
                批准并继续
              </Button>
            </div>
          </div>
        </div>
      ) : (
        <div className="coordination-body is-ready">
          <p className="ready-line">当前没有阻塞施工的条件</p>
          {checked && <p className="ready-meta">上次检查：{checked}</p>}
          <div className="coordination-actions">
            <Button variant="secondary" disabled={busy} onClick={onRecheck}>
              重新检查
            </Button>
          </div>
        </div>
      )}
    </section>
  );
}
