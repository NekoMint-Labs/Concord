/* The Work surface. The docked list/receipt is the OpenTakeoff WorkspacePanel
 * port (features/WorkPanel.tsx); this file only composes it with the Concord
 * Finding session, the human decisions and the evidence host. One list, one
 * selection, one receipt: no second search, queue or inspector.
 */
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useQuery } from "@tanstack/react-query";
import { ArrowUpRight } from "lucide-react";
import {
  api,
  type DTO,
  type AgentRun,
  type InvestigationReport,
  type ProjectSourceStatus,
  type Workspace,
} from "../api/client";
import { Button } from "../components/ui/button";
import { icon } from "../components/ui/icon";
import { usePaneWidth } from "../layout/paneBudget";
import {
  DockHandle,
  DockTargets,
  type useWorkspaceLayout,
} from "../layout/WorkspaceLayout";
import type { DockId } from "../layout/workspaceLayoutState";
import {
  EvidenceWorkspaceHost,
  evidenceLabel,
  targetLabel,
  qualityLabels,
} from "../app/EvidenceWorkspaceHost";
import { WorkspaceInlineState } from "../components/WorkspaceInlineState";
import { shortDate } from "../ui/labels";
import { FindingFollowUp, recheckFreshness } from "./FindingFollowUp";
import {
  FindingDecisionInline,
  FindingGapNotice,
  type FindingDecisionKind,
} from "./FindingDecisionInline";
import {
  useEngineeringFindings,
  useEngineeringFinding,
} from "./useEngineeringFindings";
import {
  WorkPanel,
  findingStateLabels,
  type WorkPanelSelection,
} from "./WorkPanel";

export { findingStateLabels };

export type WorkSurfaceProps = {
  workspace: Workspace;
  sources: ProjectSourceStatus[];
  report?: InvestigationReport | null;
  run?: AgentRun | null;
  onPackage: (id: string) => void;
  onModels: () => void;
  onRecheck: () => void;
  onReport: () => void;
  onProject: () => void;
  onSource?: (sourceId: string) => void;
  onInvestigate?: (input: {
    sourceId: string;
    revisionId: string;
    fromRevisionId?: string;
    elementIds?: string[];
    revisionLabel?: string;
    fromRevisionLabel?: string;
  }) => void;
};

