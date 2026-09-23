import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api, type DTO, type WorkPackage } from "../api/client";
import { demoWorkPackageName } from "../ui/demo/demoPresentation";
import { Button } from "../components/ui/button";
import { AppSelect } from "../components/ui/AppSelect";

export function RevisionImpact({
  project,
  source,
  revisions,
  comparisons,
  comparing,
  error,
  onCompare,
  onSelectComparison,
  onInvestigate,
  onInspect,
  workPackages = [],
}: {
  project: string;
  workPackages?: WorkPackage[];
  source: string;
  revisions: DTO<"ProjectSourceRevision">[];
  comparisons: DTO<"RevisionComparison">[];
  comparing: boolean;
  error?: Error | null;
  onCompare: (from: string, to: string) => void;
  onSelectComparison: (comparison: DTO<"RevisionComparison">) => void;
  onInvestigate: (
    comparison: DTO<"RevisionComparison">,
    elementIds: string[],
  ) => void;
  onInspect: (input: {
    workPackageId: string;
    fromRevisionId: string;
    toRevisionId: string;
    changes: DTO<"BimElementChange">[];
  }) => void;
}) {
  const [comparisonId, setComparisonId] = useState("");
  const onSelectComparisonRef = useRef(onSelectComparison);
  onSelectComparisonRef.current = onSelectComparison;
  const latest = comparisons.at(-1);
  useEffect(() => {
    if (latest && !comparisons.some((item) => item.id === comparisonId)) {
      setComparisonId(latest.id);
      onSelectComparisonRef.current(latest);
    }
  }, [comparisonId, comparisons, latest]);
  const detail = useQuery({
    queryKey: ["comparison", project, source, comparisonId],
    queryFn: () => api.comparison(project, source, comparisonId),
    enabled: !!comparisonId,
  });

  if (error)
    return (
      <div className="impact-empty is-error">
        <strong>比较不可用</strong>
        <span>{error.message}</span>
      </div>
    );
  if (detail.isError)
    return (
      <div className="impact-empty is-error">
        <strong>比较不可用</strong>
        <span>{detail.error.message}</span>
      </div>
    );
  if (!latest)
    return (
      <div className="impact-empty">
        <strong>尚无版本比较</strong>
        <span>
          {revisions.length < 2
            ? "上传并导入至少两个 BIM 版本后可比较。"
            : "两个版本已就绪，可以显式开始比较。"}
        </span>
        {revisions.length >= 2 && (
          <Button
            size="sm"
            disabled={comparing}
            onClick={() =>
              onCompare(revisions.at(-2)!.id, revisions.at(-1)!.id)
            }
          >
            {comparing ? "正在比较…" : "比较最近两个版本"}
          </Button>
        )}
      </div>
    );
  if (!detail.data)
    return <div className="loading-view">正在读取版本影响…</div>;

  const { comparison, affected_work_packages: packages } = detail.data;
  const from = revisions.find(
    (revision) => revision.id === comparison.from_revision_id,
  );
  const to = revisions.find(
    (revision) => revision.id === comparison.to_revision_id,
  );
  const noImpact =
    comparison.summary.added +
      comparison.summary.deleted +
      comparison.summary.changed ===
    0;
  return (
    <section className="revision-impact" aria-label="版本影响">
      <div className="impact-heading">
        <h3>版本影响</h3>
        <AppSelect
          label="版本比较"
          value={comparisonId}
          onChange={(value) => {
            const selected = comparisons.find((item) => item.id === value);
            setComparisonId(value);
            if (selected) onSelectComparison(selected);
          }}
          options={comparisons.map((item) => {
            const optionFrom = revisions.find(
              (revision) => revision.id === item.from_revision_id,
            );
            const optionTo = revisions.find(
              (revision) => revision.id === item.to_revision_id,
            );
            return {
              value: item.id,
              label: `R${optionFrom?.sequence ?? "?"} → R${optionTo?.sequence ?? "?"}`,
              hint: `${item.summary.added + item.summary.deleted + item.summary.changed} 项变更`,
            };
          })}
        />
        <Button
          size="sm"
          variant="ghost"
          onClick={() =>
            onInvestigate(
              comparison,
              detail.data.changes.map((change) => change.global_id),
            )
          }
        >
          调查此比较
        </Button>
      </div>
      <p className="viewer-toolbar-note">
        R{from?.sequence ?? comparison.from_revision_id.slice(0, 8)} → R
        {to?.sequence ?? comparison.to_revision_id.slice(0, 8)}
      </p>
      <div className="impact-summary">
        <span>
          <strong>{comparison.summary.added}</strong> 新增
        </span>
        <span>
          <strong>{comparison.summary.deleted}</strong> 删除
        </span>
        <span>
          <strong>{comparison.summary.changed}</strong> 变更
        </span>
      </div>
      {comparison.summary.warnings.map((warning) => (
        <p className="continuity-warning" role="status" key={warning}>
          GlobalId 连续性提醒：{warning}
        </p>
      ))}
      {noImpact ? (
        <div className="impact-empty">
          <strong>没有影响</strong>
          <span>比较完成，未发现构件变化。</span>
        </div>
      ) : packages.length ? (
        <div className="affected-packages">
          <span className="fact-label">受影响工作包</span>
          {packages.map((item) => (
            <button
              type="button"
              key={item.work_package_id}
              onClick={() =>
                onInspect({
                  workPackageId: item.work_package_id,
                  fromRevisionId: comparison.from_revision_id,
                  toRevisionId: comparison.to_revision_id,
                  changes: item.changes,
                })
              }
            >
              <strong>
                {demoWorkPackageName(
                  item.work_package_id,
                  workPackages.find((wp) => wp.id === item.work_package_id)
                    ?.name ?? "关联工作包",
                )}
              </strong>
              <span>{item.changes.length} 个变更构件 · 在 BIM 中查看</span>
            </button>
          ))}
        </div>
      ) : (
        <div className="impact-empty">
          <strong>有构件变化，暂无工作包影响</strong>
          <span>尚未有匹配这些 GlobalId 的人工确认绑定。</span>
        </div>
      )}
      <details className="evidence-register">
        <summary>比较依据 · {comparison.evidence_ids.length} 条</summary>
        {comparison.evidence_ids.map((id) => (
          <code key={id}>{id}</code>
        ))}
      </details>
    </section>
  );
}
