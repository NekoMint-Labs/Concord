import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  act,
  render,
  renderHook,
  screen,
  waitFor,
} from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import {
  api,
  APIError,
  type AgentRun,
  type Coordination,
  type Evidence,
  type Finding,
  type ReCheck,
} from "../api/client";
import {
  engineeringKeys,
  useEngineeringFinding,
  useEngineeringFindings,
} from "./useEngineeringFindings";

const cache = new QueryClient({
  defaultOptions: { queries: { retry: false } },
});
function wrapper({ children }: { children: ReactNode }) {
  return <QueryClientProvider client={cache}>{children}</QueryClientProvider>;
}
const timestamp = "2026-01-01T00:00:00Z";
const finding = (
  project = "p",
  id = "f",
  state: Finding["state"] = "PROPOSED",
): Finding => ({
  id,
  project_id: project,
  state,
  snapshot_id: "snapshot",
  work_package_id: "work",
  title: "Conflict",
  conclusion: "Conflict",
  what_changed: "R2",
  why_it_matters: "Clearance",
  evidence_ids: ["original"],
  reasoning_summary: "Measured",
  confidence: 1,
  limitations: [],
  created_at: timestamp,
  updated_at: timestamp,
  impact: null,
  change_ids: [],
  dependencies: [],
  suggested_action: "Coordinate",
  suggested_discipline: "MEP",
});
const evidence = (id: string): Evidence => ({
  id,
  snapshot_id: "snapshot",
  provider: "detector",
  source_id: "source",
  source_revision: "hash",
  source_revision_id: "r2",
  observed_at: timestamp,
  work_package_id: "work",
  element_ids: [],
  page: null,
  location: null,
  fact: "Measured",
  quality: "structured",
  viewer_target: null,
});
const recheck = (outcome: ReCheck["outcome"] = null): ReCheck => ({
  id: "check",
  project_id: "p",
  finding_id: "f",
  source_id: "source",
  source_revision_id: "r2",
  dependencies: [],
  finding_updated_at: timestamp,
  request_id: "operation",
  outcome,
  evidence_ids: outcome ? ["fresh"] : [],
  explanation: "Capability result",
  created_at: timestamp,
  completed_at: outcome ? timestamp : null,
});
const run = (status: AgentRun["status"] = "QUEUED"): AgentRun => ({
  id: "check",
  project_id: "p",
  category: "engineering_recheck",
  event_id: null,
  status,
  runtime: "dbos",
  runtime_execution_id: null,
  generation: 0,
  runtime_generation: 0,
  analysis_id: null,
  error: null,
  created_at: timestamp,
  updated_at: timestamp,
});
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (cause: Error) => void;
  const promise = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}
beforeEach(() => {
  vi.spyOn(api, "engineeringFindings").mockImplementation(async (project) => [
    finding(project),
  ]);
  vi.spyOn(api, "engineeringFinding").mockImplementation(async (project, id) =>
    finding(project, id),
  );
  vi.spyOn(api, "engineeringEvidence").mockImplementation(
    async (_project, id) => evidence(id),
  );
  vi.spyOn(api, "engineeringCoordination").mockResolvedValue([]);
  vi.spyOn(api, "engineeringRechecks").mockResolvedValue([]);
  vi.spyOn(api, "engineeringDecision").mockResolvedValue(
    finding("p", "f", "CONFIRMED"),
  );
  vi.spyOn(api, "requestEngineeringRechecks").mockResolvedValue([]);
  vi.spyOn(api, "run").mockResolvedValue(run());
});
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  cache.clear();
});

it("disables empty scopes and never displays the previous project's list/detail/evidence", async () => {
  const list = renderHook(({ project }) => useEngineeringFindings(project), {
    wrapper,
    initialProps: { project: "" },
  });
  const detail = renderHook(
    ({ project, id }) => useEngineeringFinding(project, id),
    {
      wrapper,
      initialProps: { project: "", id: "" },
    },
  );
  expect(api.engineeringFindings).not.toHaveBeenCalled();
  expect(api.engineeringFinding).not.toHaveBeenCalled();
  list.rerender({ project: "p" });
  detail.rerender({ project: "p", id: "f" });
  await waitFor(() =>
    expect(detail.result.current.evidence[0]?.data?.id).toBe("original"),
  );
  await waitFor(() =>
    expect(list.result.current.data?.[0].project_id).toBe("p"),
  );
  const lateList = deferred<Finding[]>();
  const lateDetail = deferred<Finding>();
  vi.mocked(api.engineeringFindings).mockReturnValue(lateList.promise);
  vi.mocked(api.engineeringFinding).mockReturnValue(lateDetail.promise);
  list.rerender({ project: "other" });
  detail.rerender({ project: "other", id: "f" });
  expect(list.result.current.data).toBeUndefined();
  expect(detail.result.current.finding.data).toBeUndefined();
  expect(detail.result.current.evidence).toEqual([]);
  await act(async () => {
    lateList.resolve([finding("other")]);
    lateDetail.resolve(finding("other"));
  });
  await waitFor(() =>
    expect(detail.result.current.finding.data?.project_id).toBe("other"),
  );
  await waitFor(() =>
    expect(list.result.current.data?.[0].project_id).toBe("other"),
  );
  expect(api.engineeringEvidence).toHaveBeenCalledWith("other", "original");
});

