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
  expect(result.current.contextualRun?.id).toBe(imported.id);
});

const engineeringScope = {
  sourceId: "source",
  fromRevisionId: "r1",
  revisionId: "r2",
  elementIds: ["gid-1", "gid-2"],
};

function investigationView() {
  const completed = {
    ...run("r2-investigation"),
    status: "COMPLETED",
    analysis_id: "analysis",
  } as AgentRun;
  const report = {
    run_id: completed.id,
    generation: completed.generation,
    analysis_id: completed.analysis_id!,
    persisted: true,
    scope: {
      source_id: "source",
      from_revision_id: "r1",
      to_revision_id: "r2",
      work_package_ids: ["WP-A"],
      area_ids: [],
      element_ids: ["gid-1", "gid-2"],
    },
    answer: {
      summary: "Historical R2 / WP-A",
      evidence_ids: [],
      limitations: [],
    },
    evidence: [],
    tools: [],
  };
  vi.spyOn(api, "runs").mockResolvedValue([completed]);
  vi.spyOn(api, "run").mockResolvedValue(completed);
  vi.spyOn(api, "investigation").mockResolvedValue(report);
  vi.spyOn(api, "sourceRevisions").mockResolvedValue([]);
  vi.spyOn(api, "investigate").mockResolvedValue(completed);
  const view = renderHook(
    ({ project, workPackageId, projectName }) =>
      useConcordAgent({ project, projectName, workPackageId }),
    {
      wrapper,
      initialProps: {
        project: "project",
        workPackageId: "WP-A",
        projectName: "Project",
      },
    },
  );
  act(() =>
    view.result.current.bimContext(
      "source",
      "r2",
      engineeringScope.elementIds,
      "r1",
    ),
  );
  const start = async () => {
    await act(async () => {
      await view.result.current.startInvestigation("Check R2");
    });
    await waitFor(() =>
      expect(view.result.current.contextualReport?.answer.summary).toBe(
        "Historical R2 / WP-A",
      ),
    );
  };
  return { ...view, start, completed, report };
}

it.each([
  "revision",
  "baseline",
  "source",
  "selection",
  "work package",
  "clearScope",
])(
  "disassociates the current Investigation when %s changes without losing history",
  async (field) => {
    const { result, rerender, start, completed, report } = investigationView();
    // Even matching persisted history alone is not a current-context operation.
    await waitFor(() =>
      expect(result.current.investigation.data).toEqual(report),
    );
    expect(result.current.contextualRun).toBeUndefined();
    await start();
    // Header onRun is an acknowledgement, not a new scope assignment.
    act(() => result.current.rememberRun(completed));
    expect(result.current.contextualRun?.id).toBe(completed.id);
    if (field === "work package")
      rerender({
        project: "project",
        projectName: "Project",
        workPackageId: "WP-B",
      });
    else
      act(() => {
        if (field === "clearScope") result.current.clearScope();
        else
          result.current.bimContext(
            field === "source" ? "other-source" : "source",
            field === "revision" ? "r3" : "r2",
            field === "selection" ? ["gid-3"] : engineeringScope.elementIds,
            field === "baseline" ? "r0" : "r1",
          );
      });
    expect(result.current.contextualRun).toBeUndefined();
    expect(result.current.contextualReport).toBeUndefined();
    expect(result.current.currentRun.data?.id).toBe(completed.id);
    expect(result.current.investigation.data).toEqual(report);
    expect(result.current.reportContext).toMatchObject({
      ...engineeringScope,
      workPackageId: "WP-A",
    });
    expect(client.getQueryData(["runs", "project"])).toEqual([completed]);
    rerender({
      project: "project",
      projectName: "Project",
      workPackageId: "WP-A",
    });
    act(() =>
      result.current.bimContext(
        "source",
        "r2",
        engineeringScope.elementIds,
        "r1",
      ),
    );
    expect(result.current.contextualRun).toBeUndefined();
    // A new explicit submission intentionally associates a run again.
    await start();
  },
);

