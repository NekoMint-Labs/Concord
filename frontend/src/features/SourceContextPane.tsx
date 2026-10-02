import { useEffect, useRef, useState, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  api,
  type AgentRun,
  type DTO,
  type InvestigationReport,
  type WorkPackage,
} from "../api/client";
import { AppDisclosure } from "../components/ui/AppDisclosure";
import { Button } from "../components/ui/button";
import { AddSourcesDialog } from "./CreateSourceDialog";
import type { BimMappingContext } from "./BimMappingWorkspace";
import { SourceDetailRevisionHistory } from "./SourceDetailRevisionHistory";
import { SourceContextComparison } from "./SourceContextComparison";
import { SourceContextInvestigation } from "./SourceContextInvestigation";
import { sourceRevisionLabel, useProjectSources } from "./useProjectSources";
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
            <SourceContextComparison
              project={project}
              sourceId={sourceId}
              current={current}
              latest={latest}
              from={from}
              fromRevisionId={fromRevisionId}
              firstRevisionId={firstRevisionId}
              baseline={baseline}
              focusedComparison={focusedComparison}
              matchingComparisons={matchingComparisons}
              comparison={comparison}
              comparisonDetail={comparisonDetail}
              data={data}
              workPackages={workPackages}
              compareBase={compareBase}
              compareToLatest={compareToLatest}
              canCompare={canCompare}
              label={label}
              comparisonRef={comparisonRef}
              onContext={onContext}
              onInvestigate={onInvestigate}
              onInspectImpact={onInspectImpact}
            />
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
            <SourceContextInvestigation
              scopedOperation={scopedOperation}
              scopedReport={scopedReport}
              latestRevisionId={current.latest_revision_id}
              label={label}
              onOpenInvestigation={onOpenInvestigation}
            />
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