export function FindingWorkbench({
  prefs,
  project,
  open = true,
  agent,
  onClose,
  selectedId = "",
  evidenceId,
  onSelect,
  onEvidenceContext,
  work,
}: {
  prefs: ReturnType<typeof useWorkspaceLayout>;
  project: string;
  open?: boolean;
  /** The Concord surface for the dock's second tab. It reads the same selection the
   * receipt does, so the AI is part of this panel rather than a window beside it. */
  agent?: ReactNode;
  onClose: () => void;
  selectedId?: string;
  evidenceId?: string;
  onSelect: (id: string) => void;
  onEvidenceContext?: (evidence: DTO<"Evidence"> | null) => void;
  work: WorkSurfaceProps;
}) {
  const sources = work.sources;
  const list = useEngineeringFindings(project);
  // The list owns one selection; the receipt derives its session from it.
  const [selection, setSelection] = useState<WorkPanelSelection | null>();
  const applySelection = useCallback(
    (next: WorkPanelSelection | null) =>
      setSelection((prev) =>
        prev === next ||
        (prev != null &&
          next != null &&
          prev.kind === next.kind &&
          prev.id === next.id)
          ? prev
          : next,
      ),
    [],
  );
  const id =
    selection === null || selection?.kind === "work"
      ? ""
      : list.data?.some((finding) => finding.id === selectedId)
        ? selectedId
        : selection?.kind === "finding"
          ? selection.id
          : "";
  const session = useEngineeringFinding(project, id);
  const finding = session.finding.data;
  const [activeSelection, setActiveSelection] = useState<{
    findingId: string;
    evidenceId: string;
  }>();
  useEffect(() => {
    setActiveSelection(undefined);
  }, [project, id, evidenceId]);
  const activeId =
    activeSelection?.findingId === id
      ? activeSelection.evidenceId
      : (evidenceId ?? finding?.evidence_ids[0]);
  const activeQuery = session.evidence.find(
    (result) => result.data?.id === activeId,
  );
  const active = activeQuery?.data;
  const evidenceContext = useRef(onEvidenceContext);
  evidenceContext.current = onEvidenceContext;
  useEffect(() => {
    evidenceContext.current?.(active ?? null);
  }, [active, project, id]);
  // Display metadata only; reuse the existing project/source revision cache identity.
  const revisions = useQuery({
    queryKey: ["source-revisions", project, active?.source_id],
    queryFn: () => api.sourceRevisions(project, active!.source_id),
    enabled: !!project && !!active,
  });
  const evidenceCheck = session.rechecks.data?.find((check) =>
    check.evidence_ids.includes(activeId ?? ""),
  );
  const staleEvidence = !!(
    evidenceCheck &&
    finding &&
    recheckFreshness(evidenceCheck, finding, sources).startsWith("已过期")
  );
  const [dragging, setDragging] = useState<DockId | null>(null);
  const width = usePaneWidth();
  const stacked = width < 1000;
  const side = prefs.layout.work;
  const selectEvidence = (nextId: string) =>
    setActiveSelection({ findingId: id, evidenceId: nextId });
  const workPanel = (
    <WorkPanel
      key="finding-work-panel"
      open={open}
      dockSide={side}
      width={stacked ? undefined : prefs.layout.workWidth}
      dockHandle={
        !stacked ? (
          <DockHandle
            dock="work"
            label="工作与审核面板"
            locked={prefs.layout.locked}
            onDrag={setDragging}
            onMove={prefs.move}
          />
        ) : undefined
      }
      onClose={onClose}
      {...work}
      selectedFindingId={selectedId}
      onFindingSelect={onSelect}
      onSelectionChange={applySelection}
      /*
       * The receipt is a pane of its own in the wide composition, and only falls back
       * into the dock when the window cannot afford three columns (see `stacked`). A
       * list and a long engineering receipt stacked in one 360px column is the reason
       * the round-1 Work surface read as a form rather than as a workbench.
       */
      detail={
        stacked
          ? (findingId) =>
              findingId !== id ? (
                <WorkspaceInlineState title="正在读取 Finding 详情…">
                  正在切换工程判断。
                </WorkspaceInlineState>
              ) : (
                <FindingDetail
                  key={`${project}:${findingId}`}
                  session={session}
                  activeId={activeId}
                  onEvidence={selectEvidence}
                  sources={sources}
                />
              )
          : undefined
      }
    />
  );
  const evidencePanel = (
    <main
      key="finding-evidence"
      className="workspace-stage"
      aria-label="工程依据"
      style={{ flex: 1, minWidth: 0, display: "flex", order: 0 }}
    >
      {active ? (
        <EvidenceWorkspaceHost
          evidence={active}
          project={project}
          stale={staleEvidence}
          revisions={revisions.data}
          sources={sources}
        />
      ) : (
        <section className="evidence-workspace-host">
          <div className="evidence-host-stage">
            <div className="evidence-target-receipt">
              {session.evidence.some((query) => query.isError) ? (
                <WorkspaceInlineState
                  title="Evidence 读取失败"
                  alert
                  diagnostic={session.evidence
                    .filter((query) => query.isError)
                    .map((query) => query.error?.message)
                    .join("\n")}
                  action={
                    <Button
                      size="sm"
                      onClick={() =>
                        session.evidence.forEach((query) => {
                          if (query.isError) void query.refetch();
                        })
                      }
                    >
                      重试读取 Evidence
                    </Button>
                  }
                >
                  所选依据暂不可读，保留选择，不制造定位信息。
                </WorkspaceInlineState>
              ) : (
                <WorkspaceInlineState
                  title={
                    session.evidence.some((query) => query.isPending)
                      ? "正在读取 Evidence…"
                      : "选择工程依据"
                  }
                >
                  {activeId
                    ? "所选依据暂不可用；保留选择，不制造定位信息。"
                    : "从工程判断选择依据，检查来源与精确目标。"}
                </WorkspaceInlineState>
              )}
              {activeId && (
                <details className="workspace-technical-details">
                  <summary>所选依据编号</summary>
                  <code>{activeId}</code>
                </details>
              )}
            </div>
          </div>
        </section>
      )}
    </main>
  );
  /*
   * The judgement pane. It is the third column of the Work mode and it sits *beside*
   * the list, not below it: the receipt, the human decision and the Concord surface all
   * read the one selection, so they belong together on the other side of the evidence
   * they are judging. `order` keeps it adjacent to the dock whichever side the dock is
   * docked to.
   */
  const judgementPanel = (
    <aside
      key="finding-judgement"
      className="work-judgement"
      aria-label="工程判断详情与人工决策"
      style={{
        width: Math.max(340, prefs.layout.workWidth),
        order: side === "left" ? -8 : 8,
      }}
    >
      {id ? (
        <FindingDetail
          key={`${project}:${id}`}
          session={session}
          activeId={activeId}
          onEvidence={selectEvidence}
          sources={sources}
        />
      ) : (
        <div className="work-judgement-empty">
          <WorkspaceInlineState title="选择一项工程判断">
            检查变更、影响与依据，再作人工判断。
          </WorkspaceInlineState>
        </div>
      )}
      {agent ? (
        /*
         * The assistant is docked in the judgement pane, under a disclosure that names
         * the context it will be given. Open by default it would take a third of the
         * column the receipt needs; closed, it is still the first thing under the
         * evidence - a capability sitting inside the engineering context rather than a
         * tool someone has to go and find. The instrument bar carries the other entry.
         */
        <details className="work-judgement-agent">
          <summary>
            <span className="work-agent-mark" aria-hidden="true" />
            <strong>Concord 工程助手</strong>
            <span className="work-agent-scope">
              {session.finding.data?.title ?? "当前工程上下文"}
            </span>
          </summary>
          <div className="work-agent-body">{agent}</div>
        </details>
      ) : null}
    </aside>
  );
  return (
    <>
      {stacked
        ? [evidencePanel, workPanel]
        : [workPanel, judgementPanel, evidencePanel]}
      <DockTargets dragging={dragging} />
    </>
  );
}

