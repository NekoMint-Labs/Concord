import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "../api/client";
import { PropertyRow, PropertyTable } from "../components/PropertyTable";
import { Status } from "../components/Status";
import { AppDisclosure } from "../components/ui/AppDisclosure";
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

function traceSummary(payload: Record<string, unknown>) {
  const type = String(payload.type ?? "EVENT");
  const labels: Record<string, string> = {
    RUN_STARTED: "运行已开始",
    STEP_STARTED: "步骤已开始",
    STEP_FINISHED: "步骤已完成",
    RUN_FINISHED: "运行已完成",
    CUSTOM: "已记录工程快照",
  };
  const step = payload.stepName ?? payload.step_name;
  const snapshot = payload.snapshotId ?? payload.snapshot_id;
  return {
    title: labels[type] ?? "执行事件",
    detail: step
      ? String(step)
      : snapshot
        ? `快照 ${String(snapshot).slice(0, 12)}`
        : undefined,
  };
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
      <div className="run-register">
        <header className="pane-header">
          <span className="pane-header-label">运行记录</span>
          <span className="count">{runs.data?.length ?? 0}</span>
        </header>
        <div className="run-list">
          {runs.data?.map((run) => (
            <button
              type="button"
              key={run.id}
              className={run.id === selected?.id ? "selected" : ""}
              onClick={() => setChosen(run.id)}
            >
              <span>
                <strong>{domainLabel("category", run.category)}</strong>
                <small>
                  {run.id.slice(0, 8)} · 第 {run.generation} 代
                </small>
              </span>
              <span className="run-list-state">{statusLabel(run.status)}</span>
            </button>
          ))}
          {runs.data?.length === 0 && (
            <p className="quiet-message pane-empty">尚无运行记录。</p>
          )}
        </div>
      </div>

      <div className="run-detail">
        {selected ? (
          <>
            <header className="run-detail-heading">
              <div>
                <span className="eyebrow">
                  {domainLabel("category", selected.category)}
                </span>
                <h3>运行 {selected.id.slice(0, 8)}</h3>
              </div>
              <Status value={selected.status} />
            </header>
            <PropertyTable className="run-properties" columns={2}>
              <PropertyRow
                label="运行标识"
                value={
                  <code title={selected.id}>{selected.id.slice(0, 16)}</code>
                }
              />
              <PropertyRow label="运行时" value={selected.runtime} />
              <PropertyRow label="代次" value={selected.generation} />
              <PropertyRow
                label="更新时间"
                value={new Date(selected.updated_at).toLocaleString("zh-CN")}
              />
            </PropertyTable>
            <div className="run-actions">
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
              <section className="job-result">
                <div className="run-section-heading">
                  <div>
                    <span className="eyebrow">运行结果</span>
                    <h4>结构化输出</h4>
                  </div>
                  <span className="mono">
                    {job.data.snapshot_id?.slice(0, 12) ?? "未捕获快照"}
                  </span>
                </div>
                {job.data.result ? (
                  <StructuredRows data={job.data.result} />
                ) : (
                  <p className="quiet-message">尚未提交成功的结果。</p>
                )}
                {job.data.result && (
                  <AppDisclosure label="原始结果">
                    <pre>{JSON.stringify(job.data.result, null, 2)}</pre>
                  </AppDisclosure>
                )}
              </section>
            )}
            <section className="run-trace" aria-label="执行轨迹">
              <div className="run-section-heading">
                <div>
                  <span className="eyebrow">活动</span>
                  <h4>安全执行轨迹</h4>
                </div>
                <span className="count">{timeline.data?.length ?? 0}</span>
              </div>
              <ol className="trace-list">
                {timeline.data?.slice(-50).map((event) => {
                  const summary = traceSummary(event.payload);
                  return (
                    <li key={event.sequence}>
                      <span className="trace-sequence">{event.sequence}</span>
                      <div className="trace-summary">
                        <strong>{summary.title}</strong>
                        {summary.detail && <small>{summary.detail}</small>}
                      </div>
                      <AppDisclosure label="技术详情">
                        <StructuredRows data={event.payload} />
                        <pre>{JSON.stringify(event.payload, null, 2)}</pre>
                      </AppDisclosure>
                    </li>
                  );
                })}
              </ol>
              {timeline.data?.length === 0 && (
                <p className="quiet-message">尚无执行事件。</p>
              )}
            </section>
          </>
        ) : (
          <div className="empty-pane">
            <span>
              <strong>选择一条运行记录</strong>
              <small>查看结果、元数据和执行轨迹</small>
            </span>
          </div>
        )}
      </div>
      {(runs.error || job.error || timeline.error) && (
        <p className="run-history-error" role="alert">
          部分运行详情无法加载。
        </p>
      )}
    </section>
  );
}
