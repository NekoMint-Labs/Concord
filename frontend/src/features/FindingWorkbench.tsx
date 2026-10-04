/* WorkspacePanel structure/behavior ported/adapted from OpenTakeoff, revision
 * 788e39bfe9c42b3260ea75e84a655e4574f9bc8c (Apache-2.0).
 * Copyright 2026 Kentucky AI and the OpenTakeoff contributors.
 * Modified for Concord: persisted Finding receipt and explicit human decisions,
 * Concord PaneSplit/motion/primitives; no estimating domain or viewer implementation.
 */
import { useEffect, useState, type ReactNode } from "react";
import { ArrowUpRight, PanelRightOpen } from "lucide-react";
import { api, type DTO } from "../api/client";
import { useQuery } from "@tanstack/react-query";
import { Button } from "../components/ui/button";
import { AppDialog } from "../components/ui/AppDialog";
import { icon } from "../components/ui/icon";
import { Pane, PaneDivider, PaneSplit, usePanelRef } from "../layout/PaneSplit";
import { usePaneWidth } from "../layout/paneBudget";
import {
  DockHandle,
  DockTargets,
  type useWorkspaceLayout,
} from "../layout/WorkspaceLayout";
import {
  ThatOpenGrid,
  ThatOpenPanel,
  ThatOpenToolbar,
} from "../components/ThatOpenUI";
import {
  EvidenceWorkspaceHost,
  evidenceLabel,
  targetLabel,
  qualityLabels,
} from "../app/EvidenceWorkspaceHost";
import {
  WorkspaceInlineState,
  engineeringErrorMessage,
} from "../components/WorkspaceInlineState";
import { shortDate } from "../ui/labels";
import { FindingFollowUp, recheckFreshness } from "./FindingFollowUp";
import {
  useEngineeringFindings,
  useEngineeringFinding,
} from "./useEngineeringFindings";

export const findingStateLabels = {
  PROPOSED: "待人工判断",
  CONFIRMED: "已确认",
  DISMISSED: "已忽略",
  CLOSED: "人工关闭",
};
const actions = {
  CONFIRMED: "确认",
  DISMISSED: "忽略",
  EDITED: "编辑",
  CLOSED: "关闭",
  REOPENED: "重新打开",
};

