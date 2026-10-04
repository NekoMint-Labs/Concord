import { Box, FileText, Scan } from "lucide-react";
import { motion } from "motion/react";
import type { DTO } from "../api/client";
import { useMotion } from "../motion";
import { icon } from "../components/ui/icon";
import { Button } from "../components/ui/button";
import { WorkspaceInlineState } from "../components/WorkspaceInlineState";
import { ThatOpenPanel } from "../components/ThatOpenUI";

export type Evidence = DTO<"Evidence">;
export type TargetSurface = "drawing" | "model" | "document";

export const qualityLabels = {
  structured: "结构化 · 已验证",
  extracted: "提取 · 来源内容",
  inferred: "推断 · 未验证",
} as const;

export function targetSurface(
  target: Evidence["viewer_target"],
): TargetSurface | null {
  switch (target?.kind) {
    case "drawing":
    case "cad":
      return "drawing";
    case "bim":
      return "model";
    case "document":
      return "document";
    default:
      return null;
  }
}

export function evidenceLabel(evidence: Pick<Evidence, "fact">): string {
  return evidence.fact.trim() || "工程依据";
}

export function targetLabel(target: Evidence["viewer_target"]): string {
  if (!target) return "未提供精确定位目标";
  switch (target.kind) {
    case "drawing":
      return `图纸 · 第 ${target.page} 页${target.normalized_bbox ? " · 已提供区域" : ""}`;
    case "cad":
      return `CAD · ${target.layer || "未提供图层"} · Entity ${target.entity_id || "未提供"}`;
    case "bim":
      return `BIM · 元素 ${target.global_ids?.length ?? 0} 个`;
    case "document":
      return `文档 · ${target.page == null ? "未提供页码" : `第 ${target.page} 页`}${target.structural_path?.length ? ` · ${target.structural_path.join(" / ")}` : ""}`;
    default:
      return "工程定位目标";
  }
}

const hostNames = {
  drawing: "图纸 / CAD",
  model: "BIM 模型",
  document: "工程文档",
};
const boundaryMessages = {
  missing_viewer_target:
    "没有精确定位目标；保留证据，不从旧版页码或位置推断目标。",
  revision_unavailable: "目标来源版本不可用；保留原始定位，不跳转到最新版本。",
  target_unsupported: "暂不支持此定位目标；保留原始目标，不猜测产品视图。",
  viewer_unavailable: "查看器暂不可用；证据保持选中，尚未执行定位。",
};

