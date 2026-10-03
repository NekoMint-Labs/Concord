import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { apiUrl, requestHeaders } from "./client";
import { readRunEvents } from "./sse";
export { parseFrame } from "./sse";

export type RunEvent = {
  sequence: number;
  type: string;
  name?: string;
  stepName?: string;
  timestamp?: number;
  value?: Record<string, unknown>;
  message?: string;
};

export function useRunStream(
  runId?: string,
  active = true,
  generation = 0,
  project?: string,
) {
  const [events, setEvents] = useState<RunEvent[]>([]);
  const [error, setError] = useState("");
  const query = useQueryClient();
  useEffect(() => {
    setEvents([]);
    setError("");
    if (!runId || !active) return;
    const controller = new AbortController();
    const refresh = () =>
      Promise.all(
        ["workspace", "documents", "bim", "runs", "job", "timeline"].map(
          (key) => query.invalidateQueries({ queryKey: [key] }),
        ),
      ).then(() => {
        if (!project || !runId) return;
        return Promise.all([
          query.invalidateQueries({
            queryKey: ["investigation-report", project, runId],
          }),
          query.invalidateQueries({
            queryKey: ["current-operation-run", project, runId],
          }),
        ]);
      });
    void readRunEvents(
      apiUrl(`/api/runs/${encodeURIComponent(runId)}/events`),
      {
        headers: requestHeaders(),
        signal: controller.signal,
        onConnected: () => setError(""),
        onError: (message) => {
          setError(message);
          void refresh();
        },
        onEvent: (frame) => {
          const event = { ...frame.data, sequence: frame.id } as RunEvent;
          setEvents((previous) => [...previous, event].slice(-60));
          if (
            ["STATE_SNAPSHOT", "RUN_FINISHED", "RUN_ERROR"].includes(
              event.type,
            ) ||
            [
              "analysis",
              "action-result",
              "action-approved",
              "capability-result",
              "cancelled",
              "expired",
              "resumed",
            ].includes(event.name ?? "")
          ) {
            void refresh();
          }
        },
      },
    ).then(() => {
      if (!controller.signal.aborted) void refresh();
    });
    return () => controller.abort();
  }, [runId, active, generation, project, query]);
  return { events, error };
}
