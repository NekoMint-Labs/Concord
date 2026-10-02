import { CircleAlert, CircleCheck, LoaderCircle } from "lucide-react";
import type { Workspace } from "../api/client";
import {
  activeCoordinationEvent,
  activeCoordinationRun,
} from "../app/coordination";
import { demoConstraintText } from "../ui/demo/demoPresentation";
import { proposalRejected } from "./proposalState";

/** Project the existing readiness precedence without changing domain state. */
export function coordinationProjection(
  workspace: Workspace,
  selected: string,
  pendingModel: boolean,
) {
  const wp = workspace.state.work_packages.find(
    (item) => item.id === selected,
  )!;
  const area = workspace.state.areas.find((item) => item.id === wp.area_id);
  const readiness = workspace.analysis?.readiness.find(
    (item) => item.work_package_id === selected,
  );
  const activeRun = activeCoordinationRun(workspace);
  const activeEvent = activeCoordinationEvent(workspace, selected);
  const constraints = (workspace.analysis?.constraints ?? []).filter(
    (item) => item.work_package_id === selected && item.blocking,
  );
  const proposal = workspace.proposals.find(
    (item) =>
      item.work_package_id === selected &&
      !proposalRejected(workspace, item.id),
  );
  const analysisOwner = workspace.analysis_run;
  const analyzing =
    (!!activeEvent &&
      !!activeRun &&
      ["QUEUED", "RUNNING"].includes(activeRun.status)) ||
    (!!analysisOwner &&
      ["QUEUED", "RUNNING"].includes(analysisOwner.status) &&
      workspace.proposals.some(
        (item) =>
          item.work_package_id === selected && item.run_id === analysisOwner.id,
      ));
  const waitingApproval =
    (activeRun?.status === "WAITING_APPROVAL" &&
      activeEvent?.work_package_id === selected) ||
    (analysisOwner?.status === "WAITING_APPROVAL" &&
      !!proposal &&
      proposal.run_id === analysisOwner.id &&
      proposal.generation === analysisOwner.generation);
  const blocked = readiness?.status === "BLOCKED" || !!waitingApproval;
  const stale = workspace.stale && !analyzing;
  const snapshot = workspace.analysis?.snapshot;
  const impactedIds = workspace.analysis?.impact.element_ids ?? [];
  const impactCount = wp.element_ids.filter((id) =>
    impactedIds.includes(id),
  ).length;
  const state = analyzing
    ? {
        label: "检查中",
        title: "正在重新核对施工条件",
        description: activeEvent?.change.revision
          ? `正在根据 ${activeEvent.change.revision} 评估最新工程事实。`
          : "正在汇集最新工程事实并重新判断。",
        icon: LoaderCircle,
        tone: "running",
      }
    : workspace.analysis_run?.status === "FAILED"
      ? {
          label: "检查失败",
          title: "未能完成施工条件检查",
          description: "请查看运行结果后重新检查，不能据此判断可施工。",
          icon: CircleAlert,
          tone: "stale",
        }
      : waitingApproval
        ? {
            label: "待批准",
            title: "处理建议需要明确批准",
            description: "查看问题、依据与风险，确认后才能执行。",
            icon: CircleAlert,
            tone: "blocked",
          }
        : pendingModel && !blocked && (workspace.stale || !readiness)
          ? {
              label: "待审核",
              title: "新模型版本尚未纳入当前基线",
              description:
                "查看变化与受影响构件；重新检查前，施工判断仍基于旧版本。",
              icon: CircleAlert,
              tone: "stale",
            }
          : blocked
            ? {
                label: "已阻塞",
                title: `${constraints.length || 1} 个未解决阻塞条件`,
                description: constraints[0]
                  ? demoConstraintText(
                      constraints[0].kind,
                      constraints[0].description,
                    )
                  : "存在尚未解决的施工约束。",
                icon: CircleAlert,
                tone: "blocked",
              }
            : !readiness
              ? {
                  label: "待检查",
                  title: "尚未确认施工条件",
                  description: "先上传模型、关联构件，再重新检查工作包。",
                  icon: CircleAlert,
                  tone: "stale",
                }
              : stale
                ? {
                    label: "需复核",
                    title: activeEvent
                      ? "工程变化可能影响当前工作包"
                      : "工程事实已变化，需要重新检查",
                    description: "当前判断基于较早快照，复核后再继续施工。",
                    icon: CircleAlert,
                    tone: "stale",
                  }
                : {
                    label: "可施工",
                    title: "当前没有未解决的阻塞条件",
                    description:
                      workspace.state.project.id === "harbor-east"
                        ? "图纸、班组或现场条件变化时，记录变更并重新检查。"
                        : "仅表示已记录条件没有阻塞，不代替现场核验或安全确认。资料基线需另行接受。",
                    icon: CircleCheck,
                    tone: "ready",
                  };

  return {
    wp,
    area,
    constraints,
    proposal,
    analyzing,
    blocked,
    snapshot,
    activeEvent,
    impactCount,
    state,
    showRecheck:
      !analyzing &&
      (!proposal ||
        !readiness ||
        stale ||
        workspace.analysis_run?.status === "FAILED") &&
      !pendingModel,
    showImpact: blocked || impactCount > 0 || analyzing || pendingModel,
  };
}

export type CoordinationProjection = ReturnType<typeof coordinationProjection>;
