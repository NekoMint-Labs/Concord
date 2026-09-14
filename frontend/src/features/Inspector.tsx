import { useEffect, useState } from "react";
import { X } from "lucide-react";
import { api, type Workspace } from "../api/client";
import { Button } from "../components/ui/button";
import {
  demoConstraintKind,
  demoConstraintText,
  demoEffectKind,
  demoEvidenceFact,
  demoOwner,
  demoProposalExplanation,
  demoProposalTitle,
  demoSourceLabel,
} from "../ui/demo/demoPresentation";

/** The one thing the user opened. The inspector never narrates the whole story. */
export type InspectorView = "blocker" | "evidence" | "action";

const views: { id: InspectorView; label: string }[] = [
  { id: "blocker", label: "阻塞原因" },
  { id: "evidence", label: "判断依据" },
  { id: "action", label: "建议处理" },
];

export function Inspector({
  workspace,
  selected,
  selectedConstraint,
  view,
  perform,
  onClose,
  onView,
  busy = false,
}: {
  workspace: Workspace;
  busy?: boolean;
  selected: string;
  selectedConstraint: string;
  view: InspectorView;
  perform: (operation: () => Promise<unknown>) => Promise<void>;
  onClose: () => void;
  onView: (view: InspectorView) => void;
}) {
  const [confirmation, setConfirmation] = useState("");
  const [focusedConstraint, setFocusedConstraint] =
    useState(selectedConstraint);
  const wp = workspace.state.work_packages.find(
    (item) => item.id === selected,
  )!;
  const constraints = (workspace.analysis?.constraints ?? []).filter(
    (item) => item.work_package_id === selected && item.blocking,
  );
  const proposal = workspace.proposals.find(
    (item) => item.work_package_id === selected,
  );
  const actionRun =
    workspace.analysis_run ??
    (workspace.run?.id === proposal?.run_id ? workspace.run : null);
  const inactive =
    !!actionRun &&
    (actionRun.status !== "WAITING_APPROVAL" ||
      proposal?.generation !== actionRun.generation);
  const approved =
    !!proposal &&
    workspace.approvals.some((item) => item.proposal_id === proposal.id);
  useEffect(() => setConfirmation(""), [proposal?.id]);
  useEffect(
    () => setFocusedConstraint(selectedConstraint),
    [selectedConstraint],
  );
  const activeConstraint =
    constraints.find((item) => item.id === focusedConstraint) ?? constraints[0];
  const evidence = (workspace.analysis?.evidence ?? []).filter((item) =>
    activeConstraint?.evidence_ids.includes(item.id ?? ""),
  );

  return (
    <aside className="inspector" aria-label="判断依据与处理详情">
      <div className="panel-heading">
        <span className="mono inspector-scope">{wp.id}</span>
        <button className="icon-button" onClick={onClose} aria-label="关闭详情">
          <X size={17} />
        </button>
      </div>

      <nav className="inspector-switch" aria-label="详情类型">
        {views.map((item) => (
          <button
            key={item.id}
            className={view === item.id ? "active" : ""}
            aria-current={view === item.id ? "true" : undefined}
            onClick={() => onView(item.id)}
          >
            {item.label}
            {item.id === "blocker" && constraints.length > 0 && (
              <span className="count">{constraints.length}</span>
            )}
            {item.id === "evidence" && evidence.length > 0 && (
              <span className="count">{evidence.length}</span>
            )}
          </button>
        ))}
      </nav>

      {view === "blocker" && (
        <section className="inspector-section">
          {constraints.length === 0 ? (
            <p className="quiet-message">
              最近一次检查没有发现未解决的阻塞条件。
            </p>
          ) : (
            <ul className="constraint-list">
              {constraints.map((item) => (
                <li key={item.id}>
                  <button
                    className={
                      item.id === activeConstraint?.id ? "selected" : ""
                    }
                    onClick={() => setFocusedConstraint(item.id)}
                  >
                    <span className="eyebrow">
                      {demoConstraintKind(item.kind)}
                    </span>
                    <strong>
                      {demoConstraintText(item.kind, item.description)}
                    </strong>
                    <small>{item.evidence_ids.length} 项判断依据</small>
                  </button>
                </li>
              ))}
            </ul>
          )}
          {constraints.length > 0 && (
            <button
              className="text-button inline-more"
              onClick={() => onView("evidence")}
            >
              查看判断依据
            </button>
          )}
          <details className="supplementary-details">
            <summary>工作包属性</summary>
            <dl className="properties">
              <dt>区域</dt>
              <dd>{wp.area_id}</dd>
              <dt>负责人</dt>
              <dd>{demoOwner(wp.id, wp.owner)}</dd>
              <dt>版本</dt>
              <dd>
                {wp.accepted_revision} / {wp.design_revision}
              </dd>
              <dt>班组</dt>
              <dd>
                {wp.available_workers} / {wp.required_workers}
              </dd>
            </dl>
          </details>
        </section>
      )}

      {view === "evidence" && (
        <section className="inspector-section">
          {evidence.length === 0 ? (
            <p className="quiet-message">当前阻塞原因没有可展示的支撑依据。</p>
          ) : (
            <ol className="evidence-list">
              {evidence.map((item, index) => (
                <li key={item.id}>
                  <div className="evidence-index">
                    {String(index + 1).padStart(2, "0")}
                  </div>
                  <div className="evidence-body">
                    <strong>{demoSourceLabel(item.source_id)}</strong>
                    <p>{demoEvidenceFact(item.source_id, item.fact)}</p>
                    <div className="evidence-meta">
                      来源 {item.provider} · {item.source_id} ·{" "}
                      {item.source_revision} · {item.location}
                    </div>
                  </div>
                </li>
              ))}
            </ol>
          )}
        </section>
      )}

      {view === "action" && (
        <section className="inspector-section">
          {proposal ? (
            <>
              <div className="action-title">
                <strong>
                  {demoProposalTitle(proposal.work_package_id, proposal.title)}
                </strong>
                <span className="risk">R{proposal.risk}</span>
              </div>
              <p>{demoProposalExplanation(proposal.resolution.explanation)}</p>
              <div className="effect-list">
                {proposal.resolution.effects.map((effect, index) => (
                  <div key={index}>{demoEffectKind(effect.kind)}</div>
                ))}
              </div>
              <p className="approval-required">
                执行前需要批准
                {proposal.risk >= 4 ? "；R4 需要强确认。" : "。"}
              </p>
              {proposal.risk >= 4 && !approved && (
                <label className="form-label">
                  强确认：输入 APPROVE R4
                  <input
                    aria-label="R4 confirmation"
                    value={confirmation}
                    onChange={(event) => setConfirmation(event.target.value)}
                    placeholder="APPROVE R4"
                  />
                </label>
              )}
              <div className="action-buttons">
                <Button
                  disabled={
                    busy ||
                    inactive ||
                    workspace.stale ||
                    approved ||
                    (proposal.risk >= 4 && confirmation !== "APPROVE R4")
                  }
                  variant="secondary"
                  onClick={() =>
                    void perform(() =>
                      api.approve(
                        proposal.id!,
                        proposal.risk >= 4,
                        confirmation,
                      ),
                    )
                  }
                >
                  {approved ? "已批准" : `批准 R${proposal.risk}`}
                </Button>
                <Button
                  disabled={busy || inactive || workspace.stale || !approved}
                  onClick={() => void perform(() => api.execute(proposal.id!))}
                >
                  执行并重新检查
                </Button>
              </div>
            </>
          ) : (
            <p className="quiet-message">
              出现需要协调的证据性约束后，建议处理将在此显示。
            </p>
          )}
        </section>
      )}
    </aside>
  );
}
