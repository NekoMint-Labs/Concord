import { Box, FileText, Scan } from "lucide-react";
import { motion } from "motion/react";
import { lazy, Suspense, useCallback, useEffect, useState } from "react";
import { api, readSource, type DTO } from "../api/client";
import { ViewerBoundary } from "../components/ViewerBoundary";
import type { DrawingSource } from "../viewers/drawing/pdfDiffTypes";
import type { ExtractedDocument } from "../viewers/document/documentTypes";

const DrawingSurface = lazy(() => import("../viewers/drawing/DrawingSurface"));
const CadSurface = lazy(() => import("../viewers/cad/CadSurface"));
const IfcSurface = lazy(() => import("../viewers/ifc/IfcSurface"));
const DocumentSurface = lazy(
  () => import("../viewers/document/DocumentSurface"),
);
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
  revision_mismatch:
    "Evidence 与 ViewerTarget 的来源版本不一致；不跳转到其他版本。",
  loading: "正在读取并验证精确来源版本。",
  viewer_active:
    "精确来源已验证，定位请求已交给工程查看器；加载与定位结果见查看器状态。",
  navigation_failed: "工程查看器加载或定位失败；证据与人工判断保持不变。",
};

/** Product host seam only. Canonical provenance stays available, but secondary. */
export function EvidenceWorkspaceHost({
  evidence,
  project,
  stale = false,
  revisionAvailable,
  revisions = [],
  sources,
}: {
  evidence: Evidence;
  project?: string;
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
  const context = JSON.stringify([
    project,
    evidence.id,
    evidence.source_id,
    evidence.source_revision_id,
    evidence.source_revision,
    target,
  ]);
  const [failure, setFailure] = useState<{
    context: string;
    message: string | null;
  }>({ context, message: null });
  const viewerError = failure.context === context ? failure.message : null;
  const [viewerState, setViewerState] = useState({ context, state: "loading" });
  const onViewerError = useCallback(
    (message: string | null) => setFailure({ context, message }),
    [context],
  );
  const onViewerState = useCallback(
    (state: string) => setViewerState({ context, state }),
    [context],
  );
  const boundaryState = !target
    ? "missing_viewer_target"
    : !surface
      ? "target_unsupported"
      : !target.source_revision_id || revisionAvailable === false
        ? "revision_unavailable"
        : target.source_revision_id !== evidence.source_revision_id
          ? "revision_mismatch"
          : !project
            ? "viewer_unavailable"
            : viewerState.context === context
              ? viewerState.state
              : "loading";
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
      data-navigation-state={viewerError ? "navigation_failed" : boundaryState}
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
                title={stale ? "历史证据 · 已过期或被替换" : "工程查看器状态"}
                alert={!!viewerError || boundaryState === "navigation_failed"}
                diagnostic={viewerError ?? undefined}
                action={
                  <Button variant="secondary" disabled>
                    查看原始工程目标
                  </Button>
                }
              >
                {stale && "不适用于当前版本与人工判断。"}
                {viewerError
                  ? boundaryMessages.navigation_failed
                  : boundaryMessages[
                      boundaryState as keyof typeof boundaryMessages
                    ]}
              </WorkspaceInlineState>
              {project &&
                target &&
                surface &&
                target.source_revision_id === evidence.source_revision_id &&
                revisionAvailable !== false && (
                  <ViewerBoundary key={context}>
                    <EvidenceViewer
                      key={context}
                      project={project}
                      evidence={evidence}
                      onState={onViewerState}
                      onError={onViewerError}
                    />
                  </ViewerBoundary>
                )}
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

/** B composes C's real surfaces; it does not interpret geometry or fabricate targets. */
function EvidenceViewer({
  project,
  evidence,
  onState,
  onError,
}: {
  project: string;
  evidence: Evidence;
  onState: (state: string) => void;
  onError: (message: string | null) => void;
}) {
  const [attempt, setAttempt] = useState(0);
  const [loaded, setLoaded] = useState<{
    source: DrawingSource & { name: string };
    ifcSources: (DrawingSource & { name: string })[];
    document?: ExtractedDocument;
  }>();
  const [error, setError] = useState("");
  const target = evidence.viewer_target!;
  useEffect(() => {
    let live = true;
    const abort = new AbortController();
    setLoaded(undefined);
    setError("");
    onError(null);
    onState("loading");
    void (async () => {
      const revisions = await api.sourceRevisions(project, evidence.source_id);
      const revision = revisions.find(
        (item) => item.id === target.source_revision_id,
      );
      if (
        !revision ||
        revision.project_id !== project ||
        revision.source_id !== evidence.source_id
      )
        throw new Error("目标来源版本不可用；不使用最新版本替代。");
      if (
        revision.id !== evidence.source_revision_id ||
        revision.sha256 !== evidence.source_revision
      )
        throw new Error("Evidence 来源版本或完整性哈希不匹配。");
      const blob = await readSource(
        `/api/projects/${encodeURIComponent(project)}/sources/${encodeURIComponent(evidence.source_id)}/revisions/${encodeURIComponent(revision.id)}/content`,
        abort.signal,
      );
      if (!live) return;
      const data = await blob.arrayBuffer();
      const digest = await crypto.subtle.digest("SHA-256", data);
      const hash = Array.from(new Uint8Array(digest), (byte) =>
        byte.toString(16).padStart(2, "0"),
      ).join("");
      if (hash !== revision.sha256)
        throw new Error("来源原文件完整性验证失败。");
      const source = {
        revisionId: revision.id,
        sourceHash: revision.sha256,
        name: revision.original_filename,
        data,
      };
      let document: ExtractedDocument | undefined;
      if (target.kind === "document") {
        const documents = await api.documents(project);
        const metadata = documents.find(
          (item) =>
            item.project_id === project &&
            item.content_hash === revision.sha256,
        );
        if (!metadata)
          throw new Error(
            "精确来源版本尚无已持久化文档提取；请导入此版本后重试。",
          );
        const chunks = await api.chunks(metadata.id);
        if (chunks.some((chunk) => chunk.source_hash !== revision.sha256))
          throw new Error("文档提取不属于此来源版本。");
        document = {
          sourceRevisionId: revision.id,
          sourceHash: revision.sha256,
          filename: revision.original_filename,
          chunks,
        };
      }
      if (!live) return;
      setLoaded({ source, ifcSources: [source], document });
      // null is NOT an acknowledged navigation success. C owns loading/ready/error UI.
      onState("viewer_active");
    })().catch((failure) => {
      if (!live) return;
      const message =
        failure instanceof Error ? failure.message : String(failure);
      setError(message);
      onError(message);
      onState("navigation_failed");
    });
    // Closed contexts cannot publish bytes, errors or callbacks after A → B → A.
    return () => {
      live = false;
      abort.abort();
    };
  }, [project, evidence, attempt, onError, onState, target]);
  if (error)
    return (
      <WorkspaceInlineState
        title="工程依据无法打开"
        alert
        diagnostic={error}
        action={
          <Button onClick={() => setAttempt((value) => value + 1)}>
            重试工程查看器
          </Button>
        }
      >
        {error}
      </WorkspaceInlineState>
    );
  if (!loaded)
    return (
      <WorkspaceInlineState title="正在加载工程依据">
        正在验证来源版本与原文件。
      </WorkspaceInlineState>
    );
  return (
    <Suspense
      fallback={
        <WorkspaceInlineState title="正在加载查看器">
          正在准备工程查看器。
        </WorkspaceInlineState>
      }
    >
      {target.kind === "drawing" && (
        <DrawingSurface
          source={loaded.source}
          target={target}
          onError={onError}
        />
      )}
      {target.kind === "cad" && (
        <CadSurface before={loaded.source} target={target} onError={onError} />
      )}
      {target.kind === "bim" && (
        <IfcSurface
          sources={loaded.ifcSources}
          target={target}
          onError={onError}
        />
      )}
      {target.kind === "document" && loaded.document && (
        <DocumentSurface
          source={loaded.document}
          target={target}
          onError={onError}
        />
      )}
      <Button
        variant="secondary"
        onClick={() => setAttempt((value) => value + 1)}
      >
        重新打开工程查看器
      </Button>
    </Suspense>
  );
}
