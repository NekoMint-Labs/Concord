import type { ReactNode } from "react";
import { motion } from "motion/react";
import type { Workspace } from "../api/client";
import { Button } from "../components/ui/button";
import { AppDisclosure } from "../components/ui/AppDisclosure";
import { statusLabel } from "../components/Status";
import {
  activeCoordinationEvent,
  activeCoordinationRun,
} from "../app/coordination";
import { useMotion } from "../motion";
import type { InspectorView } from "./Inspector";
import {
  demoAreaName,
  demoConstraintText,
  demoDiscipline,
  demoOwner,
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

/** One labelled engineering value. Labels scan; values read. */
function Fact({
  label,
  value,
  attention = false,
}: {
  label: string;
  value: ReactNode;
  attention?: boolean;
}) {
  return (
    <div className="fact">
      <span className="fact-label">{label}</span>
      <span className={attention ? "fact-value is-attention" : "fact-value"}>
        {value}
      </span>
    </div>
  );
}

/**
 * One work item, composed as a readout rather than as a paragraph.
 *
 * The shape is the same in both states, so a change of state does not move the
 * page under the reader: identity, one state object that states the conclusion,
 * the few facts the decision needs, and - one action away - the rest of the
 * conditions already present in the workspace response.
 *
 * READY stays quiet. It states the conclusion, when it was reached, and what it
 * rests on; it does not become a readiness dashboard, because a page that
 * reports everything reports nothing. BLOCKED carries more, because a blocked
 * package is the one state that asks the user to act: the change, its reach, the
 * blocking fact, the evidence behind it, and the recommendation.
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

  /*
   * The facts a decision actually needs, drawn from the work package the
   * response already carries. These are the four values a site engineer asks
   * for after "can we start": who owns it, whether the crew is there, whether
   * acceptance has passed, and how much geometry is involved. Everything else
   * stays behind the disclosure rather than being printed at equal weight.
   */
  const qualifications = wp.required_qualifications ?? [];
  const held = wp.qualifications ?? [];
  const missing = qualifications.filter((item) => !held.includes(item));
  const available = (map?: Record<string, boolean>) =>
    Object.values(map ?? {}).filter(Boolean).length;
  const defined = (map?: Record<string, boolean>) =>
    Object.keys(map ?? {}).length;
  const snapshotVersion = workspace.analysis?.snapshot.version;
  const sourceCount = workspace.state.sources.length;
  // What the judgement rests on. Stated in the state object itself, because
  // "based on what?" is the first question a recorded conclusion has to answer -
  // and it is the one piece of context READY is allowed to spend a line on.
  const provenance =
    snapshotVersion === undefined
      ? `${sourceCount} 份来源`
      : `快照 v${snapshotVersion} · ${sourceCount} 份来源`;

  const conditions = [
    <Fact
      key="revision"
      label="修订"
      value={`${wp.accepted_revision} / ${wp.design_revision}`}
    />,
    <Fact
      key="discipline"
      label="专业"
      value={demoDiscipline(wp.discipline)}
    />,
    <Fact
      key="predecessors"
      label="前置工作包"
      value={wp.predecessors?.length ? wp.predecessors.join("、") : "无"}
    />,
    <Fact
      key="qualifications"
      label="资质"
      value={missing.length ? `缺少 ${missing.join("、")}` : "齐备"}
      attention={missing.length > 0}
    />,
    <Fact
      key="materials"
      label="材料"
      value={`${available(wp.materials)} / ${defined(wp.materials)} 可用`}
    />,
    <Fact
      key="equipment"
      label="设备"
      value={`${available(wp.equipment)} / ${defined(wp.equipment)} 可用`}
    />,
    <Fact
      key="complete"
      label="工作包"
      value={wp.complete ? "已完成" : "进行中"}
    />,
  ];

  const facts = (
    <div className="fact-list">
      <Fact label="负责人" value={demoOwner(wp.id, wp.owner)} />
      <Fact
        label="班组"
        value={`${wp.available_workers} / ${wp.required_workers} 人`}
        attention={wp.available_workers < wp.required_workers}
      />
      <Fact
        label="验收"
        value={wp.inspection_passed ? "已通过" : "未通过"}
        attention={!wp.inspection_passed}
      />
      <Fact label="构件" value={`${wp.element_ids.length} 个`} />
    </div>
  );

  const { transition, variants } = useMotion();

  return (
    <section className="coordination-workspace" aria-label="协调工作区">
      <header className="coordination-head">
        <div className="coordination-identity">
          <h2>{name}</h2>
          <p>
            {wp.id} · {demoAreaName(wp.area_id, area?.name ?? wp.area_id)}
          </p>
        </div>
        <div className="coordination-state-tag">
          {/*
           * The re-check lives in the state object (READY) or is absent because the
           * body owns the action (BLOCKED, through the recommendation). The header
           * carries one only when the body has none - a stale blocked package, where
           * the recorded judgement is not actionable until it is refreshed. Two
           * controls with the same name on one page is not a quiet READY.
           */}
          {stale && blocked && (
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

      {/*
        The body is keyed by the record *and* by the state it is reporting, so a
        re-check that changes the conclusion is something the reader watches
        arrive rather than something they discover already finished. This is the
        one motion in the coordination surface, and it is attached to the
        product's central loop rather than to a control.
      */}
      <motion.div
        key={`${wp.id}:${blocked ? "blocked" : analyzing ? "activity" : "ready"}`}
        className={
          analyzing ? "coordination-body is-activity" : "coordination-body"
        }
        variants={variants.recordEnter}
        initial="hidden"
        animate="visible"
        transition={transition()}
      >
        {analyzing ? (
          <>
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
          </>
        ) : blocked ? (
          <>
            {stale && (
              <p className="stale-note">判断基于过期快照，重新检查后再处理。</p>
            )}
            <div className="coordination-record is-blocked">
              <div className="state-block">
                {revision ? (
                  <p className="revision-line">
                    {wp.accepted_revision} → <strong>{revision}</strong>
                  </p>
                ) : (
                  activeEvent && (
                    <p className="revision-line">{activeEvent.title}</p>
                  )
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

                <p className="state-meta">{provenance}</p>
              </div>
              {facts}

              {/*
                The recommendation is the record's own closing paragraph rather
                than a second card: it answers the blocker directly above it, so
                it sits inside the same well, in the same text column, with no
                surface of its own. It is also its own object in one respect -
                it is the only part of the page that asks for a decision.
              */}
              <div className="recommendation">
                <span className="fact-label">建议</span>
                <p>
                  {proposal
                    ? demoProposalExplanation(proposal.resolution.explanation)
                    : "处理方案准备后将在此显示。"}
                </p>
                {proposal && (
                  <p className="approval-line">
                    需批准后执行 · R{proposal.risk}
                  </p>
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

            <AppDisclosure label="其他施工条件">
              <div className="fact-list">{conditions}</div>
            </AppDisclosure>
          </>
        ) : (
          <>
            {stale && (
              <p className="stale-note">判断基于过期快照，重新检查后再处理。</p>
            )}
            <div className="coordination-record">
              <div className="state-block">
                <p className="ready-line">当前没有阻塞施工的条件</p>
                {checked && <p className="state-meta">上次检查：{checked}</p>}
                <p className="state-meta">{provenance}</p>
              </div>
              {facts}
              {/*
                READY closes with its own action on the same line the blocked
                record does, so the two states are one composition rather than two
                layouts that happen to share a page.
              */}
              <div className="coordination-actions">
                <Button variant="secondary" disabled={busy} onClick={onRecheck}>
                  重新检查
                </Button>
              </div>
            </div>
            <AppDisclosure label="其他施工条件">
              <div className="fact-list">{conditions}</div>
            </AppDisclosure>
          </>
        )}
      </motion.div>
    </section>
  );
}
