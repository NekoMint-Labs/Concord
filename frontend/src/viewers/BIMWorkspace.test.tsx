import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { ComponentProps } from "react";
import fixture from "../../tests/fixtures/inspector.json";
import { api, type AgentRun, type DTO, type Workspace } from "../api/client";
import BIMWorkspace from "./BIMWorkspace";

const viewer = vi.hoisted(() => ({
  properties: null as null | ((properties: unknown, id?: string) => void),
  select: null as null | ((id: string) => void),
}));
vi.mock("./IFCViewer", () => ({
  default: ({
    file,
    onProperties,
    onSelected,
  }: {
    file: File;
    onProperties?: (properties: unknown, id?: string) => void;
    onSelected?: (id: string) => void;
  }) => {
    viewer.properties = onProperties ?? null;
    viewer.select = onSelected ?? null;
    return <div>Local viewer: {file.name}</div>;
  },
}));
beforeEach(() => {
  vi.spyOn(api, "bim").mockResolvedValue([]);
  vi.spyOn(api, "sourceStatuses").mockResolvedValue([]);
  vi.spyOn(api, "sourceRevisions").mockResolvedValue([]);
  vi.spyOn(api, "revisionImport").mockResolvedValue(null);
  vi.spyOn(api, "bimSnapshot").mockImplementation(
    async (project, source, revision) => ({
      project_id: project,
      source_id: source,
      revision_id: revision,
      elements: [],
      ifc_schema: null,
      imported_at: "2026-01-01T00:00:00Z",
      import_seconds: 0,
    }),
  );
});
afterEach(() => vi.restoreAllMocks());

function view(props: Partial<ComponentProps<typeof BIMWorkspace>> = {}) {
  const cache = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  const result = render(
    <QueryClientProvider client={cache}>
      <BIMWorkspace project="harbor-east" impacted={[]} {...props} />
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
  expect(screen.getByRole("heading", { name: "模型上下文" })).toBeVisible();
  expect(await screen.findByText("当前项目还没有模型")).toBeVisible();
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
        externalFile={new File(["IFC"], "saved-project.ifc")}
        externalFileOrigin="project"
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
      <BIMWorkspace
        project="harbor-east"
        impacted={["wall-1"]}
        externalFile={new File(["IFC"], "saved-project.ifc")}
        externalFileOrigin="project"
      />
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
  expect(
    screen.queryByRole("button", { name: "添加到项目" }),
  ).not.toBeInTheDocument();
  expect(
    screen.queryByRole("button", { name: "关闭本地视图" }),
  ).not.toBeInTheDocument();
  cache.clear();
});

it("keeps a revision-scoped deleted target inspectable without leaking stale index or delayed geometry properties", async () => {
  vi.spyOn(api, "bim").mockResolvedValue([
    {
      id: "deleted",
      name: "Wrong index name",
      type: "IfcWall",
      storey: "Old floor",
      space: "Old room",
      properties: { FireRating: "Wrong rating" },
      related_ids: [],
      revision: "OLD",
      ifc_schema: null,
    },
  ]);
  const cache = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  const file = new File(["IFC"], "exact-r88.ifc");
  const props = {
    project: "project",
    impacted: ["wall", "deleted"],
    externalFile: file,
    revisionScoped: true,
    snapshots: [
      {
        revision_id: "r88",
        global_id: "wall",
        name: "Current wall",
        ifc_class: "IfcWall",
        storey: "New floor",
        space: "New room",
        properties: { FireRating: "Current rating" },
      },
    ],
    revisionLabel: "R88 Issued",
    fromRevisionLabel: "R73 Baseline",
    changes: [
      {
        comparison_id: "c1",
        global_id: "deleted",
        change_kind: "deleted" as const,
        changed_aspects: ["geometry"],
      },
    ],
    mode: "changes" as const,
    hideSourceActions: true,
  };
  const { rerender } = render(
    <QueryClientProvider client={cache}>
      <BIMWorkspace {...props} focusId="wall" />
    </QueryClientProvider>,
  );
  await screen.findByText("Local viewer: exact-r88.ifc");
  act(() => viewer.properties?.({ Name: "Current geometry name" }, "wall"));
  fireEvent.click(screen.getByRole("button", { name: "技术详情" }));
  expect(screen.getByText("Current rating")).toBeVisible();
  rerender(
    <QueryClientProvider client={cache}>
      <BIMWorkspace {...props} focusId="deleted" />
    </QueryClientProvider>,
  );
  act(() =>
    viewer.properties?.(
      { Name: "Delayed old geometry", FireRating: "Leaked geometry rating" },
      "wall",
    ),
  );
  const inspector = screen.getByRole("complementary", { name: "构件详情" });
  expect(within(inspector).getByText(/当前版本无构件属性/)).toBeVisible();
  expect(within(inspector).getByText("R73 Baseline")).toBeVisible();
  expect(within(inspector).getAllByText("R88 Issued")[0]).toBeVisible();
  expect(within(inspector).queryByText("Wrong index name")).toBeNull();
  expect(within(inspector).queryByText("Old floor")).toBeNull();
  expect(within(inspector).queryByText("Leaked geometry rating")).toBeNull();
  cache.clear();
});

