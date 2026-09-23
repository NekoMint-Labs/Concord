import type { ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import fixture from "../../tests/fixtures/inspector.json";
import { api, type AgentRun, type Workspace } from "../api/client";
import { useRunStream } from "../api/stream";
import { useWorkspace } from "./useWorkspace";

vi.mock("../api/stream", () => ({ useRunStream: vi.fn() }));

const coordination = (fixture.waiting as unknown as Workspace).run!;

afterEach(() => {
  vi.restoreAllMocks();
  vi.clearAllMocks();
});

async function subscriptions(
  run: AgentRun | null,
  analysisRun: AgentRun | null,
) {
  vi.spyOn(api, "profile").mockResolvedValue({
    profile: "local",
  } as Awaited<ReturnType<typeof api.profile>>);
  vi.spyOn(api, "workspace").mockResolvedValue({
    ...(fixture.waiting as unknown as Workspace),
    run,
    analysis_run: analysisRun,
  });
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const view = renderHook(() => useWorkspace("harbor-east"), {
    wrapper: ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    ),
  });
  await waitFor(() => expect(view.result.current.workspace.data).toBeDefined());
  return vi.mocked(useRunStream).mock.calls.slice(-2);
}

it("streams a WAITING_APPROVAL run once when it owns both roles", async () => {
  expect(await subscriptions(coordination, coordination)).toEqual([
    [coordination.id, true, coordination.generation],
    [coordination.id, false, coordination.generation],
  ]);
});

it("streams both distinct active runs", async () => {
  const documentRun = {
    ...coordination,
    id: "document-run",
    category: "document_parse" as const,
    status: "RUNNING" as const,
  };
  expect(await subscriptions(documentRun, coordination)).toEqual([
    [documentRun.id, true, documentRun.generation],
    [coordination.id, true, coordination.generation],
  ]);
});

it("keeps the approval run live behind a newer terminal document job", async () => {
  const documentRun = {
    ...coordination,
    id: "document-run",
    category: "document_parse" as const,
    status: "COMPLETED" as const,
  };
  expect(await subscriptions(documentRun, coordination)).toEqual([
    [documentRun.id, false, documentRun.generation],
    [coordination.id, true, coordination.generation],
  ]);
});

it("does not stream terminal runs", async () => {
  const finished = { ...coordination, status: "COMPLETED" as const };
  expect(await subscriptions(finished, finished)).toEqual([
    [finished.id, false, finished.generation],
    [finished.id, false, finished.generation],
  ]);
});
