/* The inline human-decision strip for the docked Finding receipt.
 *
 * It is the same server-validated `session.decide` contract the old white modal
 * used, rendered in place inside the receipt: a compact, non-modal region, not a
 * page overlay. Opening it never moves the list selection or the evidence stage.
 */
import { useEffect, useRef, useState } from "react";
import type { DTO } from "../api/client";
import {
  WorkspaceInlineState,
  engineeringErrorMessage,
} from "../components/WorkspaceInlineState";
import { Button } from "../components/ui/button";
import { shortDate } from "../ui/labels";
import { recheckFreshness } from "./FindingFollowUp";
import type { useEngineeringFinding } from "./useEngineeringFindings";

/** Decision kinds keyed to the exact label the decision button carries. */
export const decisionActionLabels = {
  CONFIRMED: "确认",
  DISMISSED: "忽略",
  EDITED: "编辑",
  CLOSED: "关闭",
  REOPENED: "重新打开",
} as const;

export type FindingDecisionKind = keyof typeof decisionActionLabels;

/** Focus the region itself on open so keyboard users land inside it. */
function useSurfaceFocus<T extends HTMLElement>() {
  const surface = useRef<T>(null);
  useEffect(() => {
    surface.current?.focus();
  }, []);
  return surface;
}

/**
 * Inline confirm strip: the note field, the per-decision fields and the submit
 * controls live in the receipt. `session.busy` / `session.error` render here too.
 */
export function FindingDecisionInline({
  decision,
  finding,
  session,
  sources,
  onClose,
}: {
  decision: FindingDecisionKind;
  finding: DTO<"Finding">;
  session: ReturnType<typeof useEngineeringFinding>;
  sources?: DTO<"ProjectSourceStatus">[];
  onClose: () => void;
}) {
  const [reason, setReason] = useState("");
  const [closureCheckId, setClosureCheckId] = useState("");
  const [draft, setDraft] = useState({
    title: finding.title,
    suggested_action: finding.suggested_action ?? "",
  });
  const surface = useSurfaceFocus<HTMLFormElement>();
  const label = decisionActionLabels[decision];
  const submit = async () => {
    if (session.busy) return;
    const result = await session.decide({
      decision,
      note: reason.trim(),
      ...(decision === "CLOSED" && closureCheckId
        ? { recheck_id: closureCheckId }
        : {}),
      ...(decision === "EDITED"
        ? {
            title: draft.title.trim(),
            suggested_action: draft.suggested_action.trim(),
          }
        : {}),
    });
    if (result) onClose();
  };
  return (
    <form
      ref={surface}
      tabIndex={-1}
      className="finding-decision-inline"
      role="dialog"
      aria-label={`${label} Finding`}
      onSubmit={(event) => {
        event.preventDefault();
        void submit();
      }}
      onKeyDown={(event) => {
        // Escape collapses only this strip; the docked panel and the list
        // selection stay exactly where they are.
        if (event.key === "Escape" && !session.busy) {
          event.preventDefault();
          event.stopPropagation();
          onClose();
        }
      }}
    >
      <p className="finding-decision-inline-title">
        {label} · {finding.title}
      </p>
      {decision === "CLOSED" && (
        <label className="finding-decision-field">
          <span className="t-label">关闭依据 ReCheck</span>
          <select
            aria-label="关闭依据 ReCheck"
            value={closureCheckId}
            onChange={(event) => setClosureCheckId(event.target.value)}
          >
            <option value="">
              选择条件已验证满足的工程依据（未选将由服务器拒绝）
            </option>
            {session.rechecks.data
              ?.filter(
                (check) =>
                  check.outcome === "RESOLVED" && check.evidence_ids.length > 0,
              )
              .map((check) => (
                <option key={check.id} value={check.id}>
                  条件已验证满足 ·{" "}
                  {shortDate(check.completed_at ?? check.created_at)} ·{" "}
                  {recheckFreshness(check, finding, sources)}
                </option>
              ))}
          </select>
          <span className="finding-help">
            执行完成不等于解决；人工选择依据后服务器仍验证全部依赖。
          </span>
        </label>
      )}
      {decision === "EDITED" && (
        <>
          <label className="finding-decision-field">
            <span className="t-label">Finding 标题</span>
            <input
              aria-label="Finding 标题"
              required
              maxLength={240}
              value={draft.title}
              onChange={(event) =>
                setDraft({ ...draft, title: event.target.value })
              }
            />
          </label>
          <label className="finding-decision-field">
            <span className="t-label">建议专业（目前仅支持查看）</span>
            <input readOnly value={finding.suggested_discipline ?? ""} />
          </label>
          <label className="finding-decision-field">
            <span className="t-label">建议行动</span>
            <textarea
              aria-label="建议行动"
              maxLength={1000}
              value={draft.suggested_action}
              onChange={(event) =>
                setDraft({ ...draft, suggested_action: event.target.value })
              }
            />
          </label>
        </>
      )}
      <label className="finding-decision-field">
        <span className="t-label">判断说明</span>
        <textarea
          aria-label="判断说明"
          rows={3}
          maxLength={1000}
          required={decision !== "CONFIRMED"}
          value={reason}
          onChange={(event) => setReason(event.target.value)}
        />
      </label>
      {session.error && (
        <WorkspaceInlineState
          title="人工判断未保存"
          diagnostic={session.error}
          alert
        >
          {engineeringErrorMessage(session.error)} 可调整依据后重新提交。
        </WorkspaceInlineState>
      )}
      <div className="finding-decision-inline-actions">
        <Button variant="secondary" disabled={session.busy} onClick={onClose}>
          取消
        </Button>
        <Button
          type="submit"
          disabled={
            session.busy ||
            (decision !== "CONFIRMED" && !reason.trim()) ||
            (decision === "EDITED" && !draft.title.trim())
          }
        >
          {session.busy ? "正在提交…" : "提交人工判断"}
        </Button>
      </div>
    </form>
  );
}

/**
 * The evidence-insufficient contract gap. It is informational only: it writes
 * nothing, so it stays an inline note with a way back to the evidence — never a
 * white dialog.
 */
export function FindingGapNotice({ onClose }: { onClose: () => void }) {
  const surface = useSurfaceFocus<HTMLDivElement>();
  return (
    <div
      ref={surface}
      tabIndex={-1}
      role="dialog"
      aria-label="证据不足"
      className="finding-gap-notice"
      onKeyDown={(event) => {
        if (event.key === "Escape") {
          event.preventDefault();
          event.stopPropagation();
          onClose();
        }
      }}
    >
      <p className="finding-decision-inline-title">证据不足</p>
      <p>目前不支持单独记录证据不足；此操作不可提交，也不会更改工程判断。</p>
      <p className="finding-help">
        请先检查或补充工程依据，再作人工判断。当前未写入任何人工决策。
      </p>
      <div className="finding-decision-inline-actions">
        <Button variant="secondary" onClick={onClose}>
          返回证据
        </Button>
      </div>
    </div>
  );
}
