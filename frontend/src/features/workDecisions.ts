import type {
  AgentRun,
  DTO,
  InvestigationReport,
  ProjectSourceStatus,
  Workspace,
} from "../api/client";
import { activeCoordinationRun } from "../app/coordination";
import {
  demoAreaName,
  demoConstraintText,
  demoDiscipline,
  demoInvestigationText,
  demoWorkPackageName,
} from "../ui/demo/demoPresentation";
import { proposalRejected } from "./proposalState";
import type { WorkSourceContext } from "./useWorkSourceContext";

export type WorkDecision = {
  key: string;
  title: string;
  reason: string;
  context: string;
  state: string;
  action: string;
  open: () => void;
  workPackageId?: string;
  sourceContext?: WorkSourceContext;
  report?: InvestigationReport;
  run?: AgentRun;
  findings?: DTO<"Finding">[];
  evidence?: DTO<"Evidence">[];
};

type DecisionActions = {
  onPackage: (id: string) => void;
  onModels: () => void;
  onRecheck: () => void;
  onReport: () => void;
  onInvestigate?: (input: {
    sourceId: string;
    revisionId: string;
    fromRevisionId?: string;
    elementIds?: string[];
    revisionLabel?: string;
    fromRevisionLabel?: string;
  }) => void;
  sourceContexts?: WorkSourceContext[];
  run?: AgentRun | null;
};

const revisionLabel = (
  source: WorkSourceContext,
  id: string | null | undefined,
) => {
  const revision = source.revisions.find((item) => item.id === id);
  return revision ? `R${revision.sequence}` : (id?.slice(0, 8) ?? "—");
};

const sourcePair = (source: WorkSourceContext) =>
  source.source.accepted_revision_id
    ? `${revisionLabel(source, source.source.accepted_revision_id)} → ${revisionLabel(source, source.source.latest_revision_id)}`
    : revisionLabel(source, source.source.latest_revision_id);

function sourceOpen(
  source: WorkSourceContext,
  actions: DecisionActions,
  fallback: () => void,
) {
  return actions.onInvestigate
    ? () => {
        actions.onInvestigate!({
          sourceId: source.source.source.id,
          revisionId: source.source.latest_revision_id!,
          fromRevisionId: source.source.accepted_revision_id ?? undefined,
          revisionLabel: revisionLabel(
            source,
            source.source.latest_revision_id,
          ),
          fromRevisionLabel: revisionLabel(
            source,
            source.source.accepted_revision_id,
          ),
          elementIds: source.comparison?.changes.map((item) => item.global_id),
        });
      }
    : fallback;
}

