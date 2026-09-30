import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, expect, it, vi } from "vitest";
import { api, type AgentRun } from "../api/client";
import { useConcordAgent } from "./useConcordAgent";

const client = new QueryClient({
  defaultOptions: { queries: { retry: false } },
});
afterEach(() => {
  vi.restoreAllMocks();
  client.clear();
});
function wrapper({ children }: { children: ReactNode }) {
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

it("clears stale Agent BIM scope when the project changes", async () => {
  const { result, rerender } = renderHook(
    ({ project }) =>
      useConcordAgent({
        project,
        projectName: project,
        sources: [
          {
            source: {
              id: "source",
              project_id: project,
              name: "MEP",
              kind: "BIM",
              created_at: "2026-01-01T00:00:00Z",
            },
            latest_revision_id: "r2",
            accepted_revision_id: "r1",
            baseline_id: "b1",
            has_pending_revision: true,
          },
        ],
      }),
    { wrapper, initialProps: { project: "project-a" } },
  );

  act(() => {
    result.current.bimContext("source", "r2", ["gid"], "r1", "R2", "R1");
  });
  expect(result.current.context).toMatchObject({
    sourceId: "source",
    fromRevisionId: "r1",
    revisionId: "r2",
    elementIds: ["gid"],
  });

  rerender({ project: "project-b" });
  await waitFor(() =>
    expect(result.current.context).toMatchObject({
      projectName: "project-b",
      elementIds: [],
    }),
  );
  expect(result.current.context.sourceId).toBeUndefined();
  expect(result.current.context.fromRevisionId).toBeUndefined();
  expect(result.current.context.revisionId).toBeUndefined();
  expect(result.current.activeRun).toBeUndefined();
});

const run = (id: string, project = "project"): AgentRun => ({
  id,
  project_id: project,
  category: "investigation",
  event_id: null,
  status: "QUEUED",
  runtime: "dbos",
  runtime_execution_id: null,
  generation: 0,
  runtime_generation: 0,
  analysis_id: null,
  error: null,
  created_at: "2026-01-01T00:00:00Z",
  updated_at: "2026-01-01T00:00:00Z",
});

it("latest launch wins and an old failure cannot overlay success", async () => {
  vi.spyOn(api, "runs").mockResolvedValue([]);
  vi.spyOn(api, "run").mockImplementation(async (id) => run(id));
  vi.spyOn(api, "investigation").mockResolvedValue(null);
  let failOld!: (cause: Error) => void;
  vi.spyOn(api, "investigate")
    .mockImplementationOnce(
      () =>
        new Promise((_, reject) => {
          failOld = reject;
        }),
    )
    .mockResolvedValueOnce(run("latest"));
  const { result } = renderHook(
    () => useConcordAgent({ project: "project", projectName: "Project" }),
    { wrapper },
  );
  let old!: Promise<AgentRun | undefined>;
  act(() => {
    old = result.current.startInvestigation("old", {});
  });
  await act(async () => {
    await result.current.startInvestigation("latest", {});
  });
  await act(async () => {
    failOld(new Error("old failure"));
    await old;
  });
  expect(result.current.activeRun?.id).toBe("latest");
  expect(result.current.error).toBe("");
});

it("project switch fences a late launch and source scope excludes an unrelated WP", async () => {
  vi.spyOn(api, "runs").mockResolvedValue([]);
  let finish!: (next: AgentRun) => void;
  vi.spyOn(api, "investigate").mockImplementation(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  const { result, rerender } = renderHook(
    ({ project }) =>
      useConcordAgent({
        project,
        projectName: project,
        workPackageId: "unrelated",
      }),
    { wrapper, initialProps: { project: "project" } },
  );
  act(() => {
    result.current.sourceContext("source", "r2", "R2", "r1", "R1");
  });
  expect(result.current.context.workPackageId).toBeUndefined();
  let pending!: Promise<AgentRun | undefined>;
  act(() => {
    pending = result.current.startInvestigation("old", {});
  });
  rerender({ project: "other" });
  await act(async () => {
    finish(run("late"));
    await pending;
  });
  expect(result.current.activeRun).toBeUndefined();
  expect(result.current.error).toBe("");
});

it("an import run cannot replace the source investigation context with its older submission scope", async () => {
  const imported = {
    ...run("import"),
    category: "bim_import",
    status: "FAILED",
  } as AgentRun;
  vi.spyOn(api, "runs").mockResolvedValue([]);
  vi.spyOn(api, "run").mockResolvedValue(imported);
  const { result } = renderHook(
    () => useConcordAgent({ project: "project", projectName: "Project" }),
    { wrapper },
  );
  act(() => result.current.rememberRun(imported));
  act(() =>
    result.current.sourceContext(
      "actual-source",
      "actual-r2",
      "R2",
      "actual-r1",
      "R1",
    ),
  );
  await waitFor(() =>
    expect(result.current.currentRun.data?.category).toBe("bim_import"),
  );
  expect(result.current.reportContext).toMatchObject({
    sourceId: "actual-source",
    revisionId: "actual-r2",
    fromRevisionId: "actual-r1",
  });
  expect(result.current.investigation.data).toBeUndefined();
});