/** Product host seam only. Canonical provenance stays available, but secondary. */
export function EvidenceWorkspaceHost({
  evidence,
  stale = false,
  revisionAvailable,
  revisions = [],
  sources,
}: {
  evidence: Evidence;
  stale?: boolean;
  revisionAvailable?: boolean;
  revisions?: DTO<"ProjectSourceRevision">[];
  sources?: DTO<"ProjectSourceStatus">[];
}) {
  const source = sources?.find(
    (item) => item.source.id === evidence.source_id,
  )?.source;
  const sourceName = source?.name || "来源名称未提供";
  const revisionName = (id?: string | null) => {
    const revision = revisions.find((item) => item.id === id);
    return revision
      ? `R${revision.sequence}${revision.external_label ? ` · ${revision.external_label}` : ""}`
      : "版本名称未提供";
  };
  const target = evidence.viewer_target;
  const surface = targetSurface(target);
  const boundaryState = !target
    ? "missing_viewer_target"
    : !surface
      ? "target_unsupported"
      : !target.source_revision_id || revisionAvailable === false
        ? "revision_unavailable"
        : "viewer_unavailable";
  const { variants, transition } = useMotion();
  const HostIcon =
    surface === "model" ? Box : surface === "drawing" ? Scan : FileText;
  const hostName = surface ? hostNames[surface] : "工程依据";
  const targetDetails = target
    ? [
        ["定位目标", targetLabel(target)],
        ["目标来源版本", revisionName(target.source_revision_id)],
        ...(target.kind === "drawing"
          ? [
              ["图纸页码", `第 ${target.page} 页`],
              ["区域", target.normalized_bbox?.join(" · ") ?? "未提供"],
            ]
          : []),
        ...(target.kind === "cad"
          ? [
              ["实体", target.entity_id || "未提供"],
              ["图层", target.layer || "未提供"],
              ["视图范围", target.view_bounds?.join(" · ") ?? "未提供"],
            ]
          : []),
        ...(target.kind === "bim"
          ? [["GlobalIds", target.global_ids?.join(" · ") ?? "未提供"]]
          : []),
        ...(target.kind === "document"
          ? [
              ["页码", target.page == null ? "未提供" : `第 ${target.page} 页`],
              ["结构路径", target.structural_path?.join(" / ") ?? "未提供"],
              ["位置", target.location ?? "未提供"],
            ]
          : []),
      ]
    : [["定位目标", "未提供"]];
  const technicalDetails = [
    ["证据 ID", evidence.id],
    ["质量枚举", evidence.quality],
    ["证据页码", evidence.page],
    ["目标来源版本 ID", target?.source_revision_id],
    ["快照 ID", evidence.snapshot_id],
    ["来源 ID", evidence.source_id],
    ["来源版本 ID", evidence.source_revision_id],
    ["来源完整性哈希", evidence.source_revision],
    ["Provider", evidence.provider],
    ["观测时间", evidence.observed_at],
    ["构件 IDs", evidence.element_ids.join(" · ")],
    ["工作包", evidence.work_package_id],
    ["旧版位置", evidence.location],
  ] as const;
  return (
    <section
      className="evidence-workspace-host"
      aria-label={`${surface ? { drawing: "Drawing · 图纸", model: "Model · 模型", document: "Document · 文档" }[surface] : "Evidence · 证据"} workspace host`}
      data-evidence-id={evidence.id}
      data-target-surface={surface ?? undefined}
      data-viewer-target-kind={target?.kind}
      data-source-revision-id={target?.source_revision_id}
      data-evidence-stale={stale}
      data-navigation-state={boundaryState}
    >
      <ThatOpenPanel className="evidence-context-surface" label="工程依据">
        <div className="evidence-context-content">
          <header className="evidence-host-header">
            <HostIcon {...icon} />
            <strong>{hostName}</strong>
            <span>
              {sourceName} · {revisionName(evidence.source_revision_id)}
            </span>
          </header>
          <motion.div
            key={evidence.id}
            className="evidence-host-stage"
            initial="hidden"
            animate="visible"
            variants={variants.detailSwap}
            transition={transition("fast")}
          >
            <div className="evidence-target-receipt">
              <span className="eyebrow">工程依据 · 选中对象</span>
              <h2>{evidenceLabel(evidence)}</h2>
              <p className="evidence-quality">
                {qualityLabels[evidence.quality]}
              </p>
              {evidence.quality === "inferred" && (
                <p className="workspace-receipt-note">
                  推断 · 不是已验证工程事实
                </p>
              )}
              <dl className="evidence-primary-facts">
                <div>
                  <dt>来源与版本</dt>
                  <dd>
                    {sourceName} · {revisionName(evidence.source_revision_id)}
                  </dd>
                </div>
                {targetDetails.map(([label, value]) => (
                  <div key={label}>
                    <dt>{label}</dt>
                    <dd>{value}</dd>
                  </div>
                ))}
              </dl>
              <WorkspaceInlineState
                title={stale ? "历史证据 · 已过期或被替换" : "定位暂不可用"}
                action={
                  <Button variant="secondary" disabled>
                    查看原始工程目标
                  </Button>
                }
              >
                {stale && "不适用于当前版本与人工判断。"}
                {boundaryMessages[boundaryState]}
              </WorkspaceInlineState>
              <details className="evidence-technical-details">
                <summary>来源与技术详情</summary>
                <dl>
                  {technicalDetails.map(([label, value]) => (
                    <div key={label}>
                      <dt>{label}</dt>
                      <dd>
                        <code>{value ?? "未提供"}</code>
                      </dd>
                    </div>
                  ))}
                  <div>
                    <dt>精确 ViewerTarget</dt>
                    <dd>
                      <pre aria-label="Exact viewer target">
                        {JSON.stringify(target, null, 2)}
                      </pre>
                    </dd>
                  </div>
                </dl>
              </details>
            </div>
          </motion.div>
          <footer className="evidence-host-footer">
            <span>{surface ? "目标已保留" : "目标信息不完整"}</span>
            <span>工程依据与人工判断分别记录</span>
          </footer>
        </div>
      </ThatOpenPanel>
    </section>
  );
}