export function FindingWorkbench({
  prefs,
  queue,
  project,
  selectedId = "",
  evidenceId,
  onSelect,
  sources,
}: {
  prefs: ReturnType<typeof useWorkspaceLayout>;
  queue?: ReactNode;
  project: string;
  selectedId?: string;
  evidenceId?: string;
  onSelect: (id: string) => void;
  sources?: DTO<"ProjectSourceStatus">[];
}) {
  const list = useEngineeringFindings(project);
  // Opaque IDs, never list positions. A removed selection cannot display cached detail.
  const id = list.data?.some((finding) => finding.id === selectedId)
    ? selectedId
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
  const [open, setOpen] = useState(!queue || !!id);
  useEffect(() => {
    if (id) setOpen(true);
  }, [id]);
  const [dragging, setDragging] = useState<"work" | null>(null);
  const width = usePaneWidth();
  const stacked = width < 1000;
  const panel = usePanelRef();
  const side = prefs.layout.work;
  useEffect(() => {
    if (!stacked) panel.current?.resize(`${prefs.layout.workWidth}px`);
  }, [prefs.layout.workWidth, stacked, panel]);
  const closePanel = () => {
    setOpen(false);
    document.getElementById("finding-panel-toggle")?.focus();
  };
  const selectEvidence = (evidenceId: string) =>
    setActiveSelection({ findingId: id, evidenceId });
  const workPanel: ReactNode = open && (
    <Pane
      key="finding-panel"
      id="finding-panel"
      panelRef={panel}
      className="finding-panel-pane"
      defaultSize={stacked ? "52%" : `${prefs.layout.workWidth}px`}
      minSize={stacked ? "240px" : "300px"}
      maxSize={stacked ? "65%" : "480px"}
    >
      <aside
        className="workspace-panel"
        aria-label="Finding 工作与审核"
        data-dock-side={side}
        onKeyDown={(e) => {
          if (
            e.key === "Escape" &&
            !e.defaultPrevented &&
            !(
              e.target instanceof Element && e.target.closest('[role="dialog"]')
            )
          ) {
            e.preventDefault();
            e.stopPropagation();
            closePanel();
          }
        }}
      >
        <ThatOpenPanel className="finding-review-surface" label="工程判断">
          <div slot="header-end" className="finding-review-header-actions">
            {!stacked && (
              <DockHandle
                dock="work"
                label="Finding 审核面板"
                locked={prefs.layout.locked}
                onDrag={setDragging}
                onMove={prefs.move}
              />
            )}
            <Button
              variant="ghost"
              size="sm"
              onClick={closePanel}
              aria-label="关闭 Finding 面板"
            >
              ×
            </Button>
          </div>
          <div className="finding-review-content">
            <FindingReceipt
              key={`${project}:${id}`}
              session={session}
              activeId={activeId}
              onEvidence={selectEvidence}
              sources={sources}
              list={
                <>
                  {selectedId && !list.isPending && !list.isError && !id && (
                    <WorkspaceInlineState title="工程判断已不在当前列表">
                      请重新选择当前项目中的工程判断。
                    </WorkspaceInlineState>
                  )}
                  {!id && (
                    <WorkspaceInlineState title="选择一项工程判断">
                      检查变更与依据，再作人工判断。
                    </WorkspaceInlineState>
                  )}
                </>
              }
            />
            <footer className="workspace-footer">
              <span>{list.data?.length ?? 0} 项工程判断</span>
            </footer>
          </div>
        </ThatOpenPanel>
      </aside>
    </Pane>
  );
  const rememberWidth = () => {
    const size = panel.current?.getSize();
    if (size && !stacked && !prefs.layout.locked)
      prefs.update({ workWidth: size.inPixels });
  };
  const divider = open && (
    <PaneDivider
      key="finding-divider"
      label="调整 Finding 面板宽度"
      disabled={prefs.layout.locked || stacked}
    />
  );
  const evidencePanel = (
    <Pane
      key="finding-evidence"
      className="evidence-host-pane"
      minSize={stacked ? "200px" : "320px"}
    >
      <ThatOpenGrid
        className={`work-evidence-composition${queue && id ? " has-evidence" : ""}`}
        template={
          queue && id
            ? '"queue" minmax(160px, 1fr) "context" minmax(180px, 1fr) / minmax(0, 1fr)'
            : queue
              ? '"queue" 1fr / minmax(0, 1fr)'
              : '"context" 1fr / minmax(0, 1fr)'
        }
        areas={{
          ...(queue ? { queue } : {}),
          context:
            (!queue || id) &&
            (active ? (
              <EvidenceWorkspaceHost
                evidence={active}
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
            )),
        }}
      />
    </Pane>
  );
  return (
    <section className="finding-workbench workspace-calm" data-canvas-workspace>
      <ThatOpenToolbar
        className="finding-workbench-toolbar"
        aria-label="工作审核操作"
      >
        <span>
          <strong>工作</strong>
        </span>
        <div>
          <Button
            variant="ghost"
            size="sm"
            id="finding-panel-toggle"
            role="button"
            tabIndex={0}
            aria-expanded={open}
            onClick={() => setOpen((value) => !value)}
          >
            <PanelRightOpen {...icon} />
            审核面板
          </Button>
        </div>
      </ThatOpenToolbar>
      {!queue && (
        <details className="finding-list-disclosure">
          <summary>工程判断列表 · {list.data?.length ?? 0}</summary>
          {list.isPending ? (
            <p role="status">正在读取工程 Findings…</p>
          ) : list.isError ? (
            <WorkspaceInlineState
              title="工程 Findings 读取失败"
              alert
              diagnostic={
                list.error instanceof Error
                  ? list.error.message
                  : String(list.error)
              }
              action={
                <Button size="sm" onClick={() => void list.refetch()}>
                  重试读取 Findings
                </Button>
              }
            />
          ) : list.data?.length ? (
            <div role="list" aria-label="工程 Findings">
              {list.data.map((item) => (
                <Button
                  key={item.id}
                  type="button"
                  aria-pressed={item.id === id}
                  onClick={() => onSelect(item.id)}
                >
                  {item.title} {item.id}
                </Button>
              ))}
            </div>
          ) : (
            <p role="status">当前项目尚无工程 Finding</p>
          )}
        </details>
      )}
      <PaneSplit
        id={`finding-workbench-${stacked ? "stacked" : side}`}
        orientation={stacked ? "vertical" : "horizontal"}
        onUserLayoutChanged={rememberWidth}
      >
        {!stacked && side === "left"
          ? [workPanel, divider, evidencePanel]
          : [evidencePanel, divider, workPanel]}
      </PaneSplit>
      <DockTargets dragging={dragging} />
    </section>
  );
}

