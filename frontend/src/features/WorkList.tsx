import { useEffect, useMemo, useState } from "react";
import { Button } from "../components/ui/button";
import { AppDisclosure } from "../components/ui/AppDisclosure";
import { WorkspaceInlineState } from "../components/WorkspaceInlineState";
import {
  ThatOpenPanel,
  ThatOpenTextInput,
  ThatOpenTabs,
  ThatOpenTab,
} from "../components/ThatOpenUI";
import type {
  AgentRun,
  InvestigationReport,
  ProjectSourceStatus,
  Workspace,
} from "../api/client";
import type { WorkspaceTab } from "../app/destinations";
import { buildWorkDecisions, type WorkDecision } from "./workDecisions";
import { useWorkSourceContext } from "./useWorkSourceContext";
import { useEngineeringFindings } from "./useEngineeringFindings";
import { findingStateLabels } from "./FindingWorkbench";
import { demoAreaName } from "../ui/demo/demoPresentation";
import { statusLabel } from "../ui/labels";

/** The single Work list. Findings and project decisions share query, filter, paging and selection. */
export function WorkList({
  workspace,
  sources,
  report,
  onPackage,
  onModels,
  onRecheck,
  onReport,
  onProject,
  onTab: _onTab,
  onInvestigate,
  run,
  onSource,
  selectedFindingId = "",
  onFindingSelect,
}: {
  workspace: Workspace;
  sources: ProjectSourceStatus[];
  report?: InvestigationReport | null;
  onPackage: (id: string) => void;
  onModels: () => void;
  onRecheck: () => void;
  onReport: () => void;
  onProject: () => void;
  onTab: (tab: WorkspaceTab) => void;
  onInvestigate?: (input: {
    sourceId: string;
    revisionId: string;
    fromRevisionId?: string;
    elementIds?: string[];
    revisionLabel?: string;
    fromRevisionLabel?: string;
  }) => void;
  run?: AgentRun | null;
  onSource?: (sourceId: string) => void;
  selectedFindingId?: string;
  onFindingSelect?: (id: string) => void;
}) {
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<"all" | "needs" | "done">("all");
  const [limit, setLimit] = useState(50);
  const [selectedKey, setSelectedKey] = useState("");
  const sourceContexts = useWorkSourceContext(
    workspace.state.project.id,
    sources,
  );
  const findings = useEngineeringFindings(workspace.state.project.id);
  const decisions = buildWorkDecisions(workspace, sources, report, {
    onPackage,
    onModels,
    onRecheck,
    onReport,
    onInvestigate,
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
    findingRows.filter((finding) => finding.state === "PROPOSED").length;
  const matches = (value: string) =>
    value.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase());
  const rows = useMemo(() => {
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
            ? item.state === "PROPOSED"
            : item.state !== "PROPOSED"),
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

  const select = (row: (typeof rows)[number]) => {
    setSelectedKey(row.key);
    if (row.kind === "finding") onFindingSelect?.(row.item.id);
    else if (selectedFindingId) onFindingSelect?.("");
  };
  const stateFor = (item: WorkDecision) => item.state;
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
    <section className="work-list" aria-label="工作">
      <ThatOpenPanel className="work-queue-surface" headerHidden>
        <div className="work-queue">
          <header className="workspace-heading work-queue-head">
            <div>
              <span className="workspace-eyebrow">共享工作区</span>
              <h1>工作</h1>
              <p>
                {needs
                  ? `${needs} 项需要你决定 · 共 ${total} 项`
                  : total
                    ? `当前项目工作与工程判断 · 共 ${total} 项`
                    : "工作事项来自项目资料、工作包与工程判断"}
              </p>
            </div>
          </header>
          <div className="workspace-summary" aria-label="工作摘要">
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
          <div className="workspace-filters">
            <div className="workspace-search">
              <ThatOpenTextInput
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                aria-label="搜索工作"
                placeholder="名称、来源、专业或编号"
              />
            </div>
            <ThatOpenTabs
              className="workspace-tabs"
              label="筛选工作"
              tab={filter}
              onTabChange={(next) => {
                if (next === "all" || next === "needs" || next === "done")
                  setFilter(next);
              }}
            >
              <ThatOpenTab name="all" label="全部" />
              <ThatOpenTab name="needs" label={`待处理 · ${needs}`} />
              <ThatOpenTab name="done" label="已处理" />
            </ThatOpenTabs>
          </div>
          <div className="workspace-list" aria-label="工作事项">
            {findings.isPending && <p role="status">正在读取工程 Findings…</p>}
            {findings.isError && (
              <WorkspaceInlineState
                alert
                title={`工程 Findings 不可用：${findings.error.message}`}
                action={
                  <Button
                    disabled={findings.isFetching}
                    onClick={() => void findings.refetch()}
                  >
                    重试读取 Findings
                  </Button>
                }
              />
            )}
            {!findings.isPending && !findings.isError && !total && (
              <div className="workspace-empty">
                <h2>还没有工作事项</h2>
                <p>当前项目尚无资料版本或工程判断可供检查。</p>
                <Button size="sm" onClick={onProject}>
                  打开项目 →
                </Button>
              </div>
            )}
            {!shown.length && total > 0 && (
              <p className="quiet-message">没有匹配的工作事项。</p>
            )}
            {shown.map((row) => {
              const finding = row.kind === "finding" ? row.item : undefined;
              const work = row.kind === "work" ? row.item : undefined;
              return (
                <div
                  className={`workspace-row${activeKey === row.key ? " is-selected" : ""}`}
                  key={row.key}
                >
                  <span className="workspace-row-top">
                    <Button
                      variant="ghost"
                      aria-pressed={activeKey === row.key}
                      onClick={() => select(row)}
                    >
                      {finding?.title ?? work?.title}
                    </Button>
                    <small>
                      {finding
                        ? findingStateLabels[finding.state]
                        : stateFor(work!)}
                    </small>
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
                </div>
              );
            })}
            {rows.length > limit && (
              <Button
                variant="ghost"
                className="workspace-more"
                onClick={() => setLimit((value) => value + 50)}
              >
                显示更多 · 还剩 {rows.length - limit}
              </Button>
            )}
          </div>
          {workDetail && (
            <section className="workspace-inspector" aria-label="所选工作事项">
              <div className="workspace-inspector-title">
                <span className="workspace-eyebrow">当前事项</span>
                <h2>{workDetail.title}</h2>
                <p>
                  {location} · {workState}
                </p>
              </div>
              <section
                className="work-peek-section"
                aria-label="为什么需要处理"
              >
                <h3>为什么需要处理</h3>
                <p>{workDetail.reason}</p>
              </section>
              <section className="work-peek-section" aria-label="当前判断">
                <h3>当前判断</h3>
                {comparison ? (
                  <p>
                    {comparison.changes.length} 个构件变化 ·{" "}
                    {comparison.affected_work_packages.length} 个受影响工作包
                  </p>
                ) : (
                  <p>{workState}</p>
                )}
                {workDetail.evidence?.length ? (
                  <AppDisclosure
                    label={`判断依据 · ${workDetail.evidence.length}`}
                  >
                    <ul className="work-model-list">
                      {workDetail.evidence.map((evidence) => (
                        <li key={evidence.id}>
                          <strong>{evidence.source_id}</strong>
                          <span>{evidence.fact}</span>
                          <span>
                            {evidence.source_revision} ·{" "}
                            {evidence.location ?? "无位置"}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </AppDisclosure>
                ) : null}
              </section>
              <section className="work-peek-section" aria-label="下一步">
                <h3>下一步</h3>
                <Button onClick={workDetail.open}>{workDetail.action}</Button>
                {workDetail.sourceContext && (
                  <Button
                    variant="ghost"
                    onClick={() =>
                      onSource
                        ? onSource(workDetail.sourceContext!.source.source.id)
                        : onModels()
                    }
                  >
                    在项目中查看版本 →
                  </Button>
                )}
              </section>
            </section>
          )}
          <footer className="workspace-footer">
            <span>
              显示 {Math.min(limit, rows.length)} 项 · 共 {rows.length} 项匹配
            </span>
            <Button variant="ghost" onClick={onReport}>
              打开报告 →
            </Button>
          </footer>
        </div>
      </ThatOpenPanel>
    </section>
  );
}
