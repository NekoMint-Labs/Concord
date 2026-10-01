import { useEffect, useRef, useState, type ReactNode } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import {
  api,
  readSource,
  type Baseline,
  type ProjectSourceRevision,
  type ProjectSourceStatus,
  type AgentRun,
  type DTO,
  type InvestigationReport,
  type WorkPackage,
} from "../api/client";
import { shortDate, statusLabel } from "../ui/labels";
import { AppDisclosure } from "../components/ui/AppDisclosure";
import { demoInvestigationText } from "../ui/demo/demoPresentation";
import { Button } from "../components/ui/button";
import { AddSourcesDialog } from "./CreateSourceDialog";
import type { BimMappingContext } from "./BimMappingWorkspace";
import { RevisionImpact } from "./RevisionImpact";
import {
  revisionState,
  sourceRevisionLabel,
  useProjectSources,
} from "./useProjectSources";
import { processingLabel, useSourceProcessing } from "./useSourceProcessing";

export type SourceInvestigationState = {
  scope: DTO<"AgentScope-Input">;
  run?: AgentRun | null;
  error?: string | null;
  /** Parent owns the real streamed progress, not a simulated percentage. */
  progress?: ReactNode;
  onRetry?: () => void;
};
export type SourceContextPaneProps = {
  project: string;
  sourceId: string;
  focusRevisionId?: string;
  focusComparisonId?: string;
  onOpenModel?: (sourceId: string, revisionId: string) => void;
  workPackages?: WorkPackage[];
  report?: InvestigationReport | null;
  investigation?: SourceInvestigationState;
  onRun?: (run: AgentRun) => void;
  onContext?: (
    sourceId: string,
    revisionId?: string,
    revisionLabel?: string,
    fromRevisionId?: string,
    fromRevisionLabel?: string,
  ) => void;
  onInvestigate?: (
    sourceId: string,
    revisionId: string,
    fromRevisionId?: string,
    elementIds?: string[],
    revisionLabel?: string,
    fromRevisionLabel?: string,
  ) => void;
  onInspectImpact?: (workPackageId: string, context: BimMappingContext) => void;
  onOpenInvestigation?: () => void;
  onClose?: () => void;
};

