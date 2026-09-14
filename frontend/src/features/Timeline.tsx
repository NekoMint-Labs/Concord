import { useQuery } from "@tanstack/react-query";
import { api, type AgentRun } from "../api/client";
import { useRunStream } from "../api/stream";
import { Button } from "../components/ui/button";
import { statusLabel } from "../components/Status";

export function Timeline({
  run,
  perform,
}: {
  run?: AgentRun | null;
  perform: (fn: () => Promise<unknown>) => Promise<void>;
}) {
  const active =
    !!run &&
    ["QUEUED", "RUNNING", "WAITING_APPROVAL"].includes(run.status ?? "");
  const { events, error } = useRunStream(run?.id, active, run?.generation);
  const history = useQuery({
    queryKey: ["timeline", run?.id, run?.status, run?.generation],
    queryFn: () => api.timeline(run!.id!),
    enabled: !!run?.id,
  });
  const rows = events.length
    ? events
    : ((history.data ?? []).map((row) => ({
        ...row.payload,
        sequence: row.sequence,
      })) as typeof events);

  return (
    <section className="timeline" aria-label="分析过程">
      <div className="timeline-heading">
        <strong>当前分析</strong>
        <span className="timeline-status">
          {statusLabel(run?.status ?? "NO RUN")}
        </span>
        <details>
          <summary>查看过程</summary>
          <div className="timeline-details">
            <div className="timeline-run-meta">
              {run?.id?.slice(0, 8) ?? "—"}
            </div>
            {active && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => void perform(() => api.cancel(run!.id!))}
              >
                取消分析
              </Button>
            )}
            {run &&
              ["QUEUED", "FAILED", "CANCELLED", "EXPIRED"].includes(
                run.status ?? "",
              ) && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => void perform(() => api.resume(run.id!))}
                >
                  {run.status === "QUEUED" ? "重新派发" : "恢复"}
                </Button>
              )}
            <div className="timeline-events">
              {rows.slice(-7).map((row) => (
                <div className="timeline-event" key={row.sequence}>
                  <span className="mono">
                    {row.timestamp
                      ? new Date(row.timestamp).toLocaleTimeString()
                      : ""}
                  </span>
                  <strong>
                    {row.name ?? row.stepName ?? row.type?.replaceAll("_", " ")}
                  </strong>
                </div>
              ))}
            </div>
          </div>
        </details>
      </div>
      {error && (
        <small role="status" className="stream-warning">
          {error}；工作区仍可使用。
        </small>
      )}
      {run?.error && <p role="alert">{run.error}</p>}
    </section>
  );
}
