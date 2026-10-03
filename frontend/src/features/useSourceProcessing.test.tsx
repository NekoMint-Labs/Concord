import {
  QueryClient,
  QueryClientProvider,
  useQuery,
} from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, expect, it, vi } from "vitest";
import {
  api,
  type AgentRun,
  type DTO,
  type ProjectSourceRevision,
} from "../api/client";
import { importKey, useSourceProcessing } from "./useSourceProcessing";

const revision: ProjectSourceRevision = {
  id: "r1",
  project_id: "project",
  source_id: "model",
  sequence: 1,
  external_label: null,
  original_filename: "mep.ifc",
  sha256: "0".repeat(64),
  media_type: null,
  size_bytes: 1,
  storage_key: "key",
  import_status: "STORED",
  imported_at: "2026-01-01T00:00:00Z",
};
const second: ProjectSourceRevision = { ...revision, id: "r2", sequence: 2 };
function run(revisionId: string, status: AgentRun["status"]): AgentRun {
  return {
    id: `import-${revisionId}`,
    project_id: "project",
    event_id: null,
    status,
    runtime: "test",
    runtime_execution_id: null,
    generation: 0,
    runtime_generation: 0,
    category: "bim_import",
    analysis_id: null,
    error: null,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
  };
}
const snapshot: DTO<"BimRevisionSnapshot"> = {
  project_id: "project",
  source_id: "model",
  revision_id: "r1",
  ifc_schema: "IFC4",
  imported_at: "2026-01-01T00:00:00Z",
  import_seconds: 0,
  elements: [],
};
const caches: QueryClient[] = [];
function client() {
  const cache = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: Infinity } },
  });
  caches.push(cache);
  return cache;
}
function wrapper(cache: QueryClient) {
  return ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={cache}>{children}</QueryClientProvider>
  );
}
function setup(cache: QueryClient, revisions = [revision, second]) {
  return renderHook(
    ({ revisions }) => useSourceProcessing("project", revisions),
    {
      initialProps: { revisions },
      wrapper: wrapper(cache),
    },
  );
}
afterEach(() => {
  caches.splice(0).forEach((cache) => cache.clear());
  vi.restoreAllMocks();
});

it("recovers a retry:false snapshot read that failed before BIM import completion, and refreshes bindings", async () => {
  let imported = false;
  vi.spyOn(api, "revisionImport").mockImplementation(async () =>
    run("r1", imported ? "COMPLETED" : "RUNNING"),
  );
  const read = vi.spyOn(api, "bimSnapshot").mockImplementation(async () => {
    if (!imported) throw new Error("BIM revision not imported yet");
    return snapshot;
  });
  const bindings = vi.spyOn(api, "bimBindings").mockResolvedValue([]);
  const cache = client();
  const { result } = renderHook(
    () => {
      const processing = useSourceProcessing("project", [revision]);
      const model = useQuery({
        queryKey: ["bim-snapshot", "project", "model", "r1"],
        queryFn: () => api.bimSnapshot("project", "model", "r1"),
        retry: false,
      });
      const mapping = useQuery({
        queryKey: ["bim-bindings", "project", "model", "r1"],
        queryFn: () => api.bimBindings("project", "model", "r1"),
      });
      return { processing, model, mapping };
    },
    { wrapper: wrapper(cache) },
  );
  await waitFor(() => {
    expect(result.current.model.isError).toBe(true);
    expect(result.current.mapping.isSuccess).toBe(true);
    expect(result.current.processing.states.get("r1")?.run?.status).toBe(
      "RUNNING",
    );
  });
  expect(read).toHaveBeenCalledTimes(1);
  expect(bindings).toHaveBeenCalledTimes(1);
  imported = true;
  await act(() => result.current.processing.refetch("r1"));
  await waitFor(() => expect(result.current.model.isSuccess).toBe(true));
  expect(result.current.model.data).toEqual(snapshot);
  expect(read).toHaveBeenCalledTimes(2);
  expect(bindings).toHaveBeenCalledTimes(2);
  expect(read).toHaveBeenLastCalledWith("project", "model", "r1");
  expect(bindings).toHaveBeenLastCalledWith("project", "model", "r1");
});

