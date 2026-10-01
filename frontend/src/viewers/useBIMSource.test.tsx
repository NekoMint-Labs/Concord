import type { ReactNode } from "react";
import { act, renderHook } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, expect, it, vi } from "vitest";
import { api } from "../api/client";
import { useBIMSource } from "./useBIMSource";

const source = (id: string) => ({
  source: {
    id,
    project_id: "project",
    name: id,
    kind: "BIM" as const,
    created_at: "2026-01-01T00:00:00Z",
  },
  latest_revision_id: "latest",
  accepted_revision_id: null,
  baseline_id: null,
  has_pending_revision: true,
});

function hook() {
  const cache = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  return {
    cache,
    ...renderHook(({ project }) => useBIMSource(project), {
      initialProps: { project: "project" },
      wrapper: ({ children }: { children: ReactNode }) => (
        <QueryClientProvider client={cache}>{children}</QueryClientProvider>
      ),
    }),
  };
}
afterEach(() => vi.restoreAllMocks());

it("does not choose the first of multiple models, but accepts an explicit source and historical revision", async () => {
  vi.spyOn(api, "sourceStatuses").mockResolvedValue([
    source("first"),
    source("second"),
  ]);
  const fetch = vi
    .spyOn(globalThis, "fetch")
    .mockResolvedValue(new Response(new Blob(["IFC"]), { status: 200 }));
  const upload = vi.spyOn(api, "uploadRevision");
  const { result, unmount, cache } = hook();
  await act(async () => {
    expect(await result.current.openImported()).toBe(false);
  });
  expect(result.current.error).toContain("项目有多个模型");
  expect(fetch).not.toHaveBeenCalled();
  await act(async () => {
    expect(await result.current.openImported("second", "historical")).toBe(
      true,
    );
  });
  expect(fetch).toHaveBeenCalledWith(
    expect.stringContaining("/sources/second/revisions/historical/content"),
    expect.anything(),
  );
  expect(result.current.origin).toEqual({
    kind: "project",
    sourceId: "second",
    revisionId: "historical",
  });
  await act(async () => {
    await result.current.importSource();
  });
  expect(upload).not.toHaveBeenCalled();
  act(() =>
    result.current.chooseFile(new File(["local"], "project-model.ifc")),
  );
  expect(result.current.origin).toEqual({ kind: "local" });
  unmount();
  cache.clear();
});

it("retries the exact selected source/revision after a read failure without losing the local preview", async () => {
  vi.spyOn(api, "sourceStatuses").mockResolvedValue([source("model")]);
  const fetch = vi
    .spyOn(globalThis, "fetch")
    .mockRejectedValueOnce(new Error("read offline"))
    .mockResolvedValue(new Response(new Blob(["IFC"]), { status: 200 }));
  const { result, unmount, cache } = hook();
  const file = new File(["local"], "local.ifc");
  act(() => result.current.chooseFile(file));
  await act(async () => {
    expect(await result.current.openImported("model", "old")).toBe(false);
  });
  expect(result.current.file).toBe(file);
  expect(result.current.origin?.kind).toBe("local");
  expect(result.current.error).toBe("read offline");
  await act(async () => {
    await result.current.retry?.();
  });
  expect(fetch).toHaveBeenCalledTimes(2);
  expect(fetch.mock.calls[1][0]).toContain(
    "/sources/model/revisions/old/content",
  );
  expect(result.current.origin).toEqual({
    kind: "project",
    sourceId: "model",
    revisionId: "old",
  });
  expect(result.current.error).toBe("");
  unmount();
  cache.clear();
});

it("ignores an old project's late source-list response, including ambiguous model errors", async () => {
  let finish!: (value: ReturnType<typeof source>[]) => void;
  vi.spyOn(api, "sourceStatuses").mockReturnValue(
    new Promise((resolve) => {
      finish = resolve;
    }),
  );
  const fetch = vi.spyOn(globalThis, "fetch");
  const { result, rerender, unmount, cache } = hook();
  let opening!: Promise<boolean>;
  act(() => {
    opening = result.current.openImported();
  });
  rerender({ project: "new-project" });
  await act(async () => {
    finish([source("first"), source("second")]);
    expect(await opening).toBe(false);
  });
  expect(result.current.file).toBeNull();
  expect(result.current.origin).toBeNull();
  expect(result.current.error).toBe("");
  expect(result.current.busy).toBe(false);
  expect(fetch).not.toHaveBeenCalled();
  unmount();
  cache.clear();
});
