import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, expect, it, vi } from "vitest";
import fixture from "../../tests/fixtures/inspector.json";
import { api, type AgentRun, type DTO } from "../api/client";
import { Documents } from "./Documents";

// Test source filtering and selection here; Radix keyboard behavior is covered separately.
vi.mock("../components/ui/AppMenu", () => ({
  AppMenu: ({ children }: { children: React.ReactNode }) => (
    <div role="menu">{children}</div>
  ),
  AppMenuItem: ({
    children,
    onSelect,
    active,
  }: {
    children: React.ReactNode;
    onSelect: () => void;
    active?: boolean;
  }) => (
    <button
      role="menuitem"
      aria-current={active ? "page" : undefined}
      onClick={onSelect}
    >
      {children}
    </button>
  ),
}));

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
  await screen.findByRole("heading", { name: "尚未导入文档" });
  const choose = vi.spyOn(
    container.querySelector<HTMLInputElement>("input[type=file]")!,
    "click",
  );
  fireEvent.click(screen.getByRole("button", { name: "导入文档" }));
  expect(choose).toHaveBeenCalledOnce();
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
  await screen.findByRole("heading", { name: "late.md" });
  fireEvent.click(screen.getByRole("button", { name: "PDF" }));
  expect(screen.getByText("当前项目没有PDF文件。")).toBeVisible();
  expect(screen.queryByText("late.md")).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "全部文件" }));
  expect(screen.getByRole("heading", { name: "late.md" })).toBeVisible();
  expect(screen.getByText(/^导入 已完成/)).toHaveTextContent("已完成");
  unmount();
  client.clear();
});

const metadata = (id: string, filename: string): DTO<"DocumentMetadata"> => ({
  id,
  project_id: "harbor-east",
  filename,
  content_hash: "a".repeat(64),
  parser: "lightweight",
  created_at: "2026-01-01T00:00:00Z",
});

function library(props: Partial<React.ComponentProps<typeof Documents>> = {}) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  const node = (next = props) => (
    <QueryClientProvider client={client}>
      <Documents
        project="harbor-east"
        perform={async (fn) => {
          await fn();
        }}
        {...next}
      />
    </QueryClientProvider>
  );
  return { ...render(node()), node };
}

it.each([false, true])(
  "offers one import action in a coherent empty workspace (condensed=%s)",
  async (condensed) => {
    vi.spyOn(api, "documents").mockResolvedValue([]);
    const { container } = library({ condensed });
    const title = await screen.findByRole("heading", { name: "尚未导入文档" });
    expect(title.closest(".documents-empty-workspace")).not.toBeNull();
    expect(container.querySelector(".document-list")).toBeNull();
    expect(container.querySelector(".document-content")).toBeNull();
    expect(screen.queryByRole("separator")).toBeNull();
    expect(screen.getAllByRole("button", { name: "导入文档" })).toHaveLength(1);
    expect(screen.queryByRole("button", { name: "全部文件" })).toBeNull();
    expect(screen.queryByRole("textbox", { name: "搜索文档" })).toBeNull();
    expect(screen.getByText(/项目还没有工程文档/)).toBeVisible();
    const input =
      container.querySelector<HTMLInputElement>("input[type=file]")!;
    const choose = vi.spyOn(input, "click");
    fireEvent.click(
      within(title.closest("section")!).getByRole("button", {
        name: "导入文档",
      }),
    );
    expect(choose).toHaveBeenCalledOnce();
  },
);

it("opens the requested document and keeps the condensed source menu within the active type filter", async () => {
  vi.spyOn(api, "documents").mockResolvedValue([
    metadata("text", "notes.md"),
    metadata("pdf", "drawing.pdf"),
    metadata("other-pdf", "details.pdf"),
  ]);
  const chunks = vi.spyOn(api, "chunks").mockResolvedValue([]);
  const props = { initialDocumentId: "other-pdf" };
  const view = library(props);
  await waitFor(() => expect(chunks).toHaveBeenCalledWith("other-pdf"));
  expect(screen.getByRole("heading", { name: "details.pdf" })).toBeVisible();
  fireEvent.click(screen.getByRole("button", { name: "PDF" }));
  view.rerender(view.node({ ...props, condensed: true }));
  const menu = await screen.findByRole("menu");
  expect(within(menu).queryByRole("menuitem", { name: /notes.md/ })).toBeNull();
  fireEvent.click(within(menu).getByRole("menuitem", { name: /drawing.pdf/ }));
  await waitFor(() => expect(chunks).toHaveBeenCalledWith("pdf"));
  expect(screen.getByRole("heading", { name: "drawing.pdf" })).toBeVisible();
});

it.each(["documents", "chunks", "search"] as const)(
  "retries a failed %s request from the reading pane",
  async (request) => {
    const documents = vi
      .spyOn(api, "documents")
      .mockResolvedValue([metadata("text", "notes.md")]);
    const chunks = vi.spyOn(api, "chunks").mockResolvedValue([]);
    const search = vi.spyOn(api, "search").mockResolvedValue([]);
    const failed = { documents, chunks, search }[request];
    failed.mockRejectedValueOnce(new Error("Offline"));
    library();
    if (request === "search") {
      await screen.findByRole("heading", { name: "notes.md" });
      fireEvent.change(screen.getByRole("textbox", { name: "搜索文档" }), {
        target: { value: "needle" },
      });
      fireEvent.click(screen.getByRole("button", { name: "搜索" }));
    }
    await screen.findByRole("alert");
    fireEvent.click(screen.getByRole("button", { name: "重试" }));
    await waitFor(() => expect(failed).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(screen.queryByRole("alert")).toBeNull());
  },
);

it("announces a pending search before showing its empty result and clear action", async () => {
  vi.spyOn(api, "documents").mockResolvedValue([metadata("text", "notes.md")]);
  vi.spyOn(api, "chunks").mockResolvedValue([]);
  let finish!: (value: DTO<"DocumentChunk">[]) => void;
  vi.spyOn(api, "search").mockImplementation(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  library({ condensed: true });
  await screen.findByRole("heading", { name: "notes.md" });
  fireEvent.change(screen.getByRole("textbox", { name: "搜索文档" }), {
    target: { value: "  needle  " },
  });
  fireEvent.click(screen.getByRole("button", { name: "搜索" }));
  await screen.findByRole("heading", { name: "正在搜索文档依据" });
  expect(api.search).toHaveBeenCalledWith("harbor-east", "needle");
  expect(screen.queryByText("没有匹配的文档依据")).toBeNull();
  await act(async () => finish([]));
  await screen.findByRole("heading", { name: "没有匹配的文档依据" });
  fireEvent.click(screen.getByRole("button", { name: "清除搜索" }));
  expect(screen.getByRole("heading", { name: "notes.md" })).toBeVisible();
});

it("keeps technical provenance behind disclosure instead of repeating it in the source row and header", async () => {
  const document = metadata("text", "notes.md");
  vi.spyOn(api, "documents").mockResolvedValue([document]);
  vi.spyOn(api, "chunks").mockResolvedValue([]);
  const { container } = library();
  await screen.findByRole("heading", { name: "notes.md" });
  expect(container.querySelector(".document-list")).not.toHaveTextContent(
    "lightweight",
  );
  expect(screen.queryByText(document.content_hash)).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "来源详情" }));
  expect(screen.getByText("解析器：lightweight")).toBeVisible();
  expect(screen.getByText(`SHA ${document.content_hash}`)).toBeVisible();
  expect(screen.getByRole("button", { name: "保存来源" })).toBeVisible();
});
