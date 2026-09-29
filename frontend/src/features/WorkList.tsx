import { useState } from "react";
import { Search } from "lucide-react";
import type {
  InvestigationReport,
  ProjectSourceStatus,
  Workspace,
} from "../api/client";
import { Button } from "../components/ui/button";
import { activeCoordinationRun } from "../app/coordination";
import { useProjectContext } from "../app/useProjectContext";
import type { WorkspaceTab } from "../app/destinations";
import {
  demoAreaName,
  demoConstraintText,
  demoDiscipline,
  demoInvestigationText,
  demoWorkPackageName,
} from "../ui/demo/demoPresentation";
import { statusLabel, statusTone, shortDate } from "../ui/labels";

type WorkRow = {
  key: string;
  title: string;
  reason: string;
  context: string;
  state: string;
  action: string;
  open: () => void;
};

/** A queue of authoritative states, not a synthetic issue lifecycle. */
export function WorkList({
  workspace,
  sources,
  report,
  onPackage,
  onModels,
  onRecheck,
  onReport,
  onProject,
  onTab,
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
}) {
  const [showAllDone, setShowAllDone] = useState(false);
  const [query, setQuery] = useState("");
  const projectId = workspace.state.project.id;
  const { baseline, documents, models, revisionNo, pendingModels } =
    useProjectContext(projectId, sources);
  const needs: WorkRow[] = [];
  const waiting: WorkRow[] = [];
  const completed: WorkRow[] = [];
  const run = activeCoordinationRun(workspace);
  for (const source of sources.filter(
    (entry) => entry.source.kind === "BIM" && entry.has_pending_revision,
  )) {
    needs.push({
      key: source.source.id,
      title: `${source.source.name} 有新版本`,
      reason: "当前基线未变；先核对模型变化及受影响范围。",
      context: "项目模型",
      state: "待审核",
      action: "处理新版本",
      open: onModels,
    });
  }
  for (const wp of workspace.state.work_packages) {
    const readiness = workspace.analysis?.readiness.find(
      (item) => item.work_package_id === wp.id,
    );
    const constraints =
      workspace.analysis?.constraints.filter(
        (item) => item.work_package_id === wp.id && item.blocking,
      ) ?? [];
    const checking =
      run &&
      ["QUEUED", "RUNNING"].includes(run.status) &&
      workspace.events.some(
        (event) => event.id === run.event_id && event.work_package_id === wp.id,
      );
    const proposal = workspace.proposals.find(
      (item) => item.work_package_id === wp.id,
    );
    const area = workspace.state.areas.find((item) => item.id === wp.area_id);
    const context = `${demoAreaName(wp.area_id, area?.name ?? wp.area_id)} · ${demoWorkPackageName(wp.id, wp.name)}`;
    const row = (
      title: string,
      reason: string,
      state: string,
      action: string,
      open = () => onPackage(wp.id),
    ): WorkRow => ({ key: wp.id, title, reason, context, state, action, open });
    if (
      (workspace.stale || workspace.analysis_run?.status === "FAILED") &&
      !checking
    ) {
      needs.push(
        row(
          `${demoWorkPackageName(wp.id, wp.name)} 需要重新检查`,
          "当前施工判断不是最新结果，不能据此继续施工。",
          "需复核",
          "重新检查",
          onRecheck,
        ),
      );
    } else if (
      proposal &&
      (readiness?.status === "BLOCKED" || run?.status === "WAITING_APPROVAL")
    ) {
      needs.push(
        row(
          `${demoWorkPackageName(wp.id, wp.name)} 需要决定`,
          constraints[0]
            ? demoConstraintText(
                constraints[0].kind,
                constraints[0].description,
              )
            : "处理建议需要明确批准，批准前不会执行。",
          "待批准",
          "处理",
        ),
      );
    } else if (readiness?.status === "BLOCKED" && !workspace.stale) {
      needs.push(
        row(
          `${demoWorkPackageName(wp.id, wp.name)} 暂不能施工`,
          constraints[0]
            ? demoConstraintText(
                constraints[0].kind,
                constraints[0].description,
              )
            : "存在尚未解决的施工条件。",
          "已阻塞",
          "查看原因",
        ),
      );
    } else if (checking) {
      waiting.push(
        row(
          `${demoWorkPackageName(wp.id, wp.name)} 正在检查`,
          "Concord 正在核对最新工程事实。",
          "检查中",
          "查看进度",
        ),
      );
    } else if (!readiness) {
      waiting.push(
        row(
          `${demoWorkPackageName(wp.id, wp.name)} 尚未检查`,
          "关联模型并确认工程事实后，可检查施工条件。",
          "待检查",
          "查看工作包",
        ),
      );
    } else if (readiness.status === "READY") {
      completed.push(
        row(
          `${demoWorkPackageName(wp.id, wp.name)} 可施工`,
          sources.some((source) => source.has_pending_revision)
            ? "基于当前基线的判断；新版本仍待审核。"
            : "当前检查没有未解决的阻塞条件。",
          "可施工",
          "查看详情",
        ),
      );
    }
  }
  const reportSource = sources.find(
    (source) => source.source.id === report?.scope.source_id,
  );
  const historicalReport =
    !!report?.scope.to_revision_id &&
    !!reportSource?.latest_revision_id &&
    report.scope.to_revision_id !== reportSource.latest_revision_id;
  if (report?.persisted)
    completed.unshift({
      key: report.run_id,
      title: historicalReport ? "Concord 的旧版本调查" : "Concord 已完成调查",
      reason: historicalReport
        ? "模型已有新版本；这份调查不代表当前版本。"
        : demoInvestigationText(report.answer.summary),
      context: report.scope.work_package_ids.length ? "相关工作包" : "项目模型",
      state: "已完成",
      action: "查看调查依据",
      open: onReport,
    });
  const sections = [
    ["需要处理", needs],
    ["等待中", waiting],
    ["最近完成", completed],
  ] as const;
  const tone = {
    需要处理: "attention",
    等待中: "waiting",
    最近完成: "done",
  } as const;
  const matches = (item: WorkRow) =>
    `${item.title} ${item.reason} ${item.context}`
      .toLocaleLowerCase()
      .includes(query.trim().toLocaleLowerCase());
  /* One row grammar for every section: state mark, what + why + where, state,
     action. Two lines, because the title is what the reader is deciding about and
     the reason is why - side by side they were a single whispered line. Exactly
     one row on the page carries a bordered action: the first thing to do. */
  const next = needs.find(matches)?.key;
  const renderRow = (item: WorkRow, label: keyof typeof tone) => (
    <article
      key={item.key}
      className={`work-row is-${tone[label]}${item.key === next ? " is-next" : ""}`}
      data-work-key={item.key}
    >
      <i className="work-mark" aria-hidden="true" />
      <strong className="work-title">{item.title}</strong>
      <p className="work-reason">
        {item.reason}
        <small className="work-context">{item.context}</small>
      </p>
      <span className="work-state">{item.state}</span>
      <Button
        size="sm"
        variant={item.key === next ? "secondary" : "ghost"}
        onClick={item.open}
      >
        {item.action} →
      </Button>
    </article>
  );
  const total = needs.length + waiting.length + completed.length;
  const packages = workspace.state.work_packages;
  const readiness = (id: string) =>
    workspace.analysis?.readiness.find((item) => item.work_package_id === id)
      ?.status ?? "UNCHECKED";
  const blocked = packages.filter(
    (item) => readiness(item.id) === "BLOCKED",
  ).length;
  const judgement = workspace.stale
    ? "需要重新检查"
    : workspace.analysis_run?.status === "FAILED"
      ? "检查未完成"
      : workspace.analysis
        ? "已核对当前基线"
        : "尚未检查";
  return (
    <section className="work-list" aria-label="工作">
      <header>
        <h1>工作</h1>
        <p>
          {needs.length ? (
            <>
              <strong>{needs.length} 项需要你决定</strong>
              <span>共 {total} 项</span>
            </>
          ) : (
            "当前没有需要立即处理的事项"
          )}
        </p>
        <label className="work-search">
          <Search size={14} />
          <span className="sr-only">搜索工作事项</span>
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="搜索工作事项"
          />
        </label>
      </header>
      {sections.map(([label, rows]) => {
        const visible = rows.filter(matches);
        // A group with nothing in it is a heading about an absence: the header
        // summary already states the count, so the group itself is dropped.
        if (!visible.length && !query) return null;
        const collapsed = label === "最近完成" && !showAllDone && !query;
        const shown = collapsed ? visible.slice(0, 3) : visible;
        return (
          <section
            key={label}
            aria-label={label}
            className={`work-group is-${tone[label]}`}
          >
            <h2>
              {label} <span>{visible.length}</span>
            </h2>
            {shown.length ? (
              <div className="work-rows">
                {shown.map((item) => renderRow(item, label))}
              </div>
            ) : (
              <p className="quiet-message">
                {query
                  ? "没有匹配的工作事项。"
                  : label === "需要处理"
                    ? "当前没有需要立即处理的事项。"
                    : label === "等待中"
                      ? "没有正在检查或等待条件的工作包。"
                      : "暂无记录。"}
              </p>
            )}
            {collapsed && visible.length > 3 && (
              <button
                type="button"
                className="work-more"
                onClick={() => setShowAllDone(true)}
              >
                显示全部 {visible.length} 项
              </button>
            )}
          </section>
        );
      })}
      {/*
       * The queue's context.
       *
       * The page above this point answers "what is waiting on me". Below it,
       * the same page states the standing facts those decisions are read
       * against - the baseline in force, the model revision still waiting on
       * review, whether the recorded judgement is still current, and the work
       * packages the queue is about. Every value here already exists in the
       * workspace payload or in a query the header and 项目 already make, so
       * this is the page using its own context rather than a new surface.
       *
       * It is deliberately flat: the same section-heading tier as the groups
       * above, hairline rows, no container and no figures. Secondary context
       * must not compete with an open decision, which is why the heading drops
       * the state dot the decision groups carry.
       */}
      {!!packages.length && (
        <div className="work-standing">
          <section className="work-group is-context" aria-label="项目现状">
            <h2>项目现状</h2>
            <dl className="work-standing-facts">
              <div>
                <dt>当前基线</dt>
                <dd>
                  {baseline ? (
                    <button type="button" onClick={() => onTab("history")}>
                      <span className="mono">B{baseline.sequence}</span>
                      <small>{shortDate(baseline.created_at)} 已确认</small>
                    </button>
                  ) : (
                    <span className="quiet">尚未确认</span>
                  )}
                </dd>
              </div>
              <div>
                <dt>待审核模型</dt>
                <dd>
                  {pendingModels.length ? (
                    <button type="button" onClick={() => onTab("sources")}>
                      {pendingModels.map((item, index) => (
                        <span key={item.source.id}>
                          {item.source.name}
                          <small>
                            {revisionNo(
                              models.indexOf(item),
                              item.latest_revision_id,
                            )}
                          </small>
                        </span>
                      ))}
                    </button>
                  ) : (
                    <span className="quiet">没有待审核的模型</span>
                  )}
                </dd>
              </div>
              <div>
                <dt>判断状态</dt>
                <dd>
                  <span className={workspace.stale ? "is-attention" : ""}>
                    {judgement}
                  </span>
                </dd>
              </div>
              <div>
                <dt>项目文件</dt>
                <dd>
                  <button type="button" onClick={() => onTab("documents")}>
                    {documents.length
                      ? `${documents.length} 个项目文件`
                      : "还没有项目文件"}
                  </button>
                </dd>
              </div>
            </dl>
          </section>
          <section className="work-group is-context" aria-label="工作包状态">
            <h2>
              工作包 <span>{packages.length}</span>
              <button type="button" onClick={() => onTab("work-packages")}>
                {blocked ? `${blocked} 个受阻 · 全部 →` : "全部 →"}
              </button>
            </h2>
            <ul className="work-standing-packages">
              {packages.map((item) => {
                const status = readiness(item.id);
                const area = workspace.state.areas.find(
                  (entry) => entry.id === item.area_id,
                );
                return (
                  <li key={item.id}>
                    <button type="button" onClick={() => onPackage(item.id)}>
                      <strong>{demoWorkPackageName(item.id, item.name)}</strong>
                      <small>
                        {demoAreaName(item.area_id, area?.name ?? item.area_id)}
                        {" · "}
                        {demoDiscipline(item.discipline)}
                      </small>
                    </button>
                    <span className={`package-status is-${statusTone(status)}`}>
                      <i aria-hidden="true" />
                      {statusLabel(status)}
                    </span>
                  </li>
                );
              })}
            </ul>
          </section>
        </div>
      )}
      {!workspace.state.work_packages.length && !sources.length && (
        <Button onClick={onProject}>设置项目与工作包 →</Button>
      )}
    </section>
  );
}
