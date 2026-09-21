import type { ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { api, type DTO } from "../api/client";
import { ConcordAgent, type ConcordContext } from "./ConcordAgent";

vi.mock("../components/ui/AppPopover", () => ({
  AppPopover: ({
    trigger,
    children,
  }: {
    trigger: ReactNode;
    children: ReactNode;
  }) => (
    <div>
      {trigger}
      <div>{children}</div>
    </div>
  ),
  AppPopoverClose: ({ children }: { children: ReactNode }) => children,
}));

const context: ConcordContext = {
  projectName: "Campus Lab",
  sourceId: "source-1",
  sourceName: "MEP Model",
  fromRevisionId: "r1",
  fromRevisionLabel: "R1",
  revisionId: "r2",
  revisionLabel: "R2",
  workPackageId: "WP-27",
  elementIds: ["gid-1"],
};

function view() {
  return render(
    <QueryClientProvider client={new QueryClient()}>
      <ConcordAgent project="project" context={context} onRun={() => {}} />
    </QueryClientProvider>,
  );
}

afterEach(() => vi.restoreAllMocks());

it("defaults initiative to Suggest and persists an explicit mode change", async () => {
  vi.spyOn(api, "agentSettings").mockResolvedValue({ initiative: "suggest" });
  vi.spyOn(api, "agentNotices").mockResolvedValue([]);
  const configure = vi
    .spyOn(api, "setAgentSettings")
    .mockResolvedValue({ initiative: "manual" });
  view();
  expect(await screen.findByLabelText("Concord 主动模式")).toHaveValue(
    "suggest",
  );
  fireEvent.change(screen.getByLabelText("Concord 主动模式"), {
    target: { value: "manual" },
  });
  await waitFor(() =>
    expect(configure).toHaveBeenCalledWith("project", "manual"),
  );
});

it("keeps Ask read-only and only Investigate returns the current durable run", async () => {
  vi.spyOn(api, "agentSettings").mockResolvedValue({ initiative: "suggest" });
  vi.spyOn(api, "agentNotices").mockResolvedValue([]);
  const ask = vi.spyOn(api, "askAgent").mockResolvedValue({
    answer: {
      summary: "R2 is newer than the accepted baseline.",
      evidence_ids: [],
      limitations: [],
    },
    scope: {
      source_id: "source-1",
      from_revision_id: "r1",
      to_revision_id: "r2",
      work_package_ids: ["WP-27"],
      area_ids: [],
      element_ids: ["gid-1"],
    },
    evidence: [],
    tools: [],
    persisted: false,
  });
  const investigate = vi.spyOn(api, "investigate").mockResolvedValue({
    id: "run-current",
    project_id: "project",
    event_id: null,
    status: "QUEUED",
    runtime: "dbos",
    runtime_execution_id: null,
    generation: 1,
    runtime_generation: 1,
    category: "investigation",
    analysis_id: null,
    error: null,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
  } satisfies DTO<"AgentRun">);
  const onRun = vi.fn();
  render(
    <QueryClientProvider client={new QueryClient()}>
      <ConcordAgent project="project" context={context} onRun={onRun} />
    </QueryClientProvider>,
  );
  fireEvent.change(screen.getByPlaceholderText(/解释当前上下文/), {
    target: { value: "Why is this pending?" },
  });
  fireEvent.click(screen.getByRole("button", { name: "询问" }));
  expect(await screen.findByText(/R2 is newer/)).toBeVisible();
  expect(screen.getByText(/未保存为 Evidence/)).toBeVisible();
  expect(ask).toHaveBeenCalledOnce();
  expect(ask).toHaveBeenCalledWith("project", {
    instruction: "Why is this pending?",
    scope: {
      source_id: "source-1",
      from_revision_id: "r1",
      to_revision_id: "r2",
      work_package_ids: ["WP-27"],
      element_ids: ["gid-1"],
    },
  });
  expect(onRun).not.toHaveBeenCalled();

  fireEvent.click(screen.getByRole("button", { name: "调查此工作包" }));
  await waitFor(() =>
    expect(investigate).toHaveBeenCalledWith("project", {
      instruction: "调查当前工作包",
      scope: {
        source_id: "source-1",
        from_revision_id: "r1",
        to_revision_id: "r2",
        work_package_ids: ["WP-27"],
        element_ids: ["gid-1"],
      },
    }),
  );
});

it("does not present an old run result as the current operation", () => {
  vi.spyOn(api, "agentSettings").mockResolvedValue({ initiative: "suggest" });
  vi.spyOn(api, "agentNotices").mockResolvedValue([]);
  render(
    <QueryClientProvider client={new QueryClient()}>
      <ConcordAgent
        project="project"
        context={context}
        currentRun={{
          id: "run-current",
          project_id: "project",
          event_id: null,
          status: "RUNNING",
          runtime: "dbos",
          runtime_execution_id: null,
          generation: 2,
          runtime_generation: 2,
          category: "investigation",
          analysis_id: null,
          error: null,
          created_at: "2026-01-01T00:00:00Z",
          updated_at: "2026-01-01T00:00:00Z",
        }}
        report={{
          run_id: "run-old",
          analysis_id: "analysis-old",
          generation: 1,
          persisted: true,
          answer: {
            summary: "Old failed investigation",
            evidence_ids: [],
            limitations: [],
          },
          scope: {
            source_id: null,
            from_revision_id: null,
            to_revision_id: null,
            work_package_ids: [],
            area_ids: [],
            element_ids: [],
          },
          evidence: [],
          tools: [],
        }}
        onRun={() => {}}
      />
    </QueryClientProvider>,
  );
  expect(screen.getByText("run-curr")).toBeVisible();
  expect(screen.queryByText("Old failed investigation")).toBeNull();
});