/** History, originals, processing and source-scoped investigation. No root navigation state. */
export function SourceContextPane({
  project,
  sourceId,
  focusRevisionId,
  focusComparisonId,
  onOpenModel,
  workPackages = [],
  report,
  investigation,
  onRun,
  onContext,
  onInvestigate,
  onInspectImpact,
  onOpenInvestigation,
  onClose,
}: SourceContextPaneProps) {
  const data = useProjectSources(project, sourceId, onRun);
  const revisions = data.revisions.data ?? [];
  const processing = useSourceProcessing(project, revisions, onRun);
  const current = data.sources.data?.find(
    (item) => item.source.id === sourceId,
  );
  const baselines = data.baselines.data ?? [];
  const baseline = baselines.at(-1);
  const firstBaseline = baselines.find((item) => item.sequence === 1);
  const firstRevisionId = firstBaseline?.entries.find(
    (item) => item.source_id === sourceId,
  )?.revision_id;
  const [compareBase, setCompareBase] = useState<"first" | "accepted">(
    "accepted",
  );
  const focusedComparison = data.comparisons.data?.find(
    (item) => item.id === focusComparisonId,
  );
  const fromRevisionId =
    focusedComparison?.from_revision_id ??
    (compareBase === "first" ? firstRevisionId : current?.accepted_revision_id);
  const latest = revisions.find(
    (item) =>
      item.id ===
      (focusedComparison?.to_revision_id ?? current?.latest_revision_id),
  );
  const from = revisions.find((item) => item.id === fromRevisionId);
  const latestProcessing = current?.latest_revision_id
    ? processing.states.get(current.latest_revision_id)
    : undefined;
  const [addOpen, setAddOpen] = useState(false);
  const label = (id?: string | null) =>
    sourceRevisionLabel(revisions, sourceId, id);
  const scopedOperation =
    investigation?.scope.source_id === sourceId ? investigation : undefined;
  const scopedReport =
    report?.scope.source_id === sourceId ? report : undefined;
  const compareToLatest = (base: "first" | "accepted", id?: string | null) => {
    setCompareBase(base);
    if (!id || !latest || id === latest.id) return;
    if (
      !data.comparisons.data?.some(
        (item) =>
          item.from_revision_id === id && item.to_revision_id === latest.id,
      )
    )
      data.compare.mutate({ from_revision_id: id, to_revision_id: latest.id });
  };
  const canCompare = (id?: string | null) =>
    !!id &&
    !!latest &&
    processing.states.get(latest.id)?.run?.status === "COMPLETED" &&
    processing.states.get(id)?.run?.status === "COMPLETED";
  const comparisonRef = useRef<HTMLElement>(null);
  useEffect(() => {
    if (!current) return;
    const revisionId =
      focusRevisionId ??
      focusedComparison?.to_revision_id ??
      current.latest_revision_id ??
      undefined;
    onContext?.(
      sourceId,
      revisionId,
      label(revisionId),
      focusedComparison?.from_revision_id ??
        current.accepted_revision_id ??
        undefined,
    );
    if (focusedComparison)
      comparisonRef.current?.scrollIntoView?.({ block: "nearest" });
    // Selection, not polling or callback identity, owns the agent scope.
  }, [
    sourceId,
    focusRevisionId,
    focusComparisonId,
    current?.latest_revision_id,
    focusedComparison?.id,
  ]);
  const matchingComparisons = (data.comparisons.data ?? []).filter(
    (comparison) =>
      comparison.from_revision_id === fromRevisionId &&
      comparison.to_revision_id === latest?.id,
  );

  const comparison = matchingComparisons.at(-1);
  const comparisonDetail = useQuery({
    queryKey: ["comparison", project, sourceId, comparison?.id ?? ""],
    queryFn: () => api.comparison(project, sourceId, comparison!.id),
    enabled: !!comparison,
  });
  const [historyOpen, setHistoryOpen] = useState(!!focusRevisionId);
  useEffect(() => {
    if (focusRevisionId) setHistoryOpen(true);
  }, [focusRevisionId]);

  const revisionHistory = current && (
    <SourceDetailRevisionHistory
      project={project}
      current={current}
      revisions={revisions}
      baselines={baselines}
      loading={data.revisions.isPending}
      processing={processing}
      onInvestigate={onInvestigate}
      onOpenModel={onOpenModel}
      focusRevisionId={focusRevisionId}
    />
  );

  return (
    <aside className="sources-context-pane" aria-label="资料上下文">
      <header className="sources-context-heading">
        <div className="object-identity">
          {current && (
            <span className="object-kind">
              {current.source.kind === "BIM" ? "IFC 模型" : "工程文档"}
            </span>
          )}
          <h2>{current?.source.name ?? "资料"}</h2>
        </div>
        {onClose && (
          <Button size="sm" variant="ghost" onClick={onClose}>
            关闭
          </Button>
        )}
      </header>
      {data.sources.isPending && <p role="status">正在读取资料…</p>}
      {(data.sources.error || data.revisions.error || data.baselines.error) && (
        <div role="alert" className="sources-error">
          {data.sources.error?.message ||
            data.revisions.error?.message ||
            data.baselines.error?.message}
          <Button
            size="sm"
            variant="ghost"
            onClick={() => {
              void data.sources.refetch();
              if (sourceId) void data.revisions.refetch();
              void data.baselines.refetch();
            }}
          >
            重新读取
          </Button>
        </div>
      )}
      {!current && !data.sources.isPending && (
        <p className="quiet-message workspace-empty">
          选择一份资料，查看版本和原文件。
        </p>
      )}
      {current && (
        <>
          <section
            aria-label="当前资料版本"
            className="sources-context-current"
          >
            <dl>
              <dt>最新版本</dt>
              <dd className="mono">
                {label(current.latest_revision_id)}
                {current.has_pending_revision && (
                  <small className="is-pending"> · 待确认</small>
                )}
              </dd>
              <dt>当前基线{baseline ? ` B${baseline.sequence}` : ""}</dt>
              <dd className="mono">{label(current.accepted_revision_id)}</dd>
            </dl>
            {latest &&
              (latestProcessing?.run?.status !== "COMPLETED" ||
                latestProcessing.error ||
                latestProcessing.readError) && (
                <p role="status">{processingLabel(latestProcessing)}</p>
              )}
          </section>
          {current.source.kind === "BIM" && latest && (
            <section
              ref={comparisonRef}
              className={`sources-context-comparison${focusedComparison ? " is-focused" : ""}`}
              aria-label="基线与最新版本比较"
            >
              <h3>
                {focusedComparison
                  ? `版本比较 · ${label(fromRevisionId)} → ${label(latest.id)}`
                  : `最新比较 · ${label(fromRevisionId)} → ${label(latest.id)}`}
              </h3>
              {comparison && (
                <>
                  <p className="sources-comparison-summary">
                    新增 {comparison.summary.added} · 删除{" "}
                    {comparison.summary.deleted} · 变更{" "}
                    {comparison.summary.changed}
                  </p>
                  {comparison.summary.warnings.map((warning) => (
                    <p role="status" className="continuity-warning" key={warning}>
                      {warning}
                    </p>
                  ))}
                  {comparisonDetail.data ? (
                    <p className="quiet-message">
                      受影响工作包{" "}
                      {comparisonDetail.data.affected_work_packages.length} 个
                      {comparisonDetail.data.affected_work_packages.length ===
                        0 &&
                      comparison.summary.added +
                        comparison.summary.deleted +
                        comparison.summary.changed >
                        0
                        ? " · 有构件变化，暂未关联工作包"
                        : ""}
                    </p>
                  ) : comparisonDetail.error ? (
                    <p role="alert" className="sources-error">
                      {comparisonDetail.error.message}
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => void comparisonDetail.refetch()}
                      >
                        重试读取影响
                      </Button>
                    </p>
                  ) : (
                    <p role="status" className="quiet-message">
                      正在读取工作包影响…
                    </p>
                  )}
                  {onInvestigate && (
                    <Button
                      size="sm"
                      disabled={!comparisonDetail.data}
                      onClick={() =>
                        onInvestigate(
                          sourceId,
                          comparison.to_revision_id,
                          comparison.from_revision_id,
                          comparisonDetail.data?.changes.map(
                            (change) => change.global_id,
                          ),
                          label(comparison.to_revision_id),
                          label(comparison.from_revision_id),
                        )
                      }
                    >
                      调查此比较
                    </Button>
                  )}
                </>
              )}
              {!comparison && from && from.id !== latest.id && (
                <Button
                  size="sm"
                  disabled={!canCompare(from.id) || data.compare.isPending}
                  onClick={() =>
                    data.compare.mutate({
                      from_revision_id: from.id,
                      to_revision_id: latest.id,
                    })
                  }
                >
                  {data.compare.isPending ? "正在比较…" : "查看变化"}
                </Button>
              )}
              {data.comparisons.error && (
                <p role="alert" className="sources-error">
                  {data.comparisons.error.message}
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => void data.comparisons.refetch()}
                  >
                    重试读取比较
                  </Button>
                </p>
              )}
              {data.compare.error && (
                <p role="alert" className="sources-error">
                  {data.compare.error.message}
                </p>
              )}
              {!fromRevisionId ? (
                <p className="quiet-message">
                  此资料未纳入所选基线，暂无可比较版本。
                </p>
              ) : fromRevisionId === latest.id ? (
                <p className="quiet-message">所选基线与最新版本相同。</p>
              ) : null}
              <AppDisclosure label="比较详情与操作" className="sources-support">
                {!focusedComparison && (
                  <div className="sources-context-actions">
                    <Button
                      size="sm"
                      variant={compareBase === "first" ? "secondary" : "ghost"}
                      disabled={
                        !canCompare(firstRevisionId) || data.compare.isPending
                      }
                      onClick={() => compareToLatest("first", firstRevisionId)}
                    >
                      B1 → {label(latest.id)}
                    </Button>
                    {baseline && baseline.sequence !== 1 && (
                      <Button
                        size="sm"
                        variant={
                          compareBase === "accepted" ? "secondary" : "ghost"
                        }
                        disabled={
                          !canCompare(current.accepted_revision_id) ||
                          data.compare.isPending
                        }
                        onClick={() =>
                          compareToLatest(
                            "accepted",
                            current.accepted_revision_id,
                          )
                        }
                      >
                        B{baseline.sequence} → {label(latest.id)}
                      </Button>
                    )}
                  </div>
                )}
                {from && from.id !== latest.id && (
                  <>
                    {onContext && onInvestigate && onInspectImpact ? (
                      <RevisionImpact
                        key={`${sourceId}:${fromRevisionId}:${latest.id}`}
                        project={project}
                        source={sourceId}
                        workPackages={workPackages}
                        revisions={[from, latest]}
                        comparisons={matchingComparisons}
                        comparing={data.compare.isPending}
                        imported={canCompare(fromRevisionId)}
                        acceptedRevisionId={fromRevisionId}
                        error={data.compare.error}
                        onCompare={(from_revision_id, to_revision_id) =>
                          data.compare.mutate({
                            from_revision_id,
                            to_revision_id,
                          })
                        }
                        onSelectComparison={(comparison) =>
                          onContext?.(
                            sourceId,
                            comparison.to_revision_id,
                            label(comparison.to_revision_id),
                            comparison.from_revision_id,
                            label(comparison.from_revision_id),
                          )
                        }
                        onInvestigate={(comparison, elements) =>
                          onInvestigate?.(
                            sourceId,
                            comparison.to_revision_id,
                            comparison.from_revision_id,
                            elements,
                            label(comparison.to_revision_id),
                            label(comparison.from_revision_id),
                          )
                        }
                        onInspect={({
                          workPackageId,
                          fromRevisionId,
                          toRevisionId,
                          changes,
                        }) =>
                          onInspectImpact?.(workPackageId, {
                            sourceId,
                            fromRevisionId,
                            fromRevisionLabel: label(fromRevisionId),
                            revisionId: toRevisionId,
                            revisionLabel: label(toRevisionId),
                            highlightIds: changes.map(
                              (change) => change.global_id,
                            ),
                            changes,
                          })
                        }
                      />
                    ) : (
                      matchingComparisons.map((comparison) => (
                        <p key={comparison.id}>
                          新增 {comparison.summary.added} · 删除{" "}
                          {comparison.summary.deleted} · 变更{" "}
                          {comparison.summary.changed}
                        </p>
                      ))
                    )}
                    {data.compare.error && (
                      <Button
                        size="sm"
                        variant="secondary"
                        disabled={data.compare.isPending}
                        onClick={() =>
                          data.compare.mutate({
                            from_revision_id: from.id,
                            to_revision_id: latest.id,
                          })
                        }
                      >
                        重试比较
                      </Button>
                    )}
                  </>
                )}
              </AppDisclosure>
            </section>
          )}
          <AppDisclosure
            label="版本历史与操作"
            className="sources-support"
            open={historyOpen}
            onOpenChange={setHistoryOpen}
          >
            <Button
              size="sm"
              variant="secondary"
              onClick={() => setAddOpen(true)}
            >
              添加版本
            </Button>
            {revisionHistory}
          </AppDisclosure>
          {current.source.kind !== "BIM" && revisions.length > 1 && (
            <p className="quiet-message">
              文档原文件与版本已保留；当前服务不提供文档版本差异比较。
            </p>
          )}
          {(scopedOperation || scopedReport) && (
            <section
              className="sources-context-investigation"
              aria-label="Concord 资料调查"
            >
              <h3>Concord 调查</h3>
              {scopedOperation && (
                <>
                  <p>
                    范围：{label(scopedOperation.scope.from_revision_id)} →{" "}
                    {label(scopedOperation.scope.to_revision_id)}
                    {scopedOperation.scope.element_ids?.length
                      ? ` · ${scopedOperation.scope.element_ids.length} 个构件`
                      : ""}
                  </p>
                  {scopedOperation.run && (
                    <p role="status">
                      {scopedOperation.run.status === "RUNNING"
                        ? "正在调查…"
                        : scopedOperation.run.status === "QUEUED"
                          ? "等待调查"
                          : statusLabel(scopedOperation.run.status)}
                    </p>
                  )}
                  {scopedOperation.progress}
                  {(scopedOperation.error || scopedOperation.run?.error) && (
                    <p role="alert" className="sources-error">
                      {scopedOperation.error || scopedOperation.run?.error}
                    </p>
                  )}
                  {(scopedOperation.error ||
                    ["FAILED", "CANCELLED", "EXPIRED"].includes(
                      scopedOperation.run?.status ?? "",
                    )) &&
                    scopedOperation.onRetry && (
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={scopedOperation.onRetry}
                      >
                        重试调查
                      </Button>
                    )}
                </>
              )}
              {scopedReport && (
                <>
                  <p className="quiet-message">
                    {scopedReport.scope.to_revision_id ===
                    current.latest_revision_id
                      ? "当前版本的调查结果"
                      : "历史版本调查结果 · 新版本需要重新调查"}{" "}
                    · {label(scopedReport.scope.from_revision_id)} →{" "}
                    {label(scopedReport.scope.to_revision_id)}
                  </p>
                  <p>{demoInvestigationText(scopedReport.answer.summary)}</p>
                  {!!scopedReport.answer.limitations.length && (
                    <ul>
                      {scopedReport.answer.limitations.map((item) => (
                        <li key={item}>{item}</li>
                      ))}
                    </ul>
                  )}
                  <small>{scopedReport.evidence.length} 条判断依据</small>
                  {onOpenInvestigation && (
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={onOpenInvestigation}
                    >
                      查看调查结果
                    </Button>
                  )}
                </>
              )}
            </section>
          )}
          <AddSourcesDialog
            key={sourceId}
            open={addOpen}
            onOpenChange={setAddOpen}
            sourceId={sourceId}
            sources={data.sources.data ?? []}
            supportedFormats={data.supportedFormats}
            onCreate={(input) => data.createSource.mutateAsync(input)}
            onUpload={(input) => data.upload.mutateAsync(input)}
          />
        </>
      )}
    </aside>
  );
}

