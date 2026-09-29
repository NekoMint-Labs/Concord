import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import fixture from "../../tests/fixtures/inspector.json";
import { api, type Workspace } from "../api/client";
import { WorkList } from "./WorkList";

afterEach(() => vi.restoreAllMocks());

/** The inbox's context region reads the same project queries the header does. */
function cache() {
  return new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
}

it("routes authoritative approval and stale states to one next action", () => {
  vi.spyOn(api, "baselines").mockResolvedValue([]);
  vi.spyOn(api, "documents").mockResolvedValue([]);
  const workspace = structuredClone(fixture.waiting) as unknown as Workspace;
  const onPackage = vi.fn();
  const onRecheck = vi.fn();
  const props = {
    workspace,
    sources: [],
    onPackage,
    onRecheck,
    onModels: vi.fn(),
    onReport: vi.fn(),
    onProject: vi.fn(),
    onTab: vi.fn(),
  };
  const view = render(
    <QueryClientProvider client={cache()}>
      <WorkList {...props} />
    </QueryClientProvider>,
  );
  const needs = screen.getByRole("region", { name: "需要处理" });
  expect(within(needs).getByText(/需要决定/)).toBeVisible();
  fireEvent.click(within(needs).getByRole("button", { name: "处理 →" }));
  expect(onPackage).toHaveBeenCalledWith("WP-200");

  workspace.proposals = [];
  workspace.stale = true;
  workspace.analysis_run = { ...workspace.analysis_run!, status: "FAILED" };
  view.rerender(
    <QueryClientProvider client={cache()}>
      <WorkList {...props} />
    </QueryClientProvider>,
  );
  fireEvent.click(
    within(screen.getByRole("region", { name: "需要处理" })).getAllByRole(
      "button",
      { name: "重新检查 →" },
    )[0],
  );
  expect(onRecheck).toHaveBeenCalledOnce();
});

it("shows a pending model as work without claiming a newer baseline", () => {
  vi.spyOn(api, "baselines").mockResolvedValue([]);
  vi.spyOn(api, "documents").mockResolvedValue([]);
  vi.spyOn(api, "sourceRevisions").mockResolvedValue([]);
  const workspace = structuredClone(fixture.waiting) as unknown as Workspace;
  workspace.proposals = [];
  workspace.stale = false;
  workspace.analysis!.readiness = workspace.analysis!.readiness.map((row) => ({
    ...row,
    status: "READY",
  }));
  const onModels = vi.fn();
  render(
    <QueryClientProvider client={cache()}>
      <WorkList
        workspace={workspace}
        sources={[
          {
            source: {
              id: "model",
              project_id: "harbor-east",
              name: "MEP",
              kind: "BIM",
              created_at: "2026-01-01T00:00:00Z",
            },
            latest_revision_id: "r2",
            accepted_revision_id: "r1",
            baseline_id: "b1",
            has_pending_revision: true,
          },
        ]}
        onPackage={vi.fn()}
        onModels={onModels}
        onRecheck={vi.fn()}
        onReport={vi.fn()}
        onProject={vi.fn()}
        onTab={vi.fn()}
      />
    </QueryClientProvider>,
  );
  const needs = screen.getByRole("region", { name: "需要处理" });
  expect(within(needs).getByText("MEP 有新版本")).toBeVisible();
  fireEvent.click(within(needs).getByRole("button", { name: "处理新版本 →" }));
  expect(onModels).toHaveBeenCalledOnce();
  expect(screen.getByRole("region", { name: "最近完成" })).toHaveTextContent(
    "基于当前基线",
  );
});