it("retains association for element ordering and label/name-only changes", async () => {
  const { result, rerender, start, completed } = investigationView();
  await start();
  rerender({
    project: "project",
    projectName: "Renamed project",
    workPackageId: "WP-A",
  });
  act(() =>
    result.current.bimContext(
      "source",
      "r2",
      ["gid-2", "gid-1"],
      "r1",
      "New R2 label",
      "New R1 label",
    ),
  );
  expect(result.current.contextualRun?.id).toBe(completed.id);
  expect(result.current.contextualReport).toBeDefined();
});

it.each([false, true])(
  "a late Investigation remains historical after A → B (return to A: %s)",
  async (returnToA) => {
    const { result, completed } = investigationView();
    let finish!: (next: AgentRun) => void;
    vi.mocked(api.investigate).mockImplementation(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    let pending!: Promise<AgentRun | undefined>;
    act(() => {
      pending = result.current.startInvestigation("Check R2");
    });
    act(() =>
      result.current.bimContext(
        "source",
        "r3",
        engineeringScope.elementIds,
        "r1",
      ),
    );
    if (returnToA)
      act(() =>
        result.current.bimContext(
          "source",
          "r2",
          engineeringScope.elementIds,
          "r1",
        ),
      );
    await act(async () => {
      finish(completed);
      await pending;
    });
    act(() => result.current.rememberRun(completed));
    expect(result.current.contextualRun).toBeUndefined();
    await waitFor(() =>
      expect(result.current.investigation.data?.answer.summary).toBe(
        "Historical R2 / WP-A",
      ),
    );
    expect(result.current.reportContext).toMatchObject({
      revisionId: "r2",
      workPackageId: "WP-A",
    });
  },
);

it("associates a scope update and explicit Investigation submitted in the same event", async () => {
  const { result, completed } = investigationView();
  await act(async () => {
    result.current.bimContext("source", "r3", ["gid-3"], "r2");
    await result.current.startInvestigation("Check R3", {
      sourceId: "source",
      revisionId: "r3",
      fromRevisionId: "r2",
      workPackageId: "WP-A",
      elementIds: ["gid-3"],
    });
  });
  expect(result.current.contextualRun?.id).toBe(completed.id);
  expect(api.investigate).toHaveBeenCalledWith(
    "project",
    expect.objectContaining({
      scope: expect.objectContaining({
        to_revision_id: "r3",
        element_ids: ["gid-3"],
      }),
    }),
  );
});

it("project switching fences both contextual and historical Investigation presentation", async () => {
  const { result, rerender, start } = investigationView();
  await start();
  rerender({ project: "other", projectName: "Other", workPackageId: "WP-A" });
  expect(result.current.contextualRun).toBeUndefined();
  expect(result.current.currentRun.data).toBeUndefined();
  expect(result.current.investigation.data).toBeUndefined();
});

it("a source-scoped Investigation excludes the unrelated selected package and retains its label-only association", async () => {
  const { result, completed } = investigationView();
  await act(async () => {
    result.current.sourceContext("source", "r2", "R2", "r1", "R1");
    await result.current.startInvestigation("Check source", {
      ...engineeringScope,
      elementIds: [],
      workPackageId: null,
    });
  });
  expect(result.current.context.workPackageId).toBeUndefined();
  expect(result.current.contextualRun?.id).toBe(completed.id);
  act(() =>
    result.current.sourceContext(
      "source",
      "r2",
      "Renamed R2",
      "r1",
      "Renamed R1",
    ),
  );
  expect(result.current.contextualRun?.id).toBe(completed.id);
  act(() =>
    result.current.sourceContext(
      "other-source",
      "r2",
      "Renamed R2",
      "r1",
      "Renamed R1",
    ),
  );
  expect(result.current.contextualRun).toBeUndefined();
});

it("retrying a historical Investigation does not associate it with a new context", async () => {
  const { result, completed, start } = investigationView();
  await start();
  const failed = { ...completed, status: "FAILED" } as AgentRun;
  vi.spyOn(api, "resume").mockResolvedValue(completed);
  act(() => result.current.rememberRun(failed));
  expect(result.current.contextualRun?.id).toBe(completed.id);
  act(() =>
    result.current.bimContext(
      "source",
      "r3",
      engineeringScope.elementIds,
      "r1",
    ),
  );
  await act(async () => {
    await result.current.retryRun(failed);
  });
  expect(api.resume).toHaveBeenCalledWith(completed.id);
  expect(result.current.contextualRun).toBeUndefined();
  expect(result.current.reportContext).toMatchObject({
    revisionId: "r2",
    workPackageId: "WP-A",
  });
});

it("a failed same-context submission preserves the previous contextual Investigation and retry", async () => {
  const { result, start, completed } = investigationView();
  await start();
  vi.mocked(api.investigate).mockRejectedValueOnce(new Error("Launch failed"));
  await act(async () => {
    await result.current.startInvestigation("Check again");
  });
  expect(result.current.error).toBe("Launch failed");
  expect(result.current.contextualRun?.id).toBe(completed.id);
  const failed = { ...completed, status: "FAILED" } as AgentRun;
  act(() => result.current.rememberRun(failed));
  vi.spyOn(api, "resume").mockResolvedValue(completed);
  await act(async () => {
    await result.current.retryRun(failed);
  });
  expect(result.current.contextualRun?.id).toBe(completed.id);
});

it("a superseded launch cannot return a stale header acknowledgement after query invalidation", async () => {
  const { result, completed } = investigationView();
  let release!: () => void;
  vi.spyOn(client, "invalidateQueries").mockImplementationOnce(
    () =>
      new Promise<void>((resolve) => {
        release = resolve;
      }),
  );
  let pending!: Promise<AgentRun | undefined>;
  act(() => {
    pending = result.current.startInvestigation("Check R2");
  });
  await waitFor(() =>
    expect(result.current.contextualRun?.id).toBe(completed.id),
  );
  const newer = { ...run("newer"), category: "bim_import" } as AgentRun;
  act(() => result.current.rememberRun(newer));
  let acknowledgement: AgentRun | undefined;
  await act(async () => {
    release();
    acknowledgement = await pending;
  });
  expect(acknowledgement).toBeUndefined();
  expect(result.current.activeRun?.id).toBe("newer");
});

it.each(["unchanged", "R3", "R3 → R2"])(
  "shows a launch failure only in its submitted context visit (after launch: %s)",
  async (visit) => {
    const { result, completed, report } = investigationView();
    await waitFor(() =>
      expect(result.current.investigation.data).toEqual(report),
    );
    let reject!: (cause: Error) => void;
    vi.mocked(api.investigate).mockImplementation(
      () =>
        new Promise((_, fail) => {
          reject = fail;
        }),
    );
    let pending!: Promise<AgentRun | undefined>;
    act(() => {
      pending = result.current.startInvestigation("Check R2");
    });
    expect(result.current.pending).toBe(true);
    if (visit !== "unchanged") {
      act(() =>
        result.current.bimContext(
          "source",
          "r3",
          engineeringScope.elementIds,
          "r1",
        ),
      );
      if (visit === "R3 → R2")
        act(() =>
          result.current.bimContext(
            "source",
            "r2",
            engineeringScope.elementIds,
            "r1",
          ),
        );
    }
    await act(async () => {
      reject(new Error("R2 launch failed"));
      await pending;
    });
    expect(result.current.context.revisionId).toBe(
      visit === "R3" ? "r3" : "r2",
    );
    expect(result.current.error).toBe(
      visit === "unchanged" ? "R2 launch failed" : "",
    );
    expect(result.current.pending).toBe(false);
    expect(result.current.contextualRun).toBeUndefined();
    expect(result.current.currentRun.data?.id).toBe(completed.id);
    expect(result.current.investigation.data).toEqual(report);
  },
);
