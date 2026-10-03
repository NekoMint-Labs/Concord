import type { AgentRun } from "../api/client";
import { useRunStream } from "../api/stream";
import { domainLabel, statusLabel } from "../ui/labels";
import { Button } from "../components/ui/button";

/** Coarse, real persisted/SSE events; no simulated reasoning steps or percentages. */
export function ContextRunProgress({
  run,
  error,
  onRetry,
}: {
  run?: AgentRun | null;
  error?: string;
  onRetry?: () => void;
}) {
  const stream = useRunStream(run?.id, !!run, run?.generation, run?.project_id);
  if (!run && !error) return null;
  return (
    <section aria-label="Concord 调查进度" className="context-agent-result">
      <strong role="status">
        {error || run?.status === "FAILED"
          ? "调查失败"
          : run?.status === "COMPLETED"
            ? "调查完成"
            : run?.status === "WAITING_APPROVAL"
              ? "等待批准"
              : run
                ? `Concord ${statusLabel(run.status)}`
                : "正在提交调查"}
      </strong>
      {stream.events.length > 0 && (
        <ol>
          {stream.events.slice(-5).map((event) => (
            <li key={event.sequence}>
              {domainLabel(
                "runTrace",
                event.name || event.stepName || event.type,
              )}
            </li>
          ))}
        </ol>
      )}
      {(error || run?.error) && (
        <p role="alert">
          调查未完成，已保存的项目事实保持不变。{error || run?.error}
        </p>
      )}
      {(error ||
        (run && ["FAILED", "CANCELLED", "EXPIRED"].includes(run.status))) &&
        onRetry && (
          <Button size="sm" variant="secondary" onClick={onRetry}>
            重试调查
          </Button>
        )}
    </section>
  );
}
