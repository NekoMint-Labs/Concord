import { act, renderHook } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { expect, it, vi } from "vitest";
import { useWorkspaceMutation } from "./useWorkspaceMutation";

function setup() {
  const cache = new QueryClient();
  const invalidate = vi
    .spyOn(cache, "invalidateQueries")
    .mockResolvedValue(undefined);
  const hook = renderHook(() => useWorkspaceMutation(), {
    wrapper: ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={cache}>{children}</QueryClientProvider>
    ),
  });
  return { ...hook, invalidate };
}

it("reconciles workspace first, then the existing dependent cache families", async () => {
  const { result, invalidate } = setup();
  const operation = vi.fn().mockResolvedValue(undefined);
  await act(() => result.current.perform(operation));
  expect(operation).toHaveBeenCalledOnce();
  expect(invalidate.mock.calls).toEqual(
    [
      "workspace",
      "timeline",
      "runs",
      "documents",
      "bim",
      "job",
      "current-operation-run",
      "investigation-report",
    ].map((key) => [{ queryKey: [key] }]),
  );
  expect(result.current.busy).toBe(false);
  expect(result.current.error).toBe("");
});

it("holds the mutation guard until authoritative invalidation finishes", async () => {
  const { result, invalidate } = setup();
  let finish!: () => void;
  invalidate.mockImplementationOnce(
    () =>
      new Promise<void>((resolve) => {
        finish = resolve;
      }),
  );
  const operation = vi.fn().mockResolvedValue(undefined);
  let pending!: Promise<void>;
  await act(async () => {
    pending = result.current.perform(operation);
    await Promise.resolve();
  });
  expect(result.current.busy).toBe(true);
  await act(() => result.current.perform(operation));
  expect(operation).toHaveBeenCalledOnce();
  await act(async () => {
    finish();
    await pending;
  });
  expect(result.current.busy).toBe(false);
  await act(() => result.current.perform(operation));
  expect(operation).toHaveBeenCalledTimes(2);
});

it("refreshes workspace on failure and clears the error on the next attempt", async () => {
  const { result, invalidate } = setup();
  await act(() =>
    result.current.perform(async () => {
      throw new Error("Snapshot changed");
    }),
  );
  expect(result.current.error).toBe("Snapshot changed");
  expect(result.current.busy).toBe(false);
  expect(invalidate.mock.calls).toEqual([[{ queryKey: ["workspace"] }]]);
  await act(() => result.current.perform(async () => {}));
  expect(result.current.error).toBe("");
});
