import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "../api/client";
import { Status } from "../components/Status";
import { AppDisclosure } from "../components/ui/AppDisclosure";
import { AppSelect } from "../components/ui/AppSelect";
import { Button } from "../components/ui/button";
import { domainLabel, statusLabel } from "../ui/labels";

/**
 * A record rendered structurally: one label/value row per field, nested objects
 * as their own indented rows, and a list flattened to a line when it holds only
 * scalars. The job result and the timeline payloads used to be printed as
 * `JSON.stringify` blobs under the headings 结果 and the trace; a raw payload is
 * not the product's language, so it only survives behind an explicit
 * [raw result] / [debug event] disclosure at the bottom of each block.
 *
 * Field names are internal identifiers and are shown as they arrive, never
 * translated - they belong to the API, not to the person reading the record.
 */
function StructuredValue({ value }: { value: unknown }) {
  if (value === null || value === undefined) {
    return <span className="value-empty">—</span>;
  }
  if (Array.isArray(value)) {
    if (value.every((item) => item === null || typeof item !== "object")) {
      return <span>{value.map((item) => String(item)).join(", ")}</span>;
    }
    return (
      <div className="value-nested">
        {value.map((item, index) => (
          <StructuredValue key={index} value={item} />
        ))}
      </div>
    );
  }
  if (typeof value === "object") {
    return <StructuredRows data={value as Record<string, unknown>} />;
  }
  return <span>{String(value)}</span>;
}

function StructuredRows({ data }: { data: Record<string, unknown> }) {
  const entries = Object.entries(data);
  if (entries.length === 0) return <span className="value-empty">—</span>;
  return (
    <dl className="value-rows">
      {entries.map(([key, value]) => (
        <div className="value-row" key={key}>
          <dt>{key}</dt>
          <dd>
            <StructuredValue value={value} />
          </dd>
        </div>
      ))}
    </dl>
  );
}

export function RunHistory({
  project,
  preferred,
  perform,
}: {
  project: string;
  preferred?: string;
  perform: (fn: () => Promise<unknown>) => Promise<void>;
}) {
  const [chosen, setChosen] = useState("");
  const runs = useQuery({
    queryKey: ["runs", project],
    queryFn: () => api.runs(project),
    refetchInterval: 2000,
  });
  const selected =
    runs.data?.find((run) => run.id === (chosen || preferred)) ??
    runs.data?.[0];
  const timeline = useQuery({
    queryKey: [
      "timeline",
      selected?.id,
      selected?.status,
      selected?.generation,
    ],
    queryFn: () => api.timeline(selected!.id),
    enabled: !!selected,
    refetchInterval:
      selected &&
      ["QUEUED", "RUNNING", "WAITING_APPROVAL"].includes(selected.status)
        ? 2000
        : false,
  });
  const job = useQuery({
    queryKey: ["job", selected?.id, selected?.status, selected?.generation],
    queryFn: () => api.job(selected!.id),
    enabled: !!selected && selected.category !== "coordination",
  });
  return (
    <section className="run-history" aria-label="运行记录">
      <div className="view-heading">
        <h3>运行记录与结果</h3>
        <span className="muted">最近 200 次运行</span>
      </div>
      <AppSelect
        label="查看运行"
        value={selected?.id ?? ""}
        onChange={setChosen}
        options={(runs.data ?? []).map((run) => ({
          /* the option reads structurally: the two domain words first, the id
             kept to the support column because it is a technical identifier */
          value: run.id,
          label: `${domainLabel("category", run.category)} · ${statusLabel(run.status)}`,
          hint: <code>{run.id.slice(0, 8)}</code>,
        }))}
      />
      {selected && (
        <>
          <div className="run-summary">
            <Status value={selected.status} />
            <code>{selected.id}</code>
            <span>{selected.runtime}</span>
            {["QUEUED", "RUNNING", "WAITING_APPROVAL"].includes(
              selected.status,
            ) && (
              <Button
                size="sm"
                variant="secondary"
                onClick={() => void perform(() => api.cancel(selected.id))}
              >
                取消运行
              </Button>
            )}
            {["QUEUED", "FAILED", "CANCELLED", "EXPIRED"].includes(
              selected.status,
            ) && (
              <Button
                size="sm"
                variant="secondary"
                onClick={() => void perform(() => api.resume(selected.id))}
              >
                重试 / 恢复
              </Button>
            )}
          </div>
          {selected.error && (
            <p role="alert" className="alert">
              {selected.error}
            </p>
          )}
          {job.data && (
            <div className="job-result">
              <span className="eyebrow">
                快照 {job.data.snapshot_id?.slice(0, 12) ?? "未捕获"}
              </span>
              <h4>结果</h4>
              {job.data.result ? (
                <StructuredRows data={job.data.result} />
              ) : (
                <p>尚未提交成功的结果。</p>
              )}
              {job.data.result && (
                <AppDisclosure label="原始结果">
                  <pre>{JSON.stringify(job.data.result, null, 2)}</pre>
                </AppDisclosure>
              )}
            </div>
          )}
          <details>
            <summary>
              安全执行轨迹（{timeline.data?.length ?? 0} 个事件）
            </summary>
            <ol className="trace-list">
              {timeline.data?.slice(-50).map((event) => (
                <li key={event.sequence}>
                  <code>{event.sequence}</code>
                  <StructuredRows data={event.payload} />
                  <AppDisclosure label="调试事件">
                    <pre>{JSON.stringify(event.payload, null, 2)}</pre>
                  </AppDisclosure>
                </li>
              ))}
            </ol>
          </details>
        </>
      )}
      {(runs.error || job.error || timeline.error) && (
        <p role="alert">部分运行详情无法加载。</p>
      )}
    </section>
  );
}
