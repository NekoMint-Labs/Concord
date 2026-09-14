import { useQuery } from "@tanstack/react-query";
import { api, type AgentRun } from "../api/client";
import { useRunStream } from "../api/stream";
import { Button } from "../components/ui/button";
import { AppPopover } from "../components/ui/AppPopover";
import { Status } from "../components/Status";

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
        {/*
          The run's state is stated with the same object the sidebar uses for
          the same kind of fact, so the word a reader learns in one place is
          legible in the other. It replaced 12px muted text, which made the most
          important fact about the run in progress the quietest thing on screen.
        */}
        <Status value={run?.status ?? "NO RUN"} />
        {/* the trace is a floating detail, not a strip: it opens over the run
            surface, dismisses on a click outside, and returns focus when it
            closes */}
        <AppPopover
          label="分析过程"
          side="top"
          trigger={<button className="quiet-trigger">查看过程</button>}
        >
          <div className="timeline-run-meta">{run?.id?.slice(0, 8) ?? "—"}</div>
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
                <span>
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
        </AppPopover>
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
