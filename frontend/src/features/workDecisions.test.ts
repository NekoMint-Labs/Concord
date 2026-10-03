import { expect, it, vi } from "vitest";
import fixture from "../../tests/fixtures/inspector.json";
import type { Workspace } from "../api/client";
import { buildWorkDecisions } from "./workDecisions";

it.each([
  "approval",
  "blocked",
  "stale",
  "failed",
  "checking",
  "unchecked",
  "ready",
] as const)(
  "projects %s without changing authoritative state or triggering actions",
  (scenario) => {
    const workspace = structuredClone(fixture.waiting) as unknown as Workspace;
    const actions = {
      onPackage: vi.fn(),
      onModels: vi.fn(),
      onRecheck: vi.fn(),
      onReport: vi.fn(),
    };
    if (scenario !== "approval") workspace.proposals = [];
    if (scenario === "stale") workspace.stale = true;
    if (scenario === "failed") workspace.analysis_run!.status = "FAILED";
    if (scenario === "checking") {
      workspace.stale = true;
      workspace.analysis_run!.status = "RUNNING";
    }
    if (scenario === "unchecked") {
      workspace.analysis = null;
      workspace.analysis_run = null;
      workspace.run = null;
    }
    if (scenario === "ready")
      workspace.analysis!.readiness.forEach((item) => {
        item.status = "READY";
      });
    const before = structuredClone(workspace);
    const { needs, waiting, completed } = buildWorkDecisions(
      workspace,
      [],
      null,
      actions,
    );
    const decision = [...needs, ...waiting, ...completed].find(
      (item) => item.key === "WP-200",
    )!;
    const states = {
      approval: "待批准",
      blocked: "已阻塞",
      stale: "需复核",
      failed: "需复核",
      checking: "检查中",
      unchecked: "待检查",
      ready: "可施工",
    };
    expect(decision.state).toBe(states[scenario]);
    expect(workspace).toEqual(before);
    for (const action of Object.values(actions))
      expect(action).not.toHaveBeenCalled();
    decision.open();
    if (scenario === "stale" || scenario === "failed")
      expect(actions.onRecheck).toHaveBeenCalledOnce();
    else expect(actions.onPackage).toHaveBeenCalledWith("WP-200");
  },
);

it("does not promote a changed model or obsolete proposal into an authoritative blocker", () => {
  const workspace = structuredClone(fixture.waiting) as unknown as Workspace;
  workspace.analysis!.readiness.forEach((item) => {
    item.status = "READY";
  });
  workspace.analysis_run!.generation++;
  const actions = {
    onPackage: vi.fn(),
    onModels: vi.fn(),
    onRecheck: vi.fn(),
    onReport: vi.fn(),
  };
  const { needs, completed } = buildWorkDecisions(
    workspace,
    [
      {
        source: {
          id: "model",
          project_id: "harbor-east",
          kind: "BIM",
          name: "Actual model",
          created_at: "2026-01-01T00:00:00Z",
        },
        latest_revision_id: "r2",
        accepted_revision_id: "r1",
        baseline_id: "b1",
        has_pending_revision: true,
      },
    ],
    null,
    actions,
  );
  expect(
    needs.some((item) => item.state === "待批准" || item.state === "已阻塞"),
  ).toBe(false);
  expect(completed.find((item) => item.key === "WP-200")?.state).toBe("可施工");
});