it("reconciles exact authoritative records on confirm, dismiss and explicit reopen, without optimism", async () => {
  let server = finding();
  const history: Coordination[] = [];
  vi.mocked(api.engineeringFinding).mockImplementation(async () => server);
  vi.mocked(api.engineeringFindings).mockImplementation(async () => [server]);
  vi.mocked(api.engineeringCoordination).mockImplementation(async () => [
    ...history,
  ]);
  const pending = deferred<Finding>();
  vi.mocked(api.engineeringDecision)
    .mockReturnValueOnce(pending.promise)
    .mockImplementation(async (_project, _id, input) => {
      server = {
        ...server,
        state: input.decision === "REOPENED" ? "PROPOSED" : "DISMISSED",
      };
      return server;
    });
  const hook = renderHook(
    () => ({
      list: useEngineeringFindings("p"),
      detail: useEngineeringFinding("p", "f"),
    }),
    { wrapper },
  );
  await waitFor(() =>
    expect(hook.result.current.detail.evidence[0]?.data).toBeDefined(),
  );
  cache.setQueryData(
    engineeringKeys.finding("p", "unrelated"),
    finding("p", "unrelated"),
  );
  cache.setQueryData(engineeringKeys.findings("other"), [finding("other")]);
  const invalidate = vi.spyOn(cache, "invalidateQueries");
  let operation!: Promise<Finding | undefined>;
  act(() => {
    operation = hook.result.current.detail.decide({ decision: "CONFIRMED" });
  });
  expect(hook.result.current.detail.busy).toBe(true);
  expect(hook.result.current.detail.finding.data?.state).toBe("PROPOSED");
  await act(() => hook.result.current.detail.decide({ decision: "DISMISSED" }));
  expect(api.engineeringDecision).toHaveBeenCalledTimes(1);
  await act(async () => {
    server = finding("p", "f", "CONFIRMED");
    history.push({
      id: "decision",
      project_id: "p",
      finding_id: "f",
      actor: "human",
      decision: "CONFIRMED",
      note: "",
      recheck_id: null,
      created_at: timestamp,
    });
    pending.resolve(server);
    await operation;
  });
  await waitFor(() =>
    expect(hook.result.current.detail.finding.data?.state).toBe("CONFIRMED"),
  );
  expect(hook.result.current.list.data?.[0].state).toBe("CONFIRMED");
  expect(hook.result.current.detail.coordination.data).toHaveLength(1);
  for (const key of [
    engineeringKeys.findings("p"),
    engineeringKeys.finding("p", "f"),
    engineeringKeys.coordination("p", "f"),
    engineeringKeys.rechecks("p", "f"),
    engineeringKeys.evidence("p", "original"),
    ["workspace", "p"],
    ["runs", "p"],
  ]) {
    expect(invalidate).toHaveBeenCalledWith({ queryKey: key, exact: true });
  }
  expect(
    cache.getQueryState(engineeringKeys.finding("p", "unrelated"))
      ?.isInvalidated,
  ).toBe(false);
  expect(
    cache.getQueryState(engineeringKeys.findings("other"))?.isInvalidated,
  ).toBe(false);
  await act(() =>
    hook.result.current.detail.decide({
      decision: "DISMISSED",
      note: "Duplicate",
    }),
  );
  await waitFor(() =>
    expect(hook.result.current.detail.finding.data?.state).toBe("DISMISSED"),
  );
  await act(() =>
    hook.result.current.detail.decide({
      decision: "REOPENED",
      note: "Reassess",
    }),
  );
  await waitFor(() =>
    expect(hook.result.current.detail.finding.data?.state).toBe("PROPOSED"),
  );
  expect(hook.result.current.detail.error).toBe("");
});

