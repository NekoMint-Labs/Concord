import { fireEvent, render, screen } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { ContextRunProgress } from "./ContextRunProgress";
import type { AgentRun } from "../api/client";
vi.mock("../api/stream", () => ({
  useRunStream: () => ({
    events: [
      { sequence: 1, type: "CUSTOM", name: "snapshot-captured" },
      { sequence: 2, type: "STEP_STARTED", stepName: "capture-and-evaluate" },
    ],
  }),
}));
it("shows actual run activity and keeps failed runs recoverable without fabricated progress", () => {
  const retry = vi.fn();
  const run = {
    id: "actual-run",
    project_id: "project",
    generation: 0,
    status: "FAILED",
    error: "PARSE: invalid source",
  } as AgentRun;
  render(<ContextRunProgress run={run} onRetry={retry} />);
  expect(screen.getByRole("status")).toHaveTextContent("调查失败");
  expect(screen.getByText("已记录快照")).toBeVisible();
  expect(screen.getByText("采集并判定")).toBeVisible();
  expect(screen.getByRole("alert")).toHaveTextContent("PARSE: invalid source");
  expect(document.body.textContent).not.toContain("%");
  fireEvent.click(screen.getByRole("button", { name: "重试调查" }));
  expect(retry).toHaveBeenCalledOnce();
});
