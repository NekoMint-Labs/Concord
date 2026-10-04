/* Source: OpenTakeoff web/src/components/WorkspacePanel.jsx (Apache-2.0).
 * Copyright 2026 Kentucky AI and the OpenTakeoff contributors.
 * Revision: 788e39bfe9c42b3260ea75e84a655e4574f9bc8c.
 * Modified for Concord: measurement/quantity/takeoff/estimating vocabulary and
 * the agent-actor filter are replaced by Concord Findings and project work. The
 * donor structure, class names and behavior are retained — heading, summary,
 * tabs, one query, one filter row, bounded list, selected receipt, inspector
 * actions, footer and Escape close. There is exactly one list and one
 * selection; the selected receipt is the only detail surface. Controls are the
 * donor's plain HTML elements, styled by the vendored workspacePanel.css.
 */
import { useEffect, useMemo, useState, type ReactNode } from "react";
import type {
  AgentRun,
  DTO,
  InvestigationReport,
  ProjectSourceStatus,
  Workspace,
} from "../api/client";
import { Z } from "../vendor/opentakeoff/lib/ui";
import { WorkspaceInlineState } from "../components/WorkspaceInlineState";
import { demoAreaName } from "../ui/demo/demoPresentation";
import { statusLabel } from "../ui/labels";
import { buildWorkDecisions, type WorkDecision } from "./workDecisions";
import { useWorkSourceContext } from "./useWorkSourceContext";
import { useEngineeringFindings } from "./useEngineeringFindings";

export const findingStateLabels = {
  PROPOSED: "待人工判断",
  CONFIRMED: "已确认",
  DISMISSED: "已忽略",
  CLOSED: "人工关闭",
};

/** One selected row, whichever kind it is. Work never keeps two selections. */
export type WorkPanelSelection = { kind: "finding" | "work"; id: string };

type FindingRow = { kind: "finding"; key: string; item: DTO<"Finding"> };
type WorkRow = { kind: "work"; key: string; item: WorkDecision };
type WorkPanelRow = FindingRow | WorkRow;