it.each([403, 409, 422])(
  "reconciles a rejected closure (%s), and exposes the server error without closing",
  async (status) => {
    let server = finding("p", "f", "CONFIRMED");
    vi.mocked(api.engineeringFinding).mockImplementation(async () => server);
    vi.mocked(api.engineeringDecision).mockImplementation(async () => {
      server = { ...server, title: "New concurrent revision" };
      throw new APIError(status, "Fresh evidence required");
    });
    const { result } = renderHook(() => useEngineeringFinding("p", "f"), {
      wrapper,
    });
    await waitFor(() => expect(result.current.finding.data).toBeDefined());
    const invalidate = vi.spyOn(cache, "invalidateQueries");
    await act(() =>
      result.current.decide({ decision: "CLOSED", recheck_id: "old" }),
    );
    await waitFor(() =>
      expect(result.current.finding.data?.title).toBe(
        "New concurrent revision",
      ),
    );
    expect(result.current.finding.data?.state).toBe("CONFIRMED");
    expect(result.current.error).toBe("Fresh evidence required");
    expect(result.current.busy).toBe(false);
    expect(invalidate).toHaveBeenCalledWith({
      queryKey: engineeringKeys.rechecks("p", "f"),
      exact: true,
    });
    expect(invalidate).toHaveBeenCalledWith({
      queryKey: engineeringKeys.coordination("p", "f"),
      exact: true,
    });
  },
);

it.each(["success", "rejection"])(
  "fences late decision %s across project/Finding changes and return visits",
  async (outcome) => {
    const old = deferred<Finding>();
    const newer = deferred<Finding>();
    vi.mocked(api.engineeringDecision)
      .mockReturnValueOnce(old.promise)
      .mockReturnValueOnce(newer.promise);
    const { result, rerender } = renderHook(
      ({ project, id }) => useEngineeringFinding(project, id),
      {
        wrapper,
        initialProps: { project: "p", id: "f" },
      },
    );
    let first!: Promise<Finding | undefined>;
    const staleDecide = result.current.decide;
    act(() => {
      first = staleDecide({ decision: "CONFIRMED" });
    });
    rerender({ project: "other", id: "other-f" });
    expect(result.current.busy).toBe(false);
    rerender({ project: "p", id: "f" });
    await act(() => staleDecide({ decision: "DISMISSED" }));
    expect(api.engineeringDecision).toHaveBeenCalledTimes(1);
    let second!: Promise<Finding | undefined>;
    act(() => {
      second = result.current.decide({ decision: "CONFIRMED" });
    });
    await act(async () => {
      if (outcome === "success") old.resolve(finding("p", "f", "CONFIRMED"));
      else old.reject(new APIError(409, "Old failure"));
      expect(await first).toBeUndefined();
    });
    expect(result.current.busy).toBe(true);
    expect(result.current.error).toBe("");
    await act(async () => {
      newer.resolve(finding());
      await second;
    });
    expect(result.current.busy).toBe(false);
  },
);

it("retains ReCheck operation IDs on failed retries/return visits and resets only after success", async () => {
  vi.mocked(api.requestEngineeringRechecks)
    .mockRejectedValueOnce(new APIError(0, "Disconnected"))
    .mockRejectedValueOnce(new APIError(409, "Retry same operation"))
    .mockResolvedValue([]);
  const { result, rerender } = renderHook(
    ({ project, id }) => useEngineeringFinding(project, id),
    {
      wrapper,
      initialProps: { project: "p", id: "f" },
    },
  );
  await act(() => result.current.requestRechecks());
  const firstId = vi.mocked(api.requestEngineeringRechecks).mock.calls[0][2]
    .operation_id;
  expect(firstId).toBeTruthy();
  expect(result.current.error).toBe("Disconnected");
  rerender({ project: "other", id: "f" });
  rerender({ project: "p", id: "f" });
  await act(() => result.current.requestRechecks());
  await act(() => result.current.requestRechecks());
  expect(
    vi
      .mocked(api.requestEngineeringRechecks)
      .mock.calls.slice(0, 3)
      .map((call) => call[2].operation_id),
  ).toEqual([firstId, firstId, firstId]);
  expect(result.current.error).toBe("");
  await act(() => result.current.requestRechecks());
  expect(
    vi.mocked(api.requestEngineeringRechecks).mock.calls[3][2].operation_id,
  ).not.toBe(firstId);
});

