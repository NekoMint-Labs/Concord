import { useQuery } from "@tanstack/react-query";
import { api, type AgentRun } from "../api/client";
import { useRunStream } from "../api/stream";
import { Button } from "../components/ui/button";
import { AppPopover } from "../components/ui/AppPopover";
import { Status } from "../components/Status";
import { domainLabel } from "../ui/labels";

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
        {/*
          The band's subject is the *analysis workflow*, and it says so.

          Its state word comes out of the shared status vocabulary, so 等待批准 and
          已阻塞 are the same two objects here and in the sidebar - which is
          exactly how a reader could take them for contradicting each other. They
          are two dimensions: the run's workflow position, and the work package's
          condition. 当前分析 was a noun phrase that named neither, so the two sat
          side by side as two unrelated verdicts; named as a dimension, the pair
          reads as one axis with a value on it, and the work package's own state
          above stays the other axis.
        */}
        <strong>分析流程</strong>
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
                {/*
                  The row's name is a run-stream frame: a step name, a custom
                  event name, or a frame type. All three are machine values in one
                  vocabulary (frontend/src/ui/labels.ts owns the words), and a
                  value the product does not know is shown as the identifier it is,
                  because splitting it into suspect prose is how a trace stops being
                  evidence of what the run did.
                */}
                <strong>
                  {domainLabel(
                    "runTrace",
                    row.name ?? row.stepName ?? row.type,
                  )}
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