type WorkActions = {
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

export function WorkPanel({
  open = true,
  dockSide = "right",
  width,
  dockHandle,
  onClose,
  workspace,
  sources,
  report,
  run,
  selectedFindingId = "",
  onFindingSelect,
  onSelectionChange,
  detail,
  children,
  ...actions
}: WorkActions & {
  open?: boolean;
  dockSide?: "left" | "right";
  width?: number;
  dockHandle?: ReactNode;
  onClose?: () => void;
  workspace: Workspace;
  sources: ProjectSourceStatus[];
  report?: InvestigationReport | null;
  run?: AgentRun | null;
  selectedFindingId?: string;
  onFindingSelect?: (id: string) => void;
  onSelectionChange?: (selection: WorkPanelSelection | null) => void;
  /** Selected Finding receipt. Findings own their session; this panel owns the list. */
  detail?: (findingId: string) => ReactNode;
  /** The donor's second tab. Concord supplies its agent surface here. */
  children?: ReactNode;
}) {
  const [tab, setTab] = useState<"work" | "agent">("work");
  const [filter, setFilter] = useState<"all" | "needs" | "done">("all");
  const [query, setQuery] = useState("");
  const [limit, setLimit] = useState(50);
  const [selectedKey, setSelectedKey] = useState("");
  const sourceContexts = useWorkSourceContext(
    workspace.state.project.id,
    sources,
  );
  const findings = useEngineeringFindings(workspace.state.project.id);
  const decisions = buildWorkDecisions(workspace, sources, report, {
    ...actions,
    sourceContexts,
    run,
  });
  const projectRows = [
    ...decisions.needs,
    ...decisions.waiting,
    ...decisions.completed,
  ];
  const findingRows = findings.data ?? [];
  const total = projectRows.length + findingRows.length;
  const needs =
    decisions.needs.length +
    findingRows.filter(
      (finding) =>
        finding.state === "PROPOSED" || finding.state === "CONFIRMED",
    ).length;
  const matches = (value: string) =>
    value.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase());
  const rows = useMemo<WorkPanelRow[]>(() => {
    const project = projectRows
      .filter(
        (item) =>
          filter === "all" ||
          (filter === "needs"
            ? decisions.needs.includes(item)
            : decisions.completed.includes(item)),
      )
      .filter((item) =>
        matches(`${item.title} ${item.reason} ${item.context} ${item.key}`),
      )
      .map((item) => ({
        kind: "work" as const,
        key: `work:${item.key}`,
        item,
      }));
    const finding = findingRows
      .filter(
        (item) =>
          filter === "all" ||
          (filter === "needs"
            ? item.state === "PROPOSED" || item.state === "CONFIRMED"
            : item.state === "CLOSED" || item.state === "DISMISSED"),
      )
      .filter((item) =>
        matches(
          `${item.title} ${item.what_changed} ${item.suggested_discipline ?? ""} ${item.id} ${item.work_package_id ?? ""}`,
        ),
      )
      .map((item) => ({
        kind: "finding" as const,
        key: `finding:${item.id}`,
        item,
      }));
    return [...finding, ...project];
  }, [
    projectRows,
    findingRows,
    filter,
    query,
    decisions.needs,
    decisions.completed,
  ]);
  const shown = rows.slice(0, limit);
  const activeKey = rows.some((row) => row.key === selectedKey)
    ? selectedKey
    : selectedFindingId &&
        rows.some((row) => row.key === `finding:${selectedFindingId}`)
      ? `finding:${selectedFindingId}`
      : "";
  const selected = rows.find((row) => row.key === activeKey);

  useEffect(() => setLimit(50), [filter, query]);
  useEffect(() => {
    // A query/filter can hide a selection, but only removal invalidates its ID.
    if (
      selectedKey &&
      !projectRows.some((item) => `work:${item.key}` === selectedKey) &&
      !findingRows.some((item) => `finding:${item.id}` === selectedKey)
    )
      setSelectedKey("");
  }, [projectRows, findingRows, selectedKey]);
  useEffect(() => {
    if (!selectedFindingId) return;
    setSelectedKey(
      findingRows.some((item) => item.id === selectedFindingId)
        ? `finding:${selectedFindingId}`
        : "",
    );
  }, [findingRows, selectedFindingId]);
  // Report the canonical selection upward; Findings derive their session from it.
  useEffect(() => {
    onSelectionChange?.(
      selected
        ? {
            kind: selected.kind,
            id:
              selected.kind === "finding"
                ? selected.item.id
                : selected.item.key,
          }
        : null,
    );
  }, [selected, onSelectionChange]);

  const select = (row: WorkPanelRow) => {
    setSelectedKey(row.key);
    if (row.kind === "finding") onFindingSelect?.(row.item.id);
    else if (selectedFindingId) onFindingSelect?.("");
  };
  const workDetail = selected?.kind === "work" ? selected.item : undefined;
  const selectedPackage = workDetail?.workPackageId
    ? workspace.state.work_packages.find(
        (item) => item.id === workDetail.workPackageId,
      )
    : undefined;
  const comparison = workDetail?.sourceContext?.comparison;
  const readiness =
    selectedPackage &&
    workspace.analysis?.readiness.find(
      (item) => item.work_package_id === selectedPackage.id,
    );
  const workState = selectedPackage
    ? workspace.stale
      ? "需要重新检查"
      : statusLabel(readiness?.status ?? "UNCHECKED")
    : workDetail?.state;
  const location = selectedPackage
    ? `${demoAreaName(selectedPackage.area_id, workspace.state.areas.find((area) => area.id === selectedPackage.area_id)?.name ?? selectedPackage.area_id)} · ${selectedPackage.id}`
    : workDetail?.context;

  return (
    <aside
      className="workspace-panel"
      hidden={!open}
      aria-label="工作与审核"
      data-dock-side={dockSide}
      style={{
        zIndex: Z.drawer,
        ...(dockSide ? { order: dockSide === "left" ? -10 : 10, width } : {}),
      }}
      onKeyDown={(event) => {
        const target = event.target;
        if (
          event.key === "Escape" &&
          !event.defaultPrevented &&
          // The work list is the persistent selection surface: a row the user is
          // operating must not be dismissed by Escape. The docked panel still
          // closes on Escape from its own chrome (or with nothing selected).
          !(target instanceof Element && target.closest(".workspace-list")) &&
          !(target instanceof Element && target.closest('[role="dialog"]')) &&
          onClose
        ) {
          event.preventDefault();
          event.stopPropagation();
          onClose();
        }
      }}
    >
      <header className="workspace-heading">
        {dockHandle}
        <div>
          <span className="workspace-eyebrow">共享工作区</span>
          <h2>工作与审核</h2>
        </div>
        {onClose && (
          <button
            type="button"
            onClick={onClose}
            aria-label="关闭工作与审核面板"
          >
            ×
          </button>
        )}
      </header>
      <div className="workspace-summary">
        <div>
          <strong>{total}</strong>
          <span>工作事项</span>
        </div>
        <div>
          <strong>{needs}</strong>
          <span>需要处理</span>
        </div>
        <div>
          <strong>{findingRows.length}</strong>
          <span>工程判断</span>
        </div>
      </div>
      <div
        className="workspace-tabs"
        role="tablist"
        aria-label="工作区视图"
        onKeyDown={(e) => {
          if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(e.key))
            return;
          e.preventDefault();
          const next =
            e.key === "Home"
              ? "work"
              : e.key === "End"
                ? "agent"
                : tab === "work"
                  ? "agent"
                  : "work";
          setTab(next);
          document.getElementById(`workspace-${next}-tab`)?.focus();
        }}
      >
        <button
          type="button"
          role="tab"
          tabIndex={tab === "work" ? 0 : -1}
          id="workspace-work-tab"
          aria-controls="workspace-work-view"
          aria-selected={tab === "work"}
          onClick={() => setTab("work")}
        >
          工作事项
        </button>
        <button
          type="button"
          role="tab"
          tabIndex={tab === "agent" ? 0 : -1}
          id="workspace-agent-tab"
          aria-controls="workspace-agent-view"
          aria-selected={tab === "agent"}
          onClick={() => setTab("agent")}
        >
          代理
        </button>
      </div>
      <div
        id="workspace-agent-view"
        role="tabpanel"
        aria-labelledby="workspace-agent-tab"
        hidden={tab !== "agent"}
        className="workspace-agent-view"
      >
        {children}
      </div>
      <div
        id="workspace-work-view"
        role="tabpanel"
        aria-labelledby="workspace-work-tab"
        hidden={tab !== "work"}
        className="workspace-work-view"
      >
        <div className="workspace-filters">
          <label className="workspace-search">
            <span>查找工作</span>
            <input
              name="work-search"
              aria-label="搜索工作"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="名称、来源、专业或编号"
            />
          </label>
          <div className="workspace-filter-buttons" aria-label="筛选工作">
            {(
              [
                ["all", "全部"],
                ["needs", `待处理 · ${needs}`],
                ["done", "已处理"],
              ] as const
            ).map(([id, label]) => (
              <button
                type="button"
                key={id}
                aria-pressed={filter === id}
                onClick={() => setFilter(id)}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
        <div className="workspace-list" aria-label="工作事项">
          {findings.isPending && !total && (
            <p className="workspace-receipt-note" role="status">
              正在读取工程 Findings…
            </p>
          )}
          {findings.isError && (
            <WorkspaceInlineState
              alert
              title={`工程 Findings 不可用：${findings.error.message}`}
              action={
                <button
                  type="button"
                  disabled={findings.isFetching}
                  onClick={() => void findings.refetch()}
                >
                  重试读取 Findings
                </button>
              }
            />
          )}
          {!findings.isPending && !findings.isError && !total && (
            <div className="workspace-empty">
              <h3>还没有工作事项</h3>
              <p>当前项目尚无资料版本或工程判断可供检查。</p>
              <button type="button" onClick={actions.onProject}>
                打开项目 →
              </button>
            </div>
          )}
          {!shown.length && total > 0 && (
            <div className="workspace-empty">
              <p>没有匹配的工作事项。</p>
            </div>
          )}
          {shown.map((row) => {
            const finding = row.kind === "finding" ? row.item : undefined;
            const work = row.kind === "work" ? row.item : undefined;
            return (
              <button
                type="button"
                className="workspace-row"
                key={row.key}
                aria-pressed={activeKey === row.key}
                onClick={() => select(row)}
              >
                <span className="workspace-row-top">
                  <strong>{finding?.title ?? work?.title}</strong>
                  <span className="workspace-quantity">
                    {finding
                      ? findingStateLabels[finding.state]
                      : (work?.state ?? "")}
                  </span>
                </span>
                <span className="workspace-sheet">
                  {finding ? finding.what_changed : work?.context}
                </span>
                <span className="workspace-row-bottom">
                  <span>
                    {finding?.suggested_discipline ??
                      (finding?.id || work?.reason)}
                  </span>
                  <time>{finding?.updated_at?.slice(0, 10)}</time>
                </span>
              </button>
            );
          })}
          {rows.length > limit && (
            <button
              type="button"
              className="workspace-more"
              onClick={() => setLimit((value) => value + 50)}
            >
              显示更多 · 还剩 {rows.length - limit}
            </button>
          )}
        </div>
        {selectedFindingId &&
          !selected &&
          !findings.isPending &&
          !findings.isError &&
          !findingRows.some((item) => item.id === selectedFindingId) && (
            <WorkspaceInlineState title="工程判断已不在当前列表">
              请重新选择当前项目中的工程判断。
            </WorkspaceInlineState>
          )}
        {!selected && !selectedFindingId && total > 0 && (
          <WorkspaceInlineState title="选择一项工程判断">
            检查变更与依据，再作人工判断。
          </WorkspaceInlineState>
        )}
        {selected?.kind === "finding" && detail?.(selected.item.id)}
        {workDetail && (
          <section className="workspace-inspector" aria-label="所选工作事项">
            <div className="workspace-inspector-title">
              <h3>{workDetail.title}</h3>
              <strong>{workState}</strong>
            </div>
            <dl>
              <div>
                <dt>位置</dt>
                <dd>{location}</dd>
              </div>
              <div>
                <dt>为什么需要处理</dt>
                <dd>{workDetail.reason}</dd>
              </div>
              <div>
                <dt>当前判断</dt>
                <dd>
                  {comparison
                    ? `${comparison.changes.length} 个构件变化 · ${comparison.affected_work_packages.length} 个受影响工作包`
                    : workState}
                </dd>
              </div>
              {!!workDetail.evidence?.length && (
                <div>
                  <dt>判断依据</dt>
                  <dd>
                    {workDetail.evidence
                      .map((evidence) => evidence.id)
                      .join(" · ")}
                  </dd>
                </div>
              )}
            </dl>
            <p className="workspace-receipt-note">
              依据来自项目资料；当前判断不替代工程验证。
            </p>
            <div className="workspace-inspector-actions">
              <button
                type="button"
                className="workspace-primary"
                onClick={workDetail.open}
              >
                {workDetail.action}
              </button>
              {workDetail.sourceContext && (
                <button
                  type="button"
                  onClick={() =>
                    actions.onSource
                      ? actions.onSource(
                          workDetail.sourceContext!.source.source.id,
                        )
                      : actions.onModels()
                  }
                >
                  在项目中查看版本 →
                </button>
              )}
            </div>
          </section>
        )}
        <footer className="workspace-footer">
          <span>
            显示 {Math.min(limit, rows.length)} 项 · 共 {rows.length} 项匹配
          </span>
          <button type="button" onClick={actions.onReport}>
            打开报告 →
          </button>
        </footer>
      </div>
    </aside>
  );
}
