import { Box, FileText, Scan } from "lucide-react";
import { motion } from "motion/react";
import {
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
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
import { useViewerChromeLocalization } from "./useViewerChromeLocalization";

export type Evidence = DTO<"Evidence">;
export type TargetSurface = "drawing" | "model" | "document";

export const qualityLabels = {
  structured: "结构化 · 已验证",
  extracted: "提取 · 来源内容",
  inferred: "推断 · 未验证",
} as const;

/** The tone a quality claim carries in the host's own chip. Verified facts are
 * neutral, extracted source is a statement of provenance, inference is a caution -
 * and they have to be distinguishable without reading the label. */
const qualityTones = {
  structured: "neutral",
  extracted: "accent",
  inferred: "warning",
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
/** The short form of a navigation state, for the host's own status chip. */
const stateLabels = {
  loading: "正在读取",
  viewer_active: "已定位",
  missing_viewer_target: "缺少目标",
  revision_unavailable: "版本不可用",
  target_unsupported: "不支持的目标",
  viewer_unavailable: "查看器不可用",
  revision_mismatch: "版本不一致",
  navigation_failed: "定位失败",
} as const;
const stateTones = {
  loading: "neutral",
  viewer_active: "positive",
  missing_viewer_target: "warning",
  revision_unavailable: "warning",
  target_unsupported: "warning",
  viewer_unavailable: "warning",
  revision_mismatch: "danger",
  navigation_failed: "danger",
} as const;
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

/**
 * The evidence surface: the object a Finding is about, opened at the exact place in
 * the exact revision that produced it.
 *
 * The composition is deliberately canvas-first. A reviewer comes here to *look* at a
 * drawing, a model or an extract, so the viewer takes the stage and the receipt - the
 * claim, its quality, its provenance - is a reference rail beside it rather than a
 * page of facts the viewer is buried behind. The rail keeps the canonical record
 * complete: collapsed provenance, exact viewer target, and a state block that says
 * what actually happened when navigation was requested.
 *
 * Product host seam only. Canonical provenance stays available, but secondary.
 */
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
  const navState = viewerError ? "navigation_failed" : boundaryState;
  const mounted =
    !!project &&
    !!target &&
    !!surface &&
    target.source_revision_id === evidence.source_revision_id &&
    revisionAvailable !== false;
  const { variants, transition } = useMotion();
  const HostIcon =
    surface === "model" ? Box : surface === "drawing" ? Scan : FileText;
  const hostName = surface ? hostNames[surface] : "工程依据";
  const targetDetails = target
    ? [
        ["目标来源版本", revisionName(target.source_revision_id)],
        ["定位目标", targetLabel(target)],
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
      data-navigation-state={navState}
    >
      <ThatOpenPanel className="evidence-context-surface" label="工程依据">
        <div className="evidence-context-content">
          {/* One Concord bar for object identity: what kind of engineering object
              this is, its name and revision, how good the claim is, and what the
              viewer actually did. Honesty is the point - insufficiency is named as
              insufficiency, never dressed up as verified. */}
          <header className="evidence-host-bar">
            <span className="evidence-host-kind">
              <HostIcon {...icon} />
              <span className="evidence-host-kind-label">{hostName}</span>
            </span>
            <span className="evidence-host-identity">
              <strong className="evidence-host-object">{sourceName}</strong>
              <span className="evidence-host-revision">
                {revisionName(evidence.source_revision_id)}
              </span>
            </span>
            <span className="evidence-host-chips">
              {stale && (
                <span
                  className="concord-chip"
                  data-tone="warning"
                  title="历史证据：已过期或被替换"
                >
                  历史证据 · 已过期
                </span>
              )}
              <span
                className="concord-chip"
                data-tone={qualityTones[evidence.quality]}
                title="依据质量"
              >
                {qualityLabels[evidence.quality]}
              </span>
              <span
                className="concord-chip"
                data-tone={stateTones[navState as keyof typeof stateTones]}
                title={
                  boundaryMessages[navState as keyof typeof boundaryMessages]
                }
              >
                {stateLabels[navState as keyof typeof stateLabels]}
              </span>
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
            {/* The rail: the claim and everything a reviewer must be able to check
                about it. Reading order puts the record before the pixels, which is
                what an engineering product should do. */}
            <div className="evidence-target-receipt">
              <div className="evidence-receipt-head">
                <span className="t-label">工程依据 · 选中对象</span>
                <span
                  className="concord-chip"
                  data-tone={qualityTones[evidence.quality]}
                >
                  {qualityLabels[evidence.quality]}
                </span>
              </div>
              <h2 className="evidence-receipt-claim">
                {evidenceLabel(evidence)}
              </h2>
              {evidence.quality === "inferred" && (
                <p className="evidence-receipt-caution">
                  推断 · 不是已验证工程事实
                </p>
              )}
              <div className="evidence-receipt-section">
                <span className="t-label">精确定位目标</span>
                <dl className="evidence-primary-facts">
                  {targetDetails.map(([label, value]) => (
                    <div key={label}>
                      <dt>{label}</dt>
                      <dd>{value}</dd>
                    </div>
                  ))}
                </dl>
              </div>
              <div
                className="evidence-receipt-state"
                data-stale={stale ? "true" : undefined}
                data-alert={
                  !!viewerError || boundaryState === "navigation_failed"
                    ? "true"
                    : undefined
                }
              >
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
              </div>
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
            {/* The stage: the drawing, the model, the extract. */}
            <div
              className="evidence-canvas"
              data-active={mounted && !viewerError ? "true" : undefined}
            >
              {mounted ? (
                <ViewerBoundary key={context}>
                  <EvidenceViewer
                    key={context}
                    project={project!}
                    evidence={evidence}
                    onState={onViewerState}
                    onError={onViewerError}
                  />
                </ViewerBoundary>
              ) : (
                <div className="evidence-canvas-idle" aria-hidden="true">
                  <span className="evidence-canvas-idle-mark">
                    <HostIcon size={28} strokeWidth={1.25} />
                  </span>
                  <p className="evidence-canvas-idle-state">
                    {stateLabels[navState as keyof typeof stateLabels]}
                  </p>
                  <p className="evidence-canvas-idle-note">
                    未在此平面挂载工程查看器；定位状态与原因见工程依据栏。
                  </p>
                </div>
              )}
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
      <ViewerSlot>
        {target.kind === "drawing" && (
          <DrawingSurface
            source={loaded.source}
            target={target}
            onError={onError}
          />
        )}
        {target.kind === "cad" && (
          <CadSurface
            before={loaded.source}
            target={target}
            onError={onError}
          />
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
      </ViewerSlot>
      <div className="evidence-viewer-tools">
        <Button
          variant="secondary"
          size="sm"
          onClick={() => setAttempt((value) => value + 1)}
        >
          重新打开工程查看器
        </Button>
      </div>
    </Suspense>
  );
}

/**
 * The host-owned stage the viewer is mounted in. It exists as its own component so the
 * chrome bridge walks the slot only once it is actually on the page, and re-runs when
 * the viewer remounts on an evidence-context change - the live seam the donor chrome
 * is localised through, without editing a byte of the pinned viewer integration.
 */
function ViewerSlot({ children }: { children: ReactNode }) {
  const slot = useRef<HTMLDivElement>(null);
  useViewerChromeLocalization(slot);
  return (
    <div className="evidence-viewer-slot" ref={slot}>
      {children}
    </div>
  );
}