it("retains failed ReCheck IDs through project unmount/remount and clears them after success", async () => {
  vi.mocked(api.requestEngineeringRechecks)
    .mockRejectedValueOnce(new APIError(0, "Disconnected"))
    .mockRejectedValueOnce(new APIError(0, "Other project disconnected"))
    .mockResolvedValue([]);
  const first = renderHook(() => useEngineeringFinding("p", "f"), { wrapper });
  await act(() => first.result.current.requestRechecks());
  const firstId = vi.mocked(api.requestEngineeringRechecks).mock.calls[0][2]
    .operation_id;
  const staleRequest = first.result.current.requestRechecks;
  first.unmount();
  const other = renderHook(() => useEngineeringFinding("other", "f"), {
    wrapper,
  });
  await act(() => other.result.current.requestRechecks());
  expect(
    vi.mocked(api.requestEngineeringRechecks).mock.calls[1][2].operation_id,
  ).not.toBe(firstId);
  other.unmount();
  const returned = renderHook(() => useEngineeringFinding("p", "f"), {
    wrapper,
  });
  await act(() => staleRequest());
  expect(api.requestEngineeringRechecks).toHaveBeenCalledTimes(2);
  await act(() => returned.result.current.requestRechecks());
  expect(
    vi.mocked(api.requestEngineeringRechecks).mock.calls[2][2].operation_id,
  ).toBe(firstId);
  returned.unmount();
  const next = renderHook(() => useEngineeringFinding("p", "f"), { wrapper });
  await act(() => next.result.current.requestRechecks());
  expect(
    vi.mocked(api.requestEngineeringRechecks).mock.calls[3][2].operation_id,
  ).not.toBe(firstId);
});

it.each([
  { id: "wrong", project_id: "p" },
  { id: "original", project_id: "other" },
])("does not render mismatched Evidence %j", async (identity) => {
  vi.mocked(api.engineeringEvidence).mockResolvedValue({
    ...evidence("original"),
    ...identity,
  });
  function EvidenceView() {
    const session = useEngineeringFinding("p", "f");
    return (
      <output>
        {session.evidence.map((query) =>
          query.isSuccess
            ? (query.data?.fact ?? "No matching evidence")
            : "Loading",
        )}
      </output>
    );
  }
  render(<EvidenceView />, { wrapper });
  await waitFor(() =>
    expect(screen.getByRole("status")).toHaveTextContent(
      "No matching evidence",
    ),
  );
  expect(screen.queryByText("Measured")).not.toBeInTheDocument();
});

it("polls queued/running execution and fetches separate NEEDS_REVIEW outcomes and fresh evidence on completion", async () => {
  let execution = run();
  let check = recheck();
  vi.mocked(api.engineeringRechecks).mockImplementation(async () => [check]);
  vi.mocked(api.run).mockImplementation(async () => execution);
  const { result } = renderHook(() => useEngineeringFinding("p", "f"), {
    wrapper,
  });
  await waitFor(() =>
    expect(result.current.runs[0]?.data?.status).toBe("QUEUED"),
  );
  expect(result.current.rechecks.data?.[0].outcome).toBeNull();
  execution = run("RUNNING");
  await waitFor(
    () => expect(result.current.runs[0].data?.status).toBe("RUNNING"),
    { timeout: 2000 },
  );
  check = recheck("NEEDS_REVIEW");
  execution = run("COMPLETED");
  await waitFor(
    () =>
      expect(result.current.rechecks.data?.[0].outcome).toBe("NEEDS_REVIEW"),
    { timeout: 2000 },
  );
  await waitFor(() =>
    expect(
      result.current.evidence.some((query) => query.data?.id === "fresh"),
    ).toBe(true),
  );
  expect(result.current.runs[0].data?.status).toBe("COMPLETED");
  const calls = vi.mocked(api.run).mock.calls.length;
  vi.useFakeTimers();
  await act(() => vi.advanceTimersByTimeAsync(2500));
  expect(api.run).toHaveBeenCalledTimes(calls);
});

it.each(["FAILED", "CANCELLED", "EXPIRED"] as const)(
  "exposes %s execution independently from an unresolved outcome",
  async (status) => {
    vi.mocked(api.engineeringRechecks).mockResolvedValue([recheck()]);
    vi.mocked(api.run).mockResolvedValue(run(status));
    const { result } = renderHook(() => useEngineeringFinding("p", "f"), {
      wrapper,
    });
    await waitFor(() =>
      expect(result.current.runs[0]?.data?.status).toBe(status),
    );
    expect(result.current.rechecks.data?.[0].outcome).toBeNull();
    expect(result.current.error).toBe("");
  },
);