/** Project authoritative states into decisions; actions remain deferred until activation. */
export function buildWorkDecisions(
  workspace: Workspace,
  sources: ProjectSourceStatus[],
  report: InvestigationReport | null | undefined,
  actions: DecisionActions,
) {
  const needs: WorkDecision[] = [];
  const waiting: WorkDecision[] = [];
  const completed: WorkDecision[] = [];
  const sourceContexts = actions.sourceContexts ?? [];
  const run = activeCoordinationRun(workspace);
  for (const source of sourceContexts.filter(
    (entry) => entry.source.has_pending_revision,
  )) {
    const comparison = source.comparison;
    const affected = comparison?.affected_work_packages ?? [];
    needs.push({
      key: source.source.source.id,
      title: `${source.source.source.name} 有新版本`,
      reason: "当前基线未变；先核对模型变化及受影响范围。",
      context: `${sourcePair(source)}${affected.length ? ` · 影响 ${affected.length} 个工作包` : ""}`,
      state: "待审核",
      action: "处理新版本",
      open: sourceOpen(source, actions, actions.onModels),
      sourceContext: source,
    });
  }
  // Keep a source row even while its comparison is loading; the row is a pending
  // source state, not a made-up impact count or a BLOCKED work package.
  for (const source of sources.filter(
    (entry) =>
      entry.source.kind === "BIM" &&
      entry.has_pending_revision &&
      !sourceContexts.some((item) => item.source.source.id === entry.source.id),
  )) {
    needs.push({
      key: entryKey(source.source.id),
      title: `${source.source.name} 有新版本`,
      reason: "当前基线未变；先核对模型变化及受影响范围。",
      context: "项目模型 · 比较详情加载中",
      state: "待审核",
      action: "处理新版本",
      open: actions.onModels,
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
    const owner = proposal
      ? [workspace.analysis_run, workspace.run].find(
          (candidate) =>
            candidate?.id === proposal.run_id &&
            candidate.project_id === workspace.state.project.id,
        )
      : undefined;
    const currentProposal =
      !!proposal &&
      !proposalRejected(workspace, proposal.id) &&
      !!owner &&
      proposal.generation === owner.generation &&
      owner.status === "WAITING_APPROVAL";
    const area = workspace.state.areas.find((item) => item.id === wp.area_id);
    const context = `${demoAreaName(wp.area_id, area?.name ?? wp.area_id)} · ${demoDiscipline(wp.discipline)}`;
    const wpSource = sourceContexts.find((item) =>
      item.comparison?.affected_work_packages.some(
        (affected) => affected.work_package_id === wp.id,
      ),
    );
    const row = (
      title: string,
      reason: string,
      state: string,
      action: string,
      open = () => actions.onPackage(wp.id),
    ): WorkDecision => ({
      key: wp.id,
      workPackageId: wp.id,
      title,
      reason,
      context: wpSource
        ? `${context} · ${wpSource.source.source.name} · ${sourcePair(wpSource)}`
        : context,
      state,
      action,
      open,
      sourceContext: wpSource,
      run: owner ?? undefined,
      findings: report?.scope.work_package_ids.includes(wp.id) ? [] : undefined,
      evidence: report?.scope.work_package_ids.includes(wp.id)
        ? report.evidence
        : undefined,
    });
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
          actions.onRecheck,
        ),
      );
    } else if (
      currentProposal &&
      (readiness?.status === "BLOCKED" || owner?.status === "WAITING_APPROVAL")
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
          demoWorkPackageName(wp.id, wp.name),
          sources.some((source) => source.has_pending_revision)
            ? "基于当前基线的判断；新版本仍待审核。"
            : "当前检查没有未解决的阻塞条件。",
          "可施工",
          "查看详情",
        ),
      );
    }
  }
  for (const audit of workspace.audit.filter(
    (record) => record.action === "ACTION_PROPOSAL_REJECTED",
  )) {
    const wp = workspace.state.work_packages.find(
      (item) => item.id === audit.detail.work_package_id,
    );
    if (!wp) continue;
    completed.push({
      key: `rejected:${audit.id}`,
      title: `${demoWorkPackageName(wp.id, wp.name)} 的方案已拒绝`,
      reason: "此方案不会执行；既有阻塞事实保持不变。",
      state: "已拒绝",
      context: demoWorkPackageName(wp.id, wp.name),
      action: "查看工作包",
      workPackageId: wp.id,
      open: () => actions.onPackage(wp.id),
    });
  }
  const reportSource = sourceContexts.find(
    (source) => source.source.source.id === report?.scope.source_id,
  );
  if (
    report?.persisted &&
    (!actions.run ||
      (report.run_id === actions.run.id &&
        report.generation === actions.run.generation &&
        report.analysis_id === actions.run.analysis_id))
  ) {
    completed.unshift({
      key: report.run_id,
      title: "Concord 已完成调查",
      reason: demoInvestigationText(report.answer.summary),
      context: `${reportSource?.source.source.name ?? "项目调查"}${reportSource ? ` · ${sourcePair(reportSource)}` : ""}${report.scope.work_package_ids.length ? ` · ${report.scope.work_package_ids.length} 个工作包` : ""}`,
      state: "已完成",
      action: "查看调查依据",
      open: actions.onReport,
      report,
      sourceContext: reportSource,
      evidence: report.evidence,
    });
  }

  return { needs, waiting, completed };
}

function entryKey(sourceId: string) {
  return `source:${sourceId}`;
}
