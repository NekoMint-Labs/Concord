import type { ProjectSourceStatus } from "../api/client";
import { statusLabel } from "../ui/labels";
import { demoInvestigationText } from "../ui/demo/demoPresentation";
import { Button } from "../components/ui/button";
import type { SourceContextPaneProps } from "./SourceContextPane";

/** Only the selected source's operation and report are passed by the pane. */
export function SourceContextInvestigation({
  scopedOperation,
  scopedReport,
  latestRevisionId,
  label,
  onOpenInvestigation,
}: {
  scopedOperation?: SourceContextPaneProps["investigation"];
  scopedReport?: SourceContextPaneProps["report"];
  latestRevisionId: ProjectSourceStatus["latest_revision_id"];
  label: (id?: string | null) => string;
  onOpenInvestigation?: SourceContextPaneProps["onOpenInvestigation"];
}) {
  return (
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
            {scopedReport.scope.to_revision_id === latestRevisionId
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
            <Button size="sm" variant="ghost" onClick={onOpenInvestigation}>
              查看调查结果
            </Button>
          )}
        </>
      )}
    </section>
  );
}
