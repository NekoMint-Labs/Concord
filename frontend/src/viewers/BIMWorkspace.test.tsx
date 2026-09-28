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
import { api, type AgentRun } from "../api/client";
import BIMWorkspace from "./BIMWorkspace";

vi.mock("./IFCViewer", () => ({
  default: ({ file }: { file: File }) => <div>Local viewer: {file.name}</div>,
}));
afterEach(() => vi.restoreAllMocks());

function view() {
  vi.spyOn(api, "bim").mockResolvedValue([]);
  const cache = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  const result = render(
    <QueryClientProvider client={cache}>
      <BIMWorkspace project="harbor-east" impacted={[]} />
    </QueryClientProvider>,
  );
  return { ...result, cache };
}

it("a local IFC stays local and overlapping import clicks submit only once", async () => {
  const run = {
    ...fixture.waiting.run,
    generation: 0,
    category: "bim_import",
    status: "COMPLETED",
  } as AgentRun;
  let finish!: (value: AgentRun) => void;
  vi.spyOn(api, "sourceStatuses").mockResolvedValue([]);
  vi.spyOn(api, "createSource").mockResolvedValue({
    id: "source",
    name: "项目模型",
    kind: "BIM",
    project_id: "harbor-east",
    created_at: "2026-01-01T00:00:00Z",
  });
  vi.spyOn(api, "uploadRevision").mockResolvedValue({
    duplicate: false,
    revision: {
      id: "r1",
      source_id: "source",
      project_id: "harbor-east",
      sequence: 1,
      original_filename: "fixture.ifc",
      external_label: null,
      sha256: "0".repeat(64),
      media_type: "application/x-step",
      size_bytes: 11,
      storage_key: "key",
      import_status: "STORED",
      imported_at: "2026-01-01T00:00:00Z",
    },
  });
  vi.spyOn(api, "importRevision").mockImplementation(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  vi.spyOn(api, "run").mockResolvedValue(run);
  const { unmount, cache } = view();
  expect(screen.getByText("打开模型以查看构件与上下文")).toBeVisible();
  expect(screen.getByRole("button", { name: "打开本地 IFC" })).toBeVisible();
  fireEvent.change(screen.getByLabelText("本地 IFC 文件"), {
    target: { files: [new File(["IFC fixture"], "fixture.ifc")] },
  });
  await screen.findByText("Local viewer: fixture.ifc");
  expect(api.uploadRevision).not.toHaveBeenCalled();
  expect(screen.getByText(/本地预览 · fixture.ifc/)).toBeVisible();
  const submit = screen.getByRole("button", { name: "添加到项目" });
  fireEvent.click(submit);
  fireEvent.click(submit);
  await waitFor(() => expect(api.importRevision).toHaveBeenCalledTimes(1));
  expect(screen.getByLabelText("本地 IFC 文件")).toBeDisabled();
  await act(async () => {
    finish(run);
  });
  await waitFor(() =>
    expect(
      screen
        .getAllByRole("status")
        .some((item) => item.textContent?.includes("处理完成")),
    ).toBe(true),
  );
  await waitFor(() => expect(api.bim).toHaveBeenCalledTimes(2));
  unmount();
  cache.clear();
});

it("rejecting a new oversized file clears the previous import target", async () => {
  const { unmount, cache } = view();
  fireEvent.change(screen.getByLabelText("本地 IFC 文件"), {
    target: { files: [new File(["IFC"], "first.ifc")] },
  });
  await screen.findByText("Local viewer: first.ifc");
  const tooLarge = new File(["x"], "too-large.ifc");
  Object.defineProperty(tooLarge, "size", { value: 26 * 1024 * 1024 });
  fireEvent.change(screen.getByLabelText("本地 IFC 文件"), {
    target: { files: [tooLarge] },
  });
  expect(screen.getByRole("alert")).toHaveTextContent("25 MiB");
  expect(
    screen.queryByRole("button", { name: "添加到项目" }),
  ).not.toBeInTheDocument();
  expect(screen.queryByText("Local viewer: first.ifc")).not.toBeInTheDocument();
  unmount();
  cache.clear();
});

it("renders the full condition set as labelled rows, never as JSON source", async () => {
  vi.spyOn(api, "bim").mockResolvedValue([
    {
      id: "2O2Fr$t4X7Zf8NOew3FL9r",
      name: "East core wall",
      type: "IfcWall",
      storey: "L02-E",
      space: "L02-E-ZONE",
      revision: "V16",
      ifc_schema: null,
      related_ids: [],
      properties: {
        FireRating: "120 min",
        Width: 0.2,
        ChangeStatus: "baseline",
        WorkPackageIds: ["WP-100", "WP-200"],
      },
    },
  ]);
  const cache = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  const { unmount } = render(
    <QueryClientProvider client={cache}>
      <BIMWorkspace
        project="harbor-east"
        impacted={["2O2Fr$t4X7Zf8NOew3FL9r"]}
      />
    </QueryClientProvider>,
  );
  fireEvent.click(screen.getByRole("button", { name: "展开上下文列表" }));
  expect(
    screen.getByRole("button", { name: "收起上下文列表" }),
  ).toHaveAttribute("aria-expanded", "true");
  fireEvent.click(
    await screen.findByRole("button", { name: "East core wall" }),
  );
  fireEvent.click(screen.getByRole("button", { name: "技术详情" }));
  expect(await screen.findByText("防火等级")).toBeInTheDocument();
  expect(screen.getByText("120 min")).toBeInTheDocument();
  expect(screen.getByText("0.2 m")).toBeInTheDocument();
  expect(screen.getByText("基线")).toBeInTheDocument();
  expect(screen.getByText("WP-100、WP-200")).toBeInTheDocument();
  // The disclosure is a property sheet, not a dumped record.
  expect(document.querySelector(".spatial-inspector pre")).toBeNull();
  unmount();
  cache.clear();
});

it("switches inspector content by keyboard and hides unavailable document tabs", async () => {
  vi.spyOn(api, "bim").mockResolvedValue([
    {
      id: "wall-1",
      name: "East core wall",
      type: "IfcWall",
      storey: "L02",
      space: "Core",
      revision: "V16",
      ifc_schema: null,
      related_ids: [],
      properties: { FireRating: "120 min" },
    },
  ]);
  const cache = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  render(
    <QueryClientProvider client={cache}>
      <BIMWorkspace project="harbor-east" impacted={["wall-1"]} />
    </QueryClientProvider>,
  );
  fireEvent.click(screen.getByRole("button", { name: "展开上下文列表" }));
  fireEvent.click(
    await screen.findByRole("button", { name: "East core wall" }),
  );
  const tabs = screen.getByRole("tablist", { name: "构件上下文" });
  fireEvent.keyDown(tabs, { key: "ArrowRight" });
  expect(screen.getByRole("tab", { name: /变更/ })).toHaveAttribute(
    "aria-selected",
    "true",
  );
  expect(
    within(screen.getByRole("complementary", { name: "构件详情" })).getByText(
      "受设计变更影响",
    ),
  ).toBeVisible();
  fireEvent.keyDown(tabs, { key: "ArrowRight" });
  expect(screen.getByRole("tab", { name: /问题/ })).toHaveAttribute(
    "aria-selected",
    "true",
  );
  expect(screen.getByText("暂无关联问题。")).toBeVisible();
  expect(screen.queryByRole("tab", { name: "文档" })).toBeNull();

  expect(screen.getByRole("button", { name: "检查器选项" })).toBeVisible();
});

it("switches from a local preview to the saved project file without retaining the old preview", async () => {
  vi.spyOn(api, "sourceStatuses").mockResolvedValue([
    {
      source: {
        id: "model",
        project_id: "harbor-east",
        name: "Model",
        kind: "BIM",
        created_at: "2026-01-01T00:00:00Z",
      },
      latest_revision_id: "r1",
      accepted_revision_id: "r1",
      baseline_id: "b1",
      has_pending_revision: false,
    },
  ]);
  vi.spyOn(api, "bim").mockResolvedValue([]);
  vi.spyOn(globalThis, "fetch").mockResolvedValue(
    new Response(new Blob(["IFC"]), { status: 200 }),
  );
  const cache = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  render(
    <QueryClientProvider client={cache}>
      <BIMWorkspace project="harbor-east" impacted={[]} onLocalFile={vi.fn()} />
    </QueryClientProvider>,
  );
  fireEvent.change(screen.getByLabelText("本地 IFC 文件"), {
    target: { files: [new File(["local"], "local.ifc")] },
  });
  expect(await screen.findByText("Local viewer: local.ifc")).toBeVisible();
  fireEvent.click(screen.getByRole("button", { name: "打开项目模型" }));
  expect(
    await screen.findByText("Local viewer: project-model.ifc"),
  ).toBeVisible();
  expect(screen.queryByText(/本地预览 · local.ifc/)).not.toBeInTheDocument();
  cache.clear();
});
