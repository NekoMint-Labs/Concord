import { useEffect, useState } from "react";
import { motion } from "motion/react";
import { api, type Workspace } from "../api/client";
import { DetailInspectorHeader } from "../components/DetailInspector";
import { PropertyRow, PropertyTable } from "../components/PropertyTable";
import { Button } from "../components/ui/button";
import { AppDisclosure } from "../components/ui/AppDisclosure";
import { useMotion } from "../motion";
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
  const { transition, variants } = useMotion();

  return (
    /*
     * Entry only. The pane's width belongs to the resizable group, so an exit
     * animation would have to hold a dismissed pane in the layout - and in the
     * tab order - for as long as it ran. Arrival is what needs to be legible;
     * removal is instant.
     */
    <motion.aside
      className="inspector"
      aria-label="判断依据与处理详情"
      variants={variants.paneEnter}
      initial="hidden"
      animate="visible"
      transition={transition()}
    >
      {/*
        The pane's own header: the object it is reporting on, the switch between
        its three details, and the close control. It names the object by
        reference rather than by title, because the workspace already states the
        work package and a detail pane that repeats it is chrome spent on
        nothing. Chrome band above a recessed surface is what makes this read as
        a pane instead of as another grey column with a line beside it.
      */}
      <DetailInspectorHeader
        eyebrow="工作包"
        title={wp.id}
        tabs={views.map((item) => ({
          ...item,
          count:
            item.id === "blocker"
              ? constraints.length
              : item.id === "evidence"
                ? evidence.length
                : undefined,
        }))}
        activeTab={view}
        onTab={onView}
        onClose={onClose}
      />

      {/* the pane's own scroll, so the header stays put while detail moves */}
      <div className="inspector-body">
        {/*
          One keyed section rather than three. Switching view mounts new content,
          so the identity change is what animates; the pane itself stays put.
        */}
        <motion.section
          key={view}
          className="inspector-section"
          variants={variants.detailSwap}
          initial="hidden"
          animate="visible"
          transition={transition("fast")}
        >
          {view === "blocker" && (
            <>
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
              <AppDisclosure
                className="supplementary-details"
                label="工作包属性"
              >
                <PropertyTable>
                  <PropertyRow label="区域" value={wp.area_id} />
                  <PropertyRow
                    label="负责人"
                    value={demoOwner(wp.id, wp.owner)}
                  />
                  <PropertyRow
                    label="修订"
                    value={`${wp.accepted_revision} / ${wp.design_revision}`}
                  />
                  <PropertyRow
                    label="班组"
                    value={`${wp.available_workers} / ${wp.required_workers}`}
                  />
                </PropertyTable>
              </AppDisclosure>
            </>
          )}

          {view === "evidence" && (
            <>
              {evidence.length === 0 ? (
                <p className="quiet-message">
                  当前阻塞原因没有可展示的支撑依据。
                </p>
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
            </>
          )}

          {view === "action" && (
            <>
              {proposal ? (
                <>
                  <div className="action-title">
                    <strong>
                      {demoProposalTitle(
                        proposal.work_package_id,
                        proposal.title,
                      )}
                    </strong>
                    <span className="risk">R{proposal.risk}</span>
                  </div>
                  <p>
                    {demoProposalExplanation(proposal.resolution.explanation)}
                  </p>
                  <div className="effect-list">
                    {proposal.resolution.effects.map((effect, index) => (
                      <div key={index}>{demoEffectKind(effect.kind)}</div>
                    ))}
                  </div>
                  {/*
                    The gate is one soft object because it is the only thing on
                    this pane that asks for a decision: what has to be true, the
                    confirmation it may need, and the two actions. A chrome-plane
                    block on the recessed pane plane is a visible step without
                    becoming a card - it is cut into the surface the pane already
                    is, rather than lifted above it.
                  */}
                  <div className="action-gate">
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
                          onChange={(event) =>
                            setConfirmation(event.target.value)
                          }
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
                        disabled={
                          busy || inactive || workspace.stale || !approved
                        }
                        onClick={() =>
                          void perform(() => api.execute(proposal.id!))
                        }
                      >
                        执行并重新检查
                      </Button>
                    </div>
                  </div>
                </>
              ) : (
                <p className="quiet-message">
                  出现需要协调的证据性约束后，建议处理将在此显示。
                </p>
              )}
            </>
          )}
        </motion.section>
      </div>
    </motion.aside>
  );
}
