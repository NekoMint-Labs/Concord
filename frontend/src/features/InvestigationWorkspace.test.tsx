import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { api, type InvestigationReport } from "../api/client";
import { InvestigationWorkspace } from "./InvestigationWorkspace";

it("does not present another BIM model as evidence for a document investigation", async () => {
  vi.spyOn(api, "sourceStatuses").mockResolvedValue([
    {
      source: {
        id: "model",
        project_id: "project",
        name: "Model",
        kind: "BIM",
        created_at: "2026-01-01T00:00:00Z",
      },
      latest_revision_id: "r1",
      accepted_revision_id: null,
      baseline_id: null,
      has_pending_revision: true,
    },
    {
      source: {
        id: "doc",
        project_id: "project",
        name: "Notice",
        kind: "DOCUMENT",
        created_at: "2026-01-01T00:00:00Z",
      },
      latest_revision_id: "d1",
      accepted_revision_id: null,
      baseline_id: null,
      has_pending_revision: true,
    },
  ]);
  vi.spyOn(api, "documents").mockResolvedValue([]);
  const fetch = vi.spyOn(globalThis, "fetch");
  render(
    <QueryClientProvider
      client={
        new QueryClient({ defaultOptions: { queries: { retry: false } } })
      }
    >
      <InvestigationWorkspace
        project="project"
        context={{ projectName: "Project", elementIds: [] }}
        report={
          {
            scope: { source_id: "doc", to_revision_id: "d1", element_ids: [] },
          } as unknown as InvestigationReport
        }
      />
    </QueryClientProvider>,
  );
  expect(await screen.findByText("本次调查未关联模型版本。")).toBeVisible();
  expect(fetch).not.toHaveBeenCalled();
  fetch.mockRestore();
  vi.restoreAllMocks();
});