function modelStatus(
  id = "model",
): Awaited<ReturnType<typeof api.sourceStatuses>>[number] {
  return {
    source: {
      id,
      project_id: "harbor-east",
      name: `Model ${id}`,
      kind: "BIM",
      created_at: "2026-01-01T00:00:00Z",
    },
    latest_revision_id: "r2",
    accepted_revision_id: "r1",
    baseline_id: "b1",
    has_pending_revision: true,
  };
}

function savedRevision(id = "r1", sequence = 1): DTO<"ProjectSourceRevision"> {
  return {
    id,
    sequence,
    source_id: "model",
    project_id: "harbor-east",
    original_filename: `${id}.ifc`,
    external_label: null,
    sha256: "0".repeat(64),
    media_type: "application/x-step",
    size_bytes: 3,
    storage_key: "key",
    import_status: "STORED",
    imported_at: "2026-01-01T00:00:00Z",
  };
}

it("keeps the empty canvas and inspector honest, disabling project open only after sources load", async () => {
  let finish!: (
    sources: Awaited<ReturnType<typeof api.sourceStatuses>>[number][],
  ) => void;
  vi.mocked(api.sourceStatuses).mockReturnValue(
    new Promise((resolve) => {
      finish = resolve;
    }),
  );
  const onModels = vi.fn();
  const { unmount, cache } = view({ onModels });
  expect(screen.getByText("正在读取项目资料")).toBeVisible();
  expect(screen.queryByRole("region", { name: "模型上下文" })).toBeNull();
  expect(screen.getByRole("heading", { name: "模型上下文" })).toBeVisible();
  expect(screen.queryByRole("complementary", { name: "构件详情" })).toBeNull();
  expect(screen.getByRole("button", { name: "打开项目模型" })).toBeEnabled();
  await act(async () => finish([]));
  await waitFor(() =>
    expect(screen.getByRole("button", { name: "打开项目模型" })).toBeDisabled(),
  );
  fireEvent.click(screen.getByRole("button", { name: "添加项目模型 →" }));
  expect(onModels).toHaveBeenCalledOnce();
  unmount();
  cache.clear();
});

it.each(["localFile", "externalFile"] as const)(
  "does not infer project origin from filename or GlobalId for %s",
  async (fileSource) => {
    const workspace = fixture.waiting as unknown as Workspace;
    const id = workspace.state.work_packages[0].element_ids[0];
    vi.mocked(api.bim).mockResolvedValue([
      {
        id,
        name: "Wrong project element",
        type: "IfcWall",
        storey: "Wrong floor",
        space: "Wrong room",
        revision: "latest",
        ifc_schema: null,
        related_ids: [],
        properties: { FireRating: "Wrong rating" },
      },
    ]);
    const file = new File(["IFC"], "project-model.ifc");
    const { unmount, cache } = view({
      localFile: fileSource === "localFile" ? file : undefined,
      externalFile: fileSource === "externalFile" ? file : undefined,
      externalFileOrigin: fileSource === "externalFile" ? "local" : undefined,
      workspace,
      impacted: [id],
      focusId: "project-selection",
      changes: [
        {
          comparison_id: "comparison",
          global_id: id,
          change_kind: "changed",
          changed_aspects: ["geometry"],
        },
      ],
      issues: workspace.analysis?.constraints,
      snapshots: [
        {
          revision_id: "r1",
          global_id: id,
          name: "Wrong saved element",
          ifc_class: "IfcWall",
          storey: "Wrong saved floor",
          space: null,
          properties: { FireRating: "Wrong saved rating" },
        },
      ],
      revisionScoped: true,
      onInvestigate: vi.fn(),
      workPackage: workspace.state.work_packages[0],
    });
    await screen.findByText("Local viewer: project-model.ifc");
    act(() => viewer.select?.(id));
    act(() =>
      viewer.properties?.(
        {
          Name: { value: "Actual local element" },
          type: "IfcDoor",
          FireRating: "Local 90 min",
        },
        id,
      ),
    );
    expect(
      screen.getByRole("heading", { name: "Actual local element" }),
    ).toBeVisible();
    expect(screen.getByText(/本地预览 · project-model.ifc/)).toBeVisible();
    expect(
      screen.getByRole("button", { name: "添加到项目" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "关闭本地视图" }),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "技术详情" }));
    expect(screen.getByText("Local 90 min")).toBeVisible();
    expect(screen.queryByText(/Wrong/)).toBeNull();
    expect(screen.queryByRole("tablist", { name: "构件上下文" })).toBeNull();
    expect(screen.queryByRole("button", { name: "调查变更 →" })).toBeNull();
    expect(screen.queryByRole("button", { name: "工作包" })).toBeNull();
    expect(screen.queryByText("受设计变更影响")).toBeNull();
    unmount();
    cache.clear();
  },
);