/** Source-detail presentation; baseline history keeps its own shared surface. */
function SourceDetailRevisionHistory({
  project,
  current,
  revisions,
  baselines,
  loading,
  processing,
  onInvestigate,
  onOpenModel,
  focusRevisionId,
}: {
  project: string;
  current: ProjectSourceStatus;
  revisions: readonly ProjectSourceRevision[];
  baselines: readonly Baseline[];
  loading: boolean;
  processing: ReturnType<typeof useSourceProcessing>;
  onInvestigate?: SourceContextPaneProps["onInvestigate"];
  onOpenModel?: SourceContextPaneProps["onOpenModel"];
  focusRevisionId?: string;
}) {
  const sourceId = current.source.id;
  const focusedRevision = useRef<HTMLElement>(null);
  useEffect(() => {
    focusedRevision.current?.scrollIntoView?.({ block: "nearest" });
  }, [focusRevisionId, revisions.length]);
  const [downloadErrors, setDownloadErrors] = useState<Record<string, string>>(
    {},
  );
  const download = useMutation({
    mutationFn: async (revision: ProjectSourceRevision) => {
      const blob = await readSource(
        `/api/projects/${encodeURIComponent(project)}/sources/${encodeURIComponent(sourceId)}/revisions/${encodeURIComponent(revision.id)}/content`,
      );
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = revision.original_filename;
      anchor.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    },
    onMutate: (revision) =>
      setDownloadErrors((errors) => ({ ...errors, [revision.id]: "" })),
    onError: (error, revision) =>
      setDownloadErrors((errors) => ({
        ...errors,
        [revision.id]: error.message,
      })),
  });
  return (
    <section className="sources-context-history" aria-label="资料版本历史">
      <h3>版本历史</h3>
      {loading && <p role="status">正在读取版本…</p>}
      {[...revisions]
        .sort((a, b) => b.sequence - a.sequence)
        .map((revision) => {
          const state = processing.states.get(revision.id);
          const error = state?.error || state?.readError || state?.run?.error;
          const revisionBaselines = baselines.filter((entry) =>
            entry.entries.some(
              (item) =>
                item.source_id === sourceId && item.revision_id === revision.id,
            ),
          );
          const retryable =
            state &&
            !state.loading &&
            !state.readError &&
            !state.starting &&
            (!!state.error ||
              !state.run ||
              ["FAILED", "CANCELLED", "EXPIRED"].includes(state.run.status));
          const meaning = revisionState(current, revision.id);
          return (
            <article
              ref={
                focusRevisionId === revision.id ? focusedRevision : undefined
              }
              className={`sources-context-revision${focusRevisionId === revision.id ? " is-focused" : ""}`}
              key={revision.id}
            >
              <header>
                <strong className="mono">R{revision.sequence}</strong>
                <span
                  className={meaning === "latest" ? "is-pending" : undefined}
                >
                  {meaning === "latest-accepted"
                    ? "最新 · 当前基线"
                    : meaning === "latest"
                      ? "最新 · 待确认"
                      : meaning === "accepted"
                        ? "当前基线"
                        : "历史版本"}
                </span>
              </header>
              <p className="sources-original-filename">
                {revision.original_filename}
              </p>
              <div className="sources-revision-metadata">
                {!!revisionBaselines.length && (
                  <span className="mono">
                    {revisionBaselines
                      .map((item) => `B${item.sequence}`)
                      .join(" · ")}
                  </span>
                )}
                {revision.external_label && (
                  <span>外部版本标记：{revision.external_label}</span>
                )}
                <span>{Math.ceil(revision.size_bytes / 1024)} KiB</span>
                <time
                  dateTime={revision.imported_at}
                  title={new Date(revision.imported_at).toLocaleString("zh-CN")}
                >
                  {shortDate(revision.imported_at)}
                </time>
              </div>
              {(state?.run?.status !== "COMPLETED" || error) && (
                <p role="status" className="sources-revision-availability">
                  {processingLabel(state)}
                </p>
              )}
              {error && (
                <p role="alert" className="sources-error">
                  {error}
                </p>
              )}
              <div className="sources-context-actions">
                {state?.readError && (
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => void processing.refetch(revision.id)}
                  >
                    重新读取处理状态
                  </Button>
                )}
                {retryable && (
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() =>
                      processing.retry.mutate({
                        source: sourceId,
                        revision: revision.id,
                      })
                    }
                  >
                    {state.error || state.run ? "重试处理" : "开始处理"}
                  </Button>
                )}
                {current.source.kind === "BIM" &&
                  state?.run?.status === "COMPLETED" &&
                  onOpenModel && (
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() => onOpenModel(sourceId, revision.id)}
                    >
                      查看模型
                    </Button>
                  )}
                {state?.run?.status === "COMPLETED" && onInvestigate && (
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() =>
                      onInvestigate(
                        sourceId,
                        revision.id,
                        undefined,
                        undefined,
                        `R${revision.sequence}`,
                      )
                    }
                  >
                    调查此版本
                  </Button>
                )}
              </div>
              <AppDisclosure
                label="原文件与处理记录"
                className="sources-revision-support"
              >
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={download.isPending}
                  onClick={() => download.mutate(revision)}
                >
                  {download.isPending && download.variables?.id === revision.id
                    ? "正在下载…"
                    : downloadErrors[revision.id]
                      ? "重试下载原文件"
                      : "下载原文件"}
                </Button>
                {state?.run && (
                  <div className="sources-processing-log">
                    <span>处理记录</span>
                    <code>{state.run.id}</code>
                    <p>
                      {state.run.status} ·{" "}
                      {new Date(state.run.updated_at).toLocaleString("zh-CN")}
                    </p>
                    {state.run.error && <p>{state.run.error}</p>}
                  </div>
                )}
              </AppDisclosure>
              {downloadErrors[revision.id] && (
                <p role="alert" className="sources-error">
                  {downloadErrors[revision.id]}
                </p>
              )}
            </article>
          );
        })}
      {!loading && !revisions.length && (
        <p className="quiet-message workspace-empty">
          资料已登记但尚未上传原文件；使用「添加版本」上传，版本与原文件会保留在这里。
        </p>
      )}
    </section>
  );
}