it("invalidates snapshot and bindings for each sequentially completed revision, not neighboring scopes or an already-completed revision", async () => {
  vi.spyOn(api, "revisionImport").mockImplementation(
    async (_project, _source, id) => run(id, "RUNNING"),
  );
  const cache = client();
  const events: unknown[][] = [];
  const unsubscribe = cache.getQueryCache().subscribe((event) => {
    if (event.type === "updated" && event.action.type === "invalidate")
      events.push([...event.query.queryKey]);
  });
  const families = ["bim-snapshot", "bim-bindings"];
  const neighbors = families.flatMap((family) => [
    [family, "other-project", "model", "r1"],
    [family, "project", "other-model", "r1"],
    [family, "project", "model", "unrelated-revision"],
  ]);
  for (const key of [
    ...neighbors,
    ...families.flatMap((family) => [
      [family, "project", "model", "r1"],
      [family, "project", "model", "r2"],
    ]),
  ])
    cache.setQueryData(key, []);
  const { result } = setup(cache);
  await waitFor(() =>
    expect(
      [...result.current.states.values()].every((state) => !state.loading),
    ).toBe(true),
  );
  expect(events).toEqual([]);
  await act(async () => {
    cache.setQueryData(
      importKey("project", "model", "r1"),
      run("r1", "COMPLETED"),
    );
  });
  await waitFor(() =>
    expect(result.current.states.get("r1")?.run?.status).toBe("COMPLETED"),
  );
  expect
    .soft(events)
    .toEqual(
      expect.arrayContaining(
        families.map((family) => [family, "project", "model", "r1"]),
      ),
    );
  expect.soft(events).toHaveLength(2);
  for (const family of families)
    expect
      .soft(
        cache.getQueryState([family, "project", "model", "r2"])?.isInvalidated,
      )
      .toBe(false);
  // Make R1 fresh again so an accidental second invalidation emits an event.
  for (const family of families)
    cache.setQueryData([family, "project", "model", "r1"], []);
  await act(async () => {
    cache.setQueryData(
      importKey("project", "model", "r2"),
      run("r2", "COMPLETED"),
    );
  });
  await waitFor(() =>
    expect(result.current.states.get("r2")?.run?.status).toBe("COMPLETED"),
  );
  expect
    .soft(events)
    .toEqual(
      expect.arrayContaining([
        ...families.map((family) => [family, "project", "model", "r1"]),
        ...families.map((family) => [family, "project", "model", "r2"]),
      ]),
    );
  expect.soft(events).toHaveLength(4);
  for (const key of neighbors)
    expect(cache.getQueryState(key)?.isInvalidated).toBe(false);
  unsubscribe();
});

it.each([
  ["removed", [[second]]],
  ["reordered", [[second, revision]]],
  ["removed and reappearing", [[], [revision]]],
] as const)(
  "does not repeat completion invalidation when completed revisions are %s",
  async (_scenario, transitions) => {
    vi.spyOn(api, "revisionImport").mockImplementation(
      async (_project, _source, id) => run(id, "COMPLETED"),
    );
    const cache = client();
    const invalidate = vi.spyOn(cache, "invalidateQueries");
    const { result, rerender } = setup(cache);
    await waitFor(() => {
      expect(
        [...result.current.states.values()].every(
          (state) => state.run?.status === "COMPLETED",
        ),
      ).toBe(true);
      expect(invalidate).toHaveBeenCalled();
    });
    const calls = invalidate.mock.calls.length;
    for (const revisions of transitions) {
      await act(async () => rerender({ revisions: [...revisions] }));
      expect(invalidate).toHaveBeenCalledTimes(calls);
    }
  },
);

it("restarts an in-flight pre-import snapshot read instead of letting its late failure absorb completion invalidation", async () => {
  let imported = false;
  let failBeforeImport!: (error: Error) => void;
  vi.spyOn(api, "revisionImport").mockImplementation(async () =>
    run("r1", imported ? "COMPLETED" : "RUNNING"),
  );
  const read = vi.spyOn(api, "bimSnapshot").mockImplementation(() =>
    imported
      ? Promise.resolve(snapshot)
      : new Promise((_resolve, reject) => {
          failBeforeImport = reject;
        }),
  );
  const cache = client();
  const { result } = renderHook(
    () => {
      const processing = useSourceProcessing("project", [revision]);
      const model = useQuery({
        queryKey: ["bim-snapshot", "project", "model", "r1"],
        queryFn: () => api.bimSnapshot("project", "model", "r1"),
        retry: false,
      });
      return { processing, model };
    },
    { wrapper: wrapper(cache) },
  );
  await waitFor(() =>
    expect(result.current.processing.states.get("r1")?.run?.status).toBe(
      "RUNNING",
    ),
  );
  expect(read).toHaveBeenCalledOnce();
  expect(result.current.model.isFetching).toBe(true);
  const invalidate = vi.spyOn(cache, "invalidateQueries");
  imported = true;
  await act(() => result.current.processing.refetch("r1"));
  await waitFor(() =>
    expect(invalidate).toHaveBeenCalledWith({
      queryKey: ["bim-snapshot", "project", "model", "r1"],
      exact: true,
    }),
  );
  await act(async () =>
    failBeforeImport(new Error("BIM revision not imported yet")),
  );
  await waitFor(() => expect(result.current.model.isSuccess).toBe(true));
  expect(read).toHaveBeenCalledTimes(2);
  expect(result.current.model.data).toEqual(snapshot);
});