it.each([true, false])(
  "opens the selected historical revision with autoProjectModel=%s using its snapshot",
  async (autoProjectModel) => {
    vi.mocked(api.sourceStatuses).mockResolvedValue([
      modelStatus("other"),
      modelStatus(),
    ]);
    vi.mocked(api.sourceRevisions).mockResolvedValue([
      savedRevision(),
      savedRevision("r2", 2),
    ]);
    vi.mocked(api.revisionImport).mockResolvedValue({
      ...fixture.waiting.run,
      status: "COMPLETED",
      category: "bim_import",
      generation: 0,
    } as AgentRun);
    vi.mocked(api.bim).mockResolvedValue([
      {
        id: "wall",
        name: "Wrong latest wall",
        type: "IfcDoor",
        storey: "Wrong latest floor",
        space: null,
        revision: "r2",
        ifc_schema: null,
        related_ids: [],
        properties: { FireRating: "Wrong latest rating" },
      },
    ]);
    vi.mocked(api.bimSnapshot).mockResolvedValue({
      project_id: "harbor-east",
      source_id: "model",
      revision_id: "r1",
      ifc_schema: null,
      imported_at: "2026-01-01T00:00:00Z",
      import_seconds: 0,
      elements: [
        {
          revision_id: "r1",
          global_id: "wall",
          name: "Historical wall",
          ifc_class: "IfcWall",
          storey: "Historical floor",
          space: null,
          properties: { FireRating: "Historical 120 min" },
        },
      ],
    });
    const fetch = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(new Response(new Blob(["IFC"]), { status: 200 }));
    const { unmount, cache } = view({
      autoProjectModel,
      selectedSourceId: "model",
      selectedRevisionId: "r1",
      focusId: "wall",
    });
    if (!autoProjectModel)
      fireEvent.click(screen.getByRole("button", { name: "打开项目模型" }));
    await screen.findByText("Local viewer: project-model.ifc");
    expect(fetch).toHaveBeenCalledWith(
      expect.stringContaining("/sources/model/revisions/r1/content"),
      expect.anything(),
    );
    expect(api.bimSnapshot).toHaveBeenCalledWith("harbor-east", "model", "r1");
    expect(
      await screen.findByRole("heading", { name: "Historical wall" }),
    ).toBeVisible();
    expect(screen.getByText("Historical floor")).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "技术详情" }));
    expect(screen.getByText("Historical 120 min")).toBeVisible();
    expect(screen.queryByText(/Wrong latest/)).toBeNull();
    expect(screen.getByText("项目模型 · R1")).toBeVisible();
    expect(screen.queryByRole("button", { name: "添加到项目" })).toBeNull();
    unmount();
    cache.clear();
  },
);