/** Selected Finding receipt: verified/extracted facts, inference, decisions. */
function FindingDetail({
  session,
  activeId,
  onEvidence,
  sources,
}: {
  session: ReturnType<typeof useEngineeringFinding>;
  activeId?: string;
  onEvidence: (id: string) => void;
  sources?: DTO<"ProjectSourceStatus">[];
}) {
  const finding = session.finding.data;
  const [pendingDecision, setPendingDecision] =
    useState<FindingDecisionKind | null>(null);
  const [gapOpen, setGapOpen] = useState(false);
  const open = pendingDecision !== null || gapOpen;
  // A decision strip grows out of a button and collapses back to it: remember
  // the trigger so focus returns there, never to the panel chrome.
  const returnFocus = useRef<HTMLElement | null>(null);
  useEffect(() => {
    if (open || !returnFocus.current) return;
    const target = returnFocus.current;
    returnFocus.current = null;
    if (target.isConnected) target.focus();
  }, [open]);
  if (session.finding.isPending)
    return (
      <WorkspaceInlineState title="正在读取 Finding 详情…">
        正在准备变更、影响与关联依据。
      </WorkspaceInlineState>
    );
  if (session.finding.isError)
    return (
      <WorkspaceInlineState
        title="Finding 读取失败"
        diagnostic={session.finding.error.message}
        alert
        action={
          <Button size="sm" onClick={() => void session.finding.refetch()}>
            重试详情
          </Button>
        }
      >
        暂时无法读取所选工程判断，不显示过往缓存作为当前结果。
      </WorkspaceInlineState>
    );
  if (!finding)
    return (
      <WorkspaceInlineState title="工程判断不可用">
        请选择当前项目中的工程判断。
      </WorkspaceInlineState>
    );
  // The decision strip opens in place; it never leaves the docked panel.
  const startDecision = (
    decision: FindingDecisionKind,
    element: HTMLElement,
  ) => {
    returnFocus.current = element;
    setPendingDecision(decision);
  };
  const openGap = (element: HTMLElement) => {
    returnFocus.current = element;
    setGapOpen(true);
  };
  const evidenceLinks = (quality: "verified" | "inferred") =>
    finding.evidence_ids.map((id) => {
      const query = session.evidence.find((result) => result.data?.id === id);
      const evidence = query?.data;
      if (
        !evidence ||
        (quality === "inferred") !== (evidence.quality === "inferred")
      )
        return null;
      return (
        <Button
          variant="ghost"
          type="button"
          key={id}
          aria-pressed={activeId === id}
          className="finding-evidence-link workspace-row"
          onClick={() => onEvidence(id)}
        >
          <span>
            <strong>{evidenceLabel(evidence)}</strong>
            <small>
              {sources?.find((item) => item.source.id === evidence.source_id)
                ?.source.name || "来源名称未提供"}{" "}
              · {targetLabel(evidence.viewer_target)}
            </small>
          </span>
          <span className="finding-quality">
            {qualityLabels[evidence.quality]}
            <ArrowUpRight {...icon} />
          </span>
        </Button>
      );
    });
  return (
    <div className="finding-receipt-view">
      <section
        className="workspace-inspector finding-receipt"
        aria-label="Finding 详情"
      >
        <div className="workspace-inspector-title finding-receipt-title">
          <h2 id="finding-title" tabIndex={-1}>
            {finding.title}
          </h2>
        </div>
        <p className="workspace-receipt-note" role="status">
          {findingStateLabels[finding.state]} · {shortDate(finding.updated_at)}
        </p>
        <section className="finding-section">
          <h3 className="t-label">什么变了</h3>
          <p>{finding.what_changed}</p>
        </section>
        <section className="finding-section">
          <h3 className="t-label">为什么重要</h3>
          <p>{finding.why_it_matters}</p>
        </section>
        <section className="finding-section finding-next-action">
          <h3 className="t-label">下一步 · 建议</h3>
          <p>{finding.suggested_action || "先检查关联依据，再作人工判断。"}</p>
          <p className="workspace-receipt-note">
            建议专业：{finding.suggested_discipline || "未指定"} ·
            建议需人工判断
          </p>
        </section>
        <section
          className="finding-section finding-evidence"
          aria-label="结构化与提取证据"
        >
          <h3 className="t-label">已验证 / 提取依据</h3>
          <p className="finding-help">
            结构化表示工程验证；提取内容来自资料，不等于已验证几何或满足条件。
          </p>
          {evidenceLinks("verified")}
          {session.evidence.some((query) => query.isPending) && (
            <p role="status">正在读取 Evidence…</p>
          )}
          {session.evidence.some((query) => query.isError) && (
            <div className="workspace-receipt-note">
              <p>部分依据未读取，暂不能判断其质量；请重试失败的读取。</p>
              {session.evidence.some(
                (query) => query.data?.id === activeId,
              ) && (
                <Button
                  size="sm"
                  onClick={() =>
                    session.evidence.forEach((query) => {
                      if (query.isError) void query.refetch();
                    })
                  }
                >
                  重试未读取 Evidence
                </Button>
              )}
            </div>
          )}
          {!finding.evidence_ids.length && <p>未附 Evidence。</p>}
        </section>
        <section
          className="finding-section finding-inference"
          aria-label="推断与 AI 建议"
        >
          <h3 className="t-label">推断与建议</h3>
          <p className="finding-help">
            不是已验证工程事实；建议由人工判断。AI 解释不会成为 Evidence
            或人工决策。
          </p>
          {evidenceLinks("inferred")}
          <p className="workspace-receipt-note">
            建议置信度：{finding.confidence}
          </p>
        </section>
        <section className="finding-section">
          <h3 className="t-label">限制与依赖</h3>
          {finding.limitations.map((text, index) => (
            <p key={index}>{text}</p>
          ))}
          {finding.dependencies.map((dependency, index) => (
            <p key={index}>
              {sources?.find((item) => item.source.id === dependency.source_id)
                ?.source.name || "来源名称未提供"}{" "}
              · {dependency.expected_condition}
            </p>
          ))}
          {!finding.limitations.length && !finding.dependencies.length && (
            <p>未提供限制与依赖；不据此推断检查范围完整。</p>
          )}
        </section>
        <details className="workspace-technical-details">
          <summary>来源与技术详情</summary>
          <dl>
            <div>
              <dt>Finding ID</dt>
              <dd>
                <code>{finding.id}</code>
              </dd>
            </div>
            <div>
              <dt>状态</dt>
              <dd>{finding.state}</dd>
            </div>
            <div>
              <dt>快照 ID</dt>
              <dd>
                <code>{finding.snapshot_id}</code>
              </dd>
            </div>
            <div>
              <dt>工作包 ID</dt>
              <dd>
                <code>{finding.work_package_id || "未提供"}</code>
              </dd>
            </div>
            <div>
              <dt>变更 IDs</dt>
              <dd>{finding.change_ids.join(" · ") || "未提供"}</dd>
            </div>
            <div>
              <dt>精确更新时间</dt>
              <dd>{finding.updated_at}</dd>
            </div>
          </dl>
          <pre aria-label="Exact Finding record">
            {JSON.stringify(finding, null, 2)}
          </pre>
        </details>
        {/* Decisions live in the receipt. The strip swaps in over the buttons,
            in place, and never becomes a modal. */}
        <div className="finding-decision-area">
          <div
            className="workspace-inspector-actions"
            aria-label="人工判断"
            hidden={open}
          >
            {finding.state === "PROPOSED" && (
              <Button
                size="sm"
                disabled={session.busy}
                onClick={(event) =>
                  startDecision("CONFIRMED", event.currentTarget)
                }
              >
                确认
              </Button>
            )}
            {(finding.state === "PROPOSED" ||
              finding.state === "CONFIRMED") && (
              <>
                <Button
                  variant="secondary"
                  size="sm"
                  disabled={session.busy}
                  onClick={(event) =>
                    startDecision("DISMISSED", event.currentTarget)
                  }
                >
                  忽略
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={session.busy}
                  onClick={(event) =>
                    startDecision("EDITED", event.currentTarget)
                  }
                >
                  编辑
                </Button>
              </>
            )}
            {finding.state === "CONFIRMED" && (
              <Button
                variant="secondary"
                size="sm"
                disabled={session.busy}
                onClick={(event) =>
                  startDecision("CLOSED", event.currentTarget)
                }
              >
                关闭
              </Button>
            )}
            {(finding.state === "CLOSED" || finding.state === "DISMISSED") && (
              <Button
                size="sm"
                disabled={session.busy}
                onClick={(event) =>
                  startDecision("REOPENED", event.currentTarget)
                }
              >
                重新打开
              </Button>
            )}
            <Button
              variant="secondary"
              size="sm"
              onClick={(event) => openGap(event.currentTarget)}
            >
              证据不足
            </Button>
            <FindingFollowUp
              session={session}
              sources={sources}
              onEvidence={onEvidence}
            />
          </div>
          {pendingDecision !== null && (
            <FindingDecisionInline
              key={pendingDecision}
              decision={pendingDecision}
              finding={finding}
              session={session}
              sources={sources}
              onClose={() => setPendingDecision(null)}
            />
          )}
          {gapOpen && <FindingGapNotice onClose={() => setGapOpen(false)} />}
          {pendingDecision !== null && session.busy && (
            // aria-live, not role="status": the receipt already owns one status
            // region (the Finding state readout) that queries select by role.
            <p className="finding-decision-status" aria-live="polite">
              正在提交，请等待确认…
            </p>
          )}
        </div>
      </section>
    </div>
  );
}
