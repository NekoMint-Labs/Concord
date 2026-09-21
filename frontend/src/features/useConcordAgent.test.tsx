import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { expect, it } from "vitest";
import { useConcordAgent } from "./useConcordAgent";

const client = new QueryClient({
  defaultOptions: { queries: { retry: false } },
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