it("requires an explicit model selection for an ambiguous root open", async () => {
  vi.mocked(api.sourceStatuses).mockResolvedValue([
    modelStatus("first"),
    modelStatus("second"),
  ]);
  const fetch = vi.spyOn(globalThis, "fetch");
  const { unmount, cache } = view({ autoProjectModel: true });
  await screen.findByText("选择项目模型");
  fireEvent.click(screen.getByRole("button", { name: "打开项目模型" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("项目有多个模型");
  expect(fetch).not.toHaveBeenCalled();
  expect(api.bimSnapshot).not.toHaveBeenCalled();
  unmount();
  cache.clear();
});

it("retries a source-list failure instead of disabling project open or claiming the project is empty", async () => {
  vi.mocked(api.sourceStatuses)
    .mockRejectedValueOnce(new Error("资料服务离线"))
    .mockResolvedValue([modelStatus()]);
  const { unmount, cache } = view();
  expect(await screen.findByRole("alert")).toHaveTextContent("资料服务离线");
  expect(screen.getByText("项目资料暂时不可用")).toBeVisible();
  expect(screen.getByRole("button", { name: "打开项目模型" })).toBeEnabled();
  fireEvent.click(screen.getByRole("button", { name: "重试读取项目资料" }));
  expect(await screen.findByText("选择项目模型")).toBeVisible();
  expect(screen.queryByRole("alert")).toBeNull();
  unmount();
  cache.clear();
});

it("retries reading the selected revision content", async () => {
  vi.mocked(api.sourceStatuses).mockResolvedValue([modelStatus()]);
  vi.spyOn(globalThis, "fetch")
    .mockRejectedValueOnce(new Error("模型读取离线"))
    .mockResolvedValue(new Response(new Blob(["IFC"]), { status: 200 }));
  const { unmount, cache } = view({
    autoProjectModel: true,
    selectedSourceId: "model",
    selectedRevisionId: "r1",
  });
  expect(await screen.findByRole("alert")).toHaveTextContent("模型读取离线");
  expect(screen.getByText("项目模型无法打开")).toBeVisible();
  fireEvent.click(screen.getByRole("button", { name: "重试打开项目模型" }));
  expect(
    await screen.findByText("Local viewer: project-model.ifc"),
  ).toBeVisible();
  expect(screen.queryByRole("alert")).toBeNull();
  unmount();
  cache.clear();
});

it.each([
  ["QUEUED", "等待处理"],
  ["RUNNING", "正在处理"],
  ["FAILED", "处理失败"],
  ["COMPLETED", "处理完成"],
  ["WAITING_APPROVAL", "等待审批"],
  ["CANCELLED", "已取消"],
  ["EXPIRED", "已过期"],
] as const)(
  "shows the exact selected revision processing state %s",
  async (status, label) => {
    vi.mocked(api.sourceStatuses).mockResolvedValue([modelStatus()]);
    vi.mocked(api.sourceRevisions).mockResolvedValue([savedRevision()]);
    vi.mocked(api.revisionImport).mockResolvedValue({
      ...fixture.waiting.run,
      category: "bim_import",
      generation: 0,
      status,
    } as AgentRun);
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(new Blob(["IFC"]), { status: 200 }),
    );
    const { unmount, cache } = view({
      autoProjectModel: true,
      selectedSourceId: "model",
      selectedRevisionId: "r1",
    });
    expect(
      await screen.findByText(
        `${status === "COMPLETED" ? "项目模型" : "项目文件预览"} · R1${status === "COMPLETED" ? "" : ` · ${label}`}`,
      ),
    ).toBeVisible();
    unmount();
    cache.clear();
  },
);

it("keeps a selected object's overview lean while retaining explicit empty tabs and technical properties", async () => {
  const { cache, unmount } = view({
    externalFile: new File(["IFC"], "project.ifc"),
    externalFileOrigin: "project",
    hideSourceActions: true,
    revisionLabel: "R2",
    focusId: "unlinked-element",
    snapshots: [
      {
        revision_id: "r2",
        global_id: "unlinked-element",
        name: "AHU-02",
        ifc_class: "IfcAirHandlingUnit",
        storey: "L02",
        space: null,
        properties: { Rating: "100 kW" },
      },
    ],
    onNavigate: vi.fn(),
    onWorkPackage: vi.fn(),
  });
  const inspector = await screen.findByRole("complementary", {
    name: "构件详情",
  });
  expect(
    await within(inspector).findByRole("heading", { name: "AHU-02" }),
  ).toBeVisible();
  expect(
    within(inspector).queryByRole("heading", { name: /变更|问题/ }),
  ).toBeNull();
  expect(within(inspector).queryByText("系统", { exact: true })).toBeNull();
  expect(within(inspector).queryByText("工作包", { exact: true })).toBeNull();
  expect(document.querySelector(".element-identity")).toBeNull();
  expect(screen.queryByRole("navigation", { name: "相关页面" })).toBeNull();
  const tabs = within(inspector).getByRole("tablist", { name: "构件上下文" });
  expect(within(tabs).getAllByRole("tab")).toHaveLength(3);
  fireEvent.click(within(tabs).getByRole("tab", { name: "变更" }));
  expect(within(inspector).getByText("此构件暂无变更。")).toBeVisible();
  fireEvent.click(within(tabs).getByRole("tab", { name: "问题" }));
  expect(within(inspector).getByText("暂无关联问题。")).toBeVisible();
  fireEvent.click(within(tabs).getByRole("tab", { name: "概览" }));
  fireEvent.click(within(inspector).getByRole("button", { name: "技术详情" }));
  expect(within(inspector).getByText("100 kW")).toBeVisible();
  unmount();
  cache.clear();
});
