import type { Ref } from "react";
import type { UseQueryResult } from "@tanstack/react-query";
import type {
  Baseline,
  DTO,
  ProjectSourceRevision,
  ProjectSourceStatus,
  WorkPackage,
} from "../api/client";
import { AppDisclosure } from "../components/ui/AppDisclosure";
import { Button } from "../components/ui/button";
import { RevisionImpact } from "./RevisionImpact";
import type { SourceContextPaneProps } from "./SourceContextPane";
import type { ProjectSourcesData } from "./useProjectSources";

type SourceContextComparisonProps = Pick<
  SourceContextPaneProps,
  "project" | "sourceId" | "onContext" | "onInvestigate" | "onInspectImpact"
> & {
  current: ProjectSourceStatus;
  latest: ProjectSourceRevision;
  from?: ProjectSourceRevision;
  fromRevisionId?: string | null;
  firstRevisionId?: string;
  baseline?: Baseline;
  focusedComparison?: DTO<"RevisionComparison">;
  matchingComparisons: DTO<"RevisionComparison">[];
  comparison?: DTO<"RevisionComparison">;
  comparisonDetail: UseQueryResult<DTO<"RevisionComparisonDetail">, Error>;
  data: ProjectSourcesData;
  workPackages: WorkPackage[];
  compareBase: "first" | "accepted";
  compareToLatest: (base: "first" | "accepted", id?: string | null) => void;
  canCompare: (id?: string | null) => boolean;
  label: (id?: string | null) => string;
  comparisonRef: Ref<HTMLElement>;
};

/** Baseline controls and impact presentation; the pane owns query and selection lifetime. */
export function SourceContextComparison({
  project,
  sourceId,
  current,
  latest,
  from,
  fromRevisionId,
  firstRevisionId,
  baseline,
  focusedComparison,
  matchingComparisons,
  comparison,
  comparisonDetail,
  data,
  workPackages,
  compareBase,
  compareToLatest,
  canCompare,
  label,
  comparisonRef,
  onContext,
  onInvestigate,
  onInspectImpact,
}: SourceContextComparisonProps) {
  return (
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
            新增 {comparison.summary.added} · 删除 {comparison.summary.deleted}{" "}
            · 变更 {comparison.summary.changed}
          </p>
          {comparison.summary.warnings.map((warning) => (
            <p role="status" className="continuity-warning" key={warning}>
              {warning}
            </p>
          ))}
          {comparisonDetail.data ? (
            <p className="quiet-message">
              受影响工作包 {comparisonDetail.data.affected_work_packages.length}{" "}
              个
              {comparisonDetail.data.affected_work_packages.length === 0 &&
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
        <p className="quiet-message">此资料未纳入所选基线，暂无可比较版本。</p>
      ) : fromRevisionId === latest.id ? (
        <p className="quiet-message">所选基线与最新版本相同。</p>
      ) : null}
      <AppDisclosure label="比较详情与操作" className="sources-support">
        {!focusedComparison && (
          <div className="sources-context-actions">
            <Button
              size="sm"
              variant={compareBase === "first" ? "secondary" : "ghost"}
              disabled={!canCompare(firstRevisionId) || data.compare.isPending}
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
                    highlightIds: changes.map((change) => change.global_id),
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
  );
}
