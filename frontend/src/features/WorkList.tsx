import type {
  InvestigationReport,
  ProjectSourceStatus,
  Workspace,
} from "../api/client";
import { Button } from "../components/ui/button";
import { activeCoordinationRun } from "../app/coordination";
import {
  demoAreaName,
  demoConstraintText,
  demoInvestigationText,
  demoWorkPackageName,
} from "../ui/demo/demoPresentation";

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
}: {
  workspace: Workspace;
  sources: ProjectSourceStatus[];
  report?: InvestigationReport | null;
  onPackage: (id: string) => void;
  onModels: () => void;
  onRecheck: () => void;
  onReport: () => void;
  onProject: () => void;
}) {
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
  return (
    <section className="work-list" aria-label="工作">
      <header>
        <span className="eyebrow">当前项目</span>
        <h1>工作</h1>
        <p>先处理需要决定的事项；模型、依据和历史可在详情中查看。</p>
      </header>
      {sections.map(([label, rows]) => (
        <section key={label} aria-label={label}>
          <h2>
            {label} <span className="count">{rows.length}</span>
          </h2>
          {rows.length ? (
            <div className="work-rows">
              {rows.map((item) => (
                <article
                  key={item.key}
                  className="work-row"
                  data-work-key={item.key}
                >
                  <div>
                    <strong>{item.title}</strong>
                    <p>{item.reason}</p>
                    <small>
                      {item.context} · {item.state}
                    </small>
                  </div>
                  <Button size="sm" variant="secondary" onClick={item.open}>
                    {item.action} →
                  </Button>
                </article>
              ))}
            </div>
          ) : (
            <p className="quiet-message">
              {label === "需要处理"
                ? "当前没有需要立即处理的事项。"
                : "暂无记录。"}
            </p>
          )}
        </section>
      ))}
      {!workspace.state.work_packages.length && !sources.length && (
        <Button onClick={onProject}>设置项目与工作包 →</Button>
      )}
    </section>
  );
}
