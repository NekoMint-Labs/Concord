import type { FixtureEvidence } from "./finding";

// UI samples only, aligned with unmerged #19 (c108e95). Not canonical ReCheck DTOs,
// capability results, source uploads, or a substitute for A's closure authority.
export const recheckScenarios = {
  unavailable: {
    label: "能力缺失 / NEEDS_REVIEW",
    outcome: "NEEDS_REVIEW",
    explanation:
      "样本能力未注册，未验证几何或碰撞。检查结束也不等于问题已解决。",
  },
  resolved: {
    label: "全部依赖已验证 / RESOLVED",
    outcome: "RESOLVED",
    explanation:
      "样本中风管几何已调整、结构梁未变，碰撞已复跑且原碰撞不存在；仍需人工决定是否关闭。",
  },
  open: {
    label: "问题仍存在 / STILL_OPEN",
    outcome: "STILL_OPEN",
    explanation: "样本已复跑碰撞检查，梁与风管仍重叠，不能关闭。",
  },
  changed: {
    label: "问题发生变化 / CHANGED",
    outcome: "CHANGED",
    explanation:
      "样本中的碰撞位置与受影响范围发生变化，需要重新评估，不能沿用原判断关闭。",
  },
  partial: {
    label: "缺少结构依赖验证 / NEEDS_REVIEW",
    outcome: "NEEDS_REVIEW",
    explanation:
      "机电样本为 RESOLVED，但结构依赖尚未检查。单个源的已解决结果不能代表全部依赖。",
  },
  stale: {
    label: "旧版本的已解决样本",
    outcome: "RESOLVED",
    explanation: "这是旧机电版本上的已解决样本，不适用于当前版本。",
  },
} as const;
export type FixtureRecheckScenario = keyof typeof recheckScenarios;

export function recheckFixture(
  scenario: FixtureRecheckScenario,
  revision: number,
) {
  const sample = recheckScenarios[scenario];
  const mechanicalResolved = ["resolved", "partial", "stale"].includes(
    scenario,
  );
  const structuralResolved = ["resolved", "stale", "open", "changed"].includes(
    scenario,
  );
  const checks = [
    {
      source: "机电模型",
      revision: `R${revision}`,
      verified: mechanicalResolved,
      outcome: mechanicalResolved ? "RESOLVED" : sample.outcome,
      facts:
        scenario === "unavailable"
          ? ["几何与碰撞：未验证，能力缺失"]
          : scenario === "open"
            ? ["碰撞已复跑，原碰撞仍存在"]
            : scenario === "changed"
              ? ["碰撞已复跑，位置与范围发生变化"]
              : ["风管 M-038 几何已调整", "碰撞已复跑，原碰撞不存在"],
      evidence:
        scenario === "unavailable"
          ? null
          : ({
              id: `fixture-recheck-${scenario}-mep-r${revision}`,
              quality: "structured",
              label: "MEP recheck sample",
              title: `机电 R${revision} 复核依据 · ${mechanicalResolved ? "原碰撞不存在" : sample.outcome}（样本）`,
              source: `机电模型 · R${revision}（复核样本）`,
              method: "几何 / 碰撞复核样本 · 非真实检测",
              target: {
                kind: "bim",
                source_revision_id: `fixture-mep-r${revision}`,
                global_ids: ["fixture-globalid-M038"],
              },
            } satisfies FixtureEvidence | null),
    },
    {
      source: "结构模型",
      revision: "R2",
      verified: structuralResolved,
      outcome: structuralResolved ? "RESOLVED" : "NEEDS_REVIEW",
      facts: structuralResolved
        ? ["梁 B-142 几何未变", "当前结构依赖已检查"]
        : ["结构依赖尚未验证"],
      evidence: structuralResolved
        ? ({
            id: `fixture-recheck-${scenario}-structure-r2-mep-r${revision}`,
            quality: "structured",
            label: "Structure recheck sample",
            title: "结构 R2 复核依据 · 梁未变（样本）",
            source: "结构模型 · R2（复核样本）",
            method: "几何复核样本 · 非真实检测",
            target: {
              kind: "bim",
              source_revision_id: "fixture-structure-r2",
              global_ids: ["fixture-globalid-B142"],
            },
          } satisfies FixtureEvidence)
        : null,
    },
  ];
  return { ...sample, checks };
}
