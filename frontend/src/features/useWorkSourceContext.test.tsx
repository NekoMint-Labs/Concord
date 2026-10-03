import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { api, type DTO, type ProjectSourceStatus } from "../api/client";
import { useWorkSourceContext } from "./useWorkSourceContext";

const source: ProjectSourceStatus = {
  source: {
    id: "model",
    project_id: "project",
    name: "MEP",
    kind: "BIM",
    created_at: "2026-01-01T00:00:00Z",
  },
  accepted_revision_id: "r2",
  latest_revision_id: "r3",
  baseline_id: "baseline-r2",
  has_pending_revision: true,
};
const historical: DTO<"RevisionComparison"> = {
  id: "r1-r2",
  project_id: "project",
  source_id: "model",
  from_revision_id: "r1",
  to_revision_id: "r2",
  engine: "IfcDiff",
  engine_version: "test",
  status: "COMPLETED",
  summary: {
    added: 0,
    deleted: 0,
    changed: 1,
    from_elements: 1,
    to_elements: 1,
    common_global_ids: 1,
    global_id_continuity: 1,
    warnings: [],
    compare_seconds: 0,
  },
  raw_result_key: "comparison.json",
  evidence_ids: ["evidence"],
  created_at: "2026-01-01T00:00:00Z",
};
const matching: DTO<"RevisionComparison"> = {
  ...historical,
  id: "r2-r3",
  from_revision_id: "r2",
  to_revision_id: "r3",
};
function detail(
  comparison: DTO<"RevisionComparison">,
): DTO<"RevisionComparisonDetail"> {
  const change: DTO<"BimElementChange"> = {
    comparison_id: comparison.id,
    global_id: "changed-element",
    change_kind: "changed",
    changed_aspects: ["geometry"],
  };
  return {
    comparison,
    changes: [change],
    affected_work_packages: [{ work_package_id: "wp", changes: [change] }],
  };
}
const caches: QueryClient[] = [];
function setup(initialSource = source) {
  const cache = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: Infinity } },
  });
  caches.push(cache);
  return {
    cache,
    ...renderHook(({ status }) => useWorkSourceContext("project", [status]), {
      initialProps: { status: initialSource },
      wrapper: ({ children }: { children: ReactNode }) => (
        <QueryClientProvider client={cache}>{children}</QueryClientProvider>
      ),
    }),
  };
}
beforeEach(() => {
  vi.spyOn(api, "sourceRevisions").mockResolvedValue([]);
  vi.spyOn(api, "comparisons").mockResolvedValue([historical]);
  vi.spyOn(api, "comparison").mockImplementation(
    async (_project, _source, id) =>
      detail(id === matching.id ? matching : historical),
  );
});
afterEach(() => {
  caches.splice(0).forEach((cache) => cache.clear());
  vi.restoreAllMocks();
});

it("does not fetch R1→R2 details when R2 is accepted and R3 has no comparison", async () => {
  const { result } = setup();
  await waitFor(() =>
    expect(result.current[0].comparisons).toEqual([historical]),
  );
  expect(api.comparison).not.toHaveBeenCalled();
  expect(result.current[0].comparison).toBeUndefined();
});

it("stops exposing cached R1→R2 details after accepting R2 and uploading R3", async () => {
  const { result, rerender } = setup({
    ...source,
    accepted_revision_id: "r1",
    latest_revision_id: "r2",
  });
  await waitFor(() =>
    expect(result.current[0].comparison).toEqual(detail(historical)),
  );
  vi.mocked(api.comparison).mockClear();
  rerender({ status: source });
  expect(result.current[0].comparison).toBeUndefined();
  expect(api.comparison).not.toHaveBeenCalled();
});

it.each([
  ["first", [matching, historical]],
  ["last", [historical, matching]],
] as const)(
  "uses the accepted/latest pair when it is %s in the list, with usable details",
  async (_position, comparisons) => {
    vi.mocked(api.comparisons).mockResolvedValue([...comparisons]);
    const { result } = setup();
    await waitFor(() =>
      expect(result.current[0].comparison).toEqual(detail(matching)),
    );
    expect(api.comparison).toHaveBeenCalledExactlyOnceWith(
      "project",
      "model",
      "r2-r3",
    );
    expect(result.current[0].comparison?.changes[0].global_id).toBe(
      "changed-element",
    );
    expect(
      result.current[0].comparison?.affected_work_packages[0].work_package_id,
    ).toBe("wp");
  },
);

it("does not fetch a comparison when accepted and latest revisions are the same", async () => {
  const { result } = setup({
    ...source,
    latest_revision_id: "r2",
    has_pending_revision: false,
  });
  await waitFor(() =>
    expect(result.current[0].comparisons).toEqual([historical]),
  );
  expect(api.comparison).not.toHaveBeenCalled();
  expect(result.current[0].comparison).toBeUndefined();
});

it("does not infer an accepted baseline from a historical comparison", async () => {
  const { result } = setup({ ...source, accepted_revision_id: null });
  await waitFor(() =>
    expect(result.current[0].comparisons).toEqual([historical]),
  );
  expect(api.comparison).not.toHaveBeenCalled();
  expect(result.current[0].comparison).toBeUndefined();
});

it("rejects detail data whose revision identities do not match the selected pair", async () => {
  vi.mocked(api.comparisons).mockResolvedValue([matching]);
  vi.mocked(api.comparison).mockResolvedValue(
    detail({ ...historical, id: matching.id }),
  );
  const { result, cache } = setup();
  await waitFor(() =>
    expect(
      cache.getQueryState(["comparison", "project", "model", matching.id])
        ?.status,
    ).toBe("success"),
  );
  expect(result.current[0].comparison).toBeUndefined();
});
