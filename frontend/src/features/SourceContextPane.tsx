import { useState, type ReactNode } from "react";
import {
  type AgentRun,
  type DTO,
  type InvestigationReport,
  type WorkPackage,
} from "../api/client";
import { statusLabel } from "../ui/labels";
import { demoInvestigationText } from "../ui/demo/demoPresentation";
import { Button } from "../components/ui/button";
import { AddSourcesDialog } from "./CreateSourceDialog";
import type { BimMappingContext } from "./BimMappingWorkspace";
import { RevisionImpact } from "./RevisionImpact";
import { sourceRevisionLabel, useProjectSources } from "./useProjectSources";
import { SourceRevisionHistory } from "./BaselineHistory";
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
  const fromRevisionId =
    compareBase === "first" ? firstRevisionId : current?.accepted_revision_id;
  const latest = revisions.find(
    (item) => item.id === current?.latest_revision_id,
  );
  const from = revisions.find((item) => item.id === fromRevisionId);
  const latestProcessing = latest
    ? processing.states.get(latest.id)
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
    latestProcessing?.run?.status === "COMPLETED" &&
    processing.states.get(id)?.run?.status === "COMPLETED";
  const matchingComparisons = (data.comparisons.data ?? []).filter(
    (comparison) =>
      comparison.from_revision_id === fromRevisionId &&
      comparison.to_revision_id === latest?.id,
  );

  return (
    <aside className="sources-context-pane" aria-label="资料上下文">
      <header className="sources-context-heading">
        <h2>{current?.source.name ?? "资料"}</h2>
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
        <p className="quiet-message">选择一份资料，查看版本和原文件。</p>
      )}
      {current && (
        <>
          <section
            aria-label="当前资料版本"
            className="sources-context-current"
          >
            <dl>
              <dt>最新版本</dt>
              <dd>{label(current.latest_revision_id)}</dd>
              <dt>当前基线{baseline ? ` B${baseline.sequence}` : ""}</dt>
              <dd>{label(current.accepted_revision_id)}</dd>
            </dl>
            <p className="quiet-message">
              {current.has_pending_revision
                ? "有待确认版本；当前基线保持不变。"
                : current.accepted_revision_id
                  ? "最新版本已纳入当前基线。"
                  : "尚未确认基线。"}
            </p>
            {latest && <p role="status">{processingLabel(latestProcessing)}</p>}
            <Button
              size="sm"
              variant="secondary"
              onClick={() => setAddOpen(true)}
            >
              添加版本
            </Button>
          </section>
          <SourceRevisionHistory
            project={project}
            current={current}
            revisions={revisions}
            baselines={baselines}
            loading={data.revisions.isPending}
            processing={processing}
            onContext={onContext}
            onInvestigate={onInvestigate}
          />
          {current.source.kind === "BIM" && latest && (
            <section
              className="sources-context-comparison"
              aria-label="基线与最新版本比较"
            >
              <h3>基线 → 最新</h3>
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
                    variant={compareBase === "accepted" ? "secondary" : "ghost"}
                    disabled={
                      !canCompare(current.accepted_revision_id) ||
                      data.compare.isPending
                    }
                    onClick={() =>
                      compareToLatest("accepted", current.accepted_revision_id)
                    }
                  >
                    B{baseline.sequence} → {label(latest.id)}
                  </Button>
                )}
              </div>
              {data.comparisons.error && (
                <p role="alert" className="sources-error">
                  {data.comparisons.error.message}
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => void data.comparisons.refetch()}
                  >
                    重试读取比较
                  </Button>
                </p>
              )}
              {!fromRevisionId ? (
                <p className="quiet-message">
                  此资料未纳入所选基线，暂无可比较版本。
                </p>
              ) : fromRevisionId === latest.id ? (
                <p className="quiet-message">所选基线与最新版本相同。</p>
              ) : (
                from && (
                  <>
                    <p className="quiet-message">
                      {compareBase === "first"
                        ? "B1"
                        : `B${baseline?.sequence}`}{" "}
                      · {label(fromRevisionId)} → 最新 {label(latest.id)}
                    </p>
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
                      <p role="alert" className="sources-error">
                        {data.compare.error.message}
                      </p>
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
                )
              )}
            </section>
          )}
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