function FindingReceipt({
  session,
  activeId,
  onEvidence,
  sources,
  list,
}: {
  session: ReturnType<typeof useEngineeringFinding>;
  activeId?: string;
  onEvidence: (id: string) => void;
  sources?: DTO<"ProjectSourceStatus">[];
  list: ReactNode;
}) {
  const finding = session.finding.data;
  const [pendingDecision, setPendingDecision] = useState<
    DTO<"FindingDecision">["decision"] | null
  >(null);
  const [reason, setReason] = useState("");
  const [closureCheckId, setClosureCheckId] = useState("");
  const [draft, setDraft] = useState({ title: "", suggested_action: "" });
  const [gapOpen, setGapOpen] = useState(false);
  if (session.finding.isPending)
    return (
      <div className="workspace-work-view">
        {list}
        {session.finding.isFetching && (
          <WorkspaceInlineState title="正在读取 Finding 详情…">
            正在准备变更、影响与关联依据。
          </WorkspaceInlineState>
        )}
      </div>
    );
  if (session.finding.isError)
    return (
      <div className="workspace-work-view">
        {list}
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
      </div>
    );
  if (!finding)
    return (
      <div className="workspace-work-view">
        {list}
        <WorkspaceInlineState title="工程判断不可用">
          请选择当前项目中的工程判断。
        </WorkspaceInlineState>
      </div>
    );
  const startDecision = (decision: DTO<"FindingDecision">["decision"]) => {
    setReason("");
    setClosureCheckId("");
    setDraft({
      title: finding.title,
      suggested_action: finding.suggested_action ?? "",
    });
    setPendingDecision(decision);
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
    <>
      <div className="workspace-work-view">
        {list}
        <section className="workspace-inspector" aria-label="Finding 详情">
          <div className="workspace-inspector-title">
            <h2 id="finding-title" tabIndex={-1}>
              {finding.title}
            </h2>
          </div>
          <p className="workspace-receipt-note" role="status">
            {findingStateLabels[finding.state]} ·{" "}
            {shortDate(finding.updated_at)}
          </p>
          <section className="finding-section">
            <h3>什么变了</h3>
            <p>{finding.what_changed}</p>
          </section>
          <section className="finding-section">
            <h3>为什么重要</h3>
            <p>{finding.why_it_matters}</p>
          </section>
          <section className="finding-section finding-next-action">
            <h3>下一步 · 建议</h3>
            <p>
              {finding.suggested_action || "先检查关联依据，再作人工判断。"}
            </p>
            <p className="workspace-receipt-note">
              建议专业：{finding.suggested_discipline || "未指定"} ·
              建议需人工判断
            </p>
          </section>
          <section
            className="finding-section finding-evidence"
            aria-label="结构化与提取证据"
          >
            <h3>已验证 / 提取依据</h3>
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
            <h3>推断与建议</h3>
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
            <h3>限制与依赖</h3>
            {finding.limitations.map((text, index) => (
              <p key={index}>{text}</p>
            ))}
            {finding.dependencies.map((dependency, index) => (
              <p key={index}>
                {sources?.find(
                  (item) => item.source.id === dependency.source_id,
                )?.source.name || "来源名称未提供"}{" "}
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
        </section>
      </div>
      <div className="finding-review-controls">
        <div className="workspace-inspector-actions" aria-label="人工判断">
          {finding.state === "PROPOSED" && (
            <Button
              size="sm"
              disabled={session.busy}
              onClick={() => startDecision("CONFIRMED")}
            >
              确认
            </Button>
          )}
          {(finding.state === "PROPOSED" || finding.state === "CONFIRMED") && (
            <>
              <Button
                variant="secondary"
                size="sm"
                disabled={session.busy}
                onClick={() => startDecision("DISMISSED")}
              >
                忽略
              </Button>
              <Button
                variant="ghost"
                size="sm"
                disabled={session.busy}
                onClick={() => startDecision("EDITED")}
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
              onClick={() => startDecision("CLOSED")}
            >
              关闭
            </Button>
          )}
          {(finding.state === "CLOSED" || finding.state === "DISMISSED") && (
            <Button
              size="sm"
              disabled={session.busy}
              onClick={() => startDecision("REOPENED")}
            >
              重新打开
            </Button>
          )}
          <Button
            variant="secondary"
            size="sm"
            onClick={() => setGapOpen(true)}
          >
            证据不足
          </Button>
          <FindingFollowUp
            session={session}
            sources={sources}
            onEvidence={onEvidence}
          />
        </div>
        {session.busy && (
          <p className="finding-decision-status" role="status">
            正在提交，请等待确认…
          </p>
        )}
      </div>
      <AppDialog
        open={gapOpen}
        onOpenChange={setGapOpen}
        title="证据不足"
        description="目前不支持单独记录证据不足；此操作不可提交，也不会更改工程判断。"
      >
        <p>请先检查或补充工程依据，再作人工判断。当前未写入任何人工决策。</p>
        <Button onClick={() => setGapOpen(false)}>返回证据</Button>
      </AppDialog>
      <AppDialog
        open={pendingDecision !== null}
        onOpenChange={(next) => {
          if (!next && !session.busy) setPendingDecision(null);
        }}
        title={`${pendingDecision ? actions[pendingDecision] : "判断"} Finding`}
        description={
          pendingDecision === "CLOSED"
            ? "请选择已验证满足全部依赖条件的当前复核依据。关闭仍需人工确认；依据不足时会拒绝关闭并保留记录。"
            : "提交你的人工判断。成功保存后才更新工程判断与协调记录。"
        }
      >
        <form
          className="finding-edit-form"
          onSubmit={async (event) => {
            event.preventDefault();
            if (!pendingDecision || session.busy) return;
            const result = await session.decide({
              decision: pendingDecision,
              note: reason.trim(),
              ...(pendingDecision === "CLOSED" && closureCheckId
                ? { recheck_id: closureCheckId }
                : {}),
              ...(pendingDecision === "EDITED"
                ? {
                    title: draft.title.trim(),
                    suggested_action: draft.suggested_action.trim(),
                  }
                : {}),
            });
            if (result) setPendingDecision(null);
          }}
        >
          <p>{finding.title}</p>
          {pendingDecision === "CLOSED" && (
            <label>
              关闭依据 ReCheck
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
                      check.outcome === "RESOLVED" &&
                      check.evidence_ids.length > 0,
                  )
                  .map((check) => (
                    <option key={check.id} value={check.id}>
                      条件已验证满足 ·{" "}
                      {shortDate(check.completed_at ?? check.created_at)} ·{" "}
                      {recheckFreshness(check, finding, sources)}
                    </option>
                  ))}
              </select>
              <span>
                执行完成不等于解决；人工选择依据后服务器仍验证全部依赖。
              </span>
            </label>
          )}
          {pendingDecision === "EDITED" && (
            <>
              <label>
                Finding 标题
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
              <label>
                建议专业（目前仅支持查看）
                <input readOnly value={finding.suggested_discipline ?? ""} />
              </label>
              <label>
                建议行动
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
          <label>
            判断说明
            <textarea
              aria-label="判断说明"
              rows={3}
              maxLength={1000}
              required={pendingDecision !== "CONFIRMED"}
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
          <div>
            <Button
              variant="secondary"
              disabled={session.busy}
              onClick={() => setPendingDecision(null)}
            >
              取消
            </Button>
            <Button
              type="submit"
              disabled={
                session.busy ||
                (pendingDecision !== "CONFIRMED" && !reason.trim()) ||
                (pendingDecision === "EDITED" && !draft.title.trim())
              }
            >
              {session.busy ? "正在提交…" : "提交人工判断"}
            </Button>
          </div>
        </form>
      </AppDialog>
    </>
  );
}
