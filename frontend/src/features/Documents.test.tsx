import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, expect, it, vi } from "vitest";
import fixture from "../../tests/fixtures/inspector.json";
import { api, type AgentRun } from "../api/client";
import { Documents } from "./Documents";

afterEach(() => vi.restoreAllMocks());

it("refreshes the document library when an asynchronously dispatched import finishes", async () => {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  const run: AgentRun = {
    ...fixture.waiting.run!,
    category: "document_parse",
    status: "QUEUED",
  } as AgentRun;
  let ready = false;
  let finish: (value: AgentRun) => void = () => {
    throw new Error("Import was not dispatched");
  };
  const document = {
    id: "late-document",
    project_id: "harbor-east",
    filename: "late.md",
    content_hash: "a".repeat(64),
    parser: "lightweight",
    created_at: "2026-01-01T00:00:00Z",
  };
  vi.spyOn(api, "documents").mockImplementation(async () =>
    ready ? [document] : [],
  );
  vi.spyOn(api, "chunks").mockResolvedValue([]);
  vi.spyOn(api, "upload").mockResolvedValue(run);
  vi.spyOn(api, "run").mockImplementation(
    () =>
      new Promise<AgentRun>((resolve) => {
        finish = resolve;
      }),
  );
  const perform = async (operation: () => Promise<unknown>) => {
    await operation();
  };
  const { container, unmount } = render(
    <QueryClientProvider client={client}>
      <Documents project="harbor-east" perform={perform} />
    </QueryClientProvider>,
  );
  await waitFor(() => expect(api.documents).toHaveBeenCalled());
  fireEvent.change(container.querySelector("input[type=file]")!, {
    target: {
      files: [new File(["Evidence"], "late.md", { type: "text/markdown" })],
    },
  });
  await waitFor(() => expect(api.run).toHaveBeenCalledWith(run.id));
  expect(screen.queryByText("late.md")).not.toBeInTheDocument();
  await act(async () => {
    ready = true;
    finish({ ...run, status: "COMPLETED" });
  });
  await screen.findByText("late.md");
  fireEvent.click(screen.getByRole("button", { name: "PDF" }));
  expect(screen.getByText("No PDF files in this project.")).toBeVisible();
  expect(screen.queryByText("late.md")).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "All files" }));
  expect(screen.getByText("late.md")).toBeVisible();
  expect(screen.getByText(/^导入 已完成/)).toHaveTextContent("已完成");
  unmount();
  client.clear();
});