it("cancels a pre-decision GET so its stale result cannot overwrite reconciliation", async () => {
  const stale = deferred<Finding>();
  vi.mocked(api.engineeringFinding)
    .mockReturnValueOnce(stale.promise)
    .mockResolvedValue(finding("p", "f", "CONFIRMED"));
  const { result } = renderHook(() => useEngineeringFinding("p", "f"), {
    wrapper,
  });
  await waitFor(() => expect(api.engineeringFinding).toHaveBeenCalledTimes(1));
  await act(() => result.current.decide({ decision: "CONFIRMED" }));
  await waitFor(() =>
    expect(result.current.finding.data?.state).toBe("CONFIRMED"),
  );
  await act(async () => {
    stale.resolve(finding());
    await stale.promise;
  });
  expect(result.current.finding.data?.state).toBe("CONFIRMED");
  expect(api.engineeringFinding).toHaveBeenCalledTimes(2);
});

it("a late ReCheck request cannot clear a newer context's error or busy state", async () => {
  const old = deferred<ReCheck[]>();
  const newer = deferred<ReCheck[]>();
  vi.mocked(api.requestEngineeringRechecks)
    .mockReturnValueOnce(old.promise)
    .mockReturnValueOnce(newer.promise);
  const { result, rerender } = renderHook(
    ({ id }) => useEngineeringFinding("p", id),
    {
      wrapper,
      initialProps: { id: "f" },
    },
  );
  let first!: Promise<ReCheck[] | undefined>;
  act(() => {
    first = result.current.requestRechecks();
  });
  rerender({ id: "new-f" });
  let second!: Promise<ReCheck[] | undefined>;
  act(() => {
    second = result.current.requestRechecks();
  });
  await act(async () => {
    old.resolve([recheck()]);
    expect(await first).toBeUndefined();
  });
  expect(result.current.busy).toBe(true);
  expect(result.current.rechecks.data ?? []).toEqual([]);
  await act(async () => {
    newer.reject(new APIError(409, "New context failure"));
    await second;
  });
  expect(result.current.error).toBe("New context failure");
  expect(result.current.busy).toBe(false);
  const ids = vi
    .mocked(api.requestEngineeringRechecks)
    .mock.calls.map((call) => call[2].operation_id);
  expect(ids[0]).not.toBe(ids[1]);
});

it.each(["RESOLVED", "STILL_OPEN", "CHANGED", "NEEDS_REVIEW"] as const)(
  "keeps COMPLETED execution separate from %s business outcome and never auto-closes",
  async (outcome) => {
    vi.mocked(api.engineeringFinding).mockResolvedValue(
      finding("p", "f", "CONFIRMED"),
    );
    vi.mocked(api.engineeringRechecks).mockResolvedValue([recheck(outcome)]);
    vi.mocked(api.run).mockResolvedValue(run("COMPLETED"));
    const { result } = renderHook(() => useEngineeringFinding("p", "f"), {
      wrapper,
    });
    await waitFor(() =>
      expect(result.current.runs[0]?.data?.status).toBe("COMPLETED"),
    );
    await waitFor(() =>
      expect(result.current.finding.data?.state).toBe("CONFIRMED"),
    );
    expect(result.current.rechecks.data?.[0].outcome).toBe(outcome);
    expect(api.engineeringDecision).not.toHaveBeenCalled();
  },
);

it("discovers a later automatic ReCheck while Work stays open and refreshes source freshness", async () => {
  vi.useFakeTimers();
  let checks: ReCheck[] = [];
  vi.mocked(api.engineeringRechecks).mockImplementation(async () => checks);
  vi.mocked(api.run).mockResolvedValue(run("COMPLETED"));
  cache.setQueryData(["sources", "p"], []);
  const invalidate = vi.spyOn(cache, "invalidateQueries");
  const view = renderHook(() => useEngineeringFinding("p", "f"), { wrapper });
  await act(async () => {
    await vi.advanceTimersByTimeAsync(1);
  });
  expect(view.result.current.rechecks.data).toEqual([]);
  checks = [recheck("NEEDS_REVIEW")];
  await act(async () => {
    await vi.advanceTimersByTimeAsync(1201);
  });
  expect(view.result.current.rechecks.data?.[0].outcome).toBe("NEEDS_REVIEW");
  expect(api.requestEngineeringRechecks).not.toHaveBeenCalled();
  expect(invalidate).toHaveBeenCalledWith({
    queryKey: ["sources", "p"],
    exact: true,
  });
  expect(view.result.current.finding.data?.state).toBe("PROPOSED");
  view.unmount();
});
