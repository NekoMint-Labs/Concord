import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, expect, it, vi } from "vitest";
import { api } from "../api/client";
import { useProjectSources } from "./useProjectSources";

function wrapper({ children }: { children: ReactNode }) {
  return (
    <QueryClientProvider
      client={
        new QueryClient({
          defaultOptions: { queries: { retry: false } },
        })
      }
    >
      {children}
    </QueryClientProvider>
  );
}

afterEach(() => vi.restoreAllMocks());

it("accepts a complete latest revision set only through the explicit baseline mutation", async () => {
  vi.spyOn(api, "sourceStatuses").mockResolvedValue([
    {
      source: {
        id: "source-a",
        project_id: "project",
        name: "MEP",
        kind: "BIM",
        created_at: "2026-01-01T00:00:00Z",
      },
      latest_revision_id: "r2",
      accepted_revision_id: "r1",
      baseline_id: "b1",
      has_pending_revision: true,
    },
  ]);
  vi.spyOn(api, "sourceRevisions").mockResolvedValue([]);
  vi.spyOn(api, "baselines").mockResolvedValue([]);
  vi.spyOn(api, "comparisons").mockResolvedValue([]);
  const create = vi.spyOn(api, "createBaseline").mockResolvedValue({
    id: "b2",
    project_id: "project",
    name: "B1",
    sequence: 1,
    entries: [{ source_id: "source-a", revision_id: "r2" }],
    accepted_by: "user",
    created_at: "2026-01-01T00:00:00Z",
  });
  const { result } = renderHook(
    () => useProjectSources("project", "source-a"),
    {
      wrapper,
    },
  );
  await waitFor(() => expect(result.current.sources.isSuccess).toBe(true));
  expect(create).not.toHaveBeenCalled();
  await act(() => result.current.acceptBaseline.mutateAsync());
  expect(create).toHaveBeenCalledWith("project", {
    name: "B1",
    entries: [{ source_id: "source-a", revision_id: "r2" }],
  });
});
