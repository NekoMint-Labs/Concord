import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import {
  api,
  requestHeaders,
  type AgentRun,
  type Baseline,
  type ProjectSourceRevision,
  type ProjectSourceStatus,
} from "../api/client";
import { ProjectSourceRegister } from "./ProjectSourceRegister";
import { SourceContextPane } from "./SourceContextPane";
import { AddSourcesDialog } from "./CreateSourceDialog";

// Test ingestion/confirmation behavior; Radix portal mechanics are owned by the primitive.
vi.mock("../components/ui/AppDialog", () => ({
  AppDialog: ({
    open,
    title,
    children,
  }: {
    open: boolean;
    title: string;
    children: React.ReactNode;
  }) =>
    open ? (
      <div role="dialog" aria-label={title}>
        {children}
      </div>
    ) : null,
}));

const status: ProjectSourceStatus = {
  source: {
    id: "model",
    project_id: "project",
    name: "East model",
    kind: "BIM",
    created_at: "2026-01-01T00:00:00Z",
  },
  latest_revision_id: "r2",
  accepted_revision_id: "r1",
  baseline_id: "b1",
  has_pending_revision: true,
};
const r1: ProjectSourceRevision = {
  id: "r1",
  project_id: "project",
  source_id: "model",
  sequence: 1,
  external_label: null,
  original_filename: "original.ifc",
  sha256: "0".repeat(64),
  media_type: null,
  size_bytes: 1,
  storage_key: "key",
  import_status: "STORED",
  imported_at: "2026-01-01T00:00:00Z",
};
const r2 = { ...r1, id: "r2", sequence: 2, original_filename: "renamed.ifc" };
const baseline: Baseline = {
  id: "b1",
  project_id: "project",
  sequence: 1,
  name: "B1",
  entries: [{ source_id: "model", revision_id: "r1" }],
  accepted_by: "user",
  created_at: "2026-01-01T00:00:00Z",
};
const run: AgentRun = {
  id: "parse-run",
  project_id: "project",
  status: "FAILED",
  category: "bim_import",
  error: "Invalid IFC header",
  event_id: null,
  runtime: "test",
  runtime_execution_id: null,
  generation: 0,
  runtime_generation: 0,
  analysis_id: null,
  created_at: "2026-01-01T00:00:00Z",
  updated_at: "2026-01-01T00:00:00Z",
};
function mount(component: React.ReactNode) {
  const cache = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={cache}>{component}</QueryClientProvider>,
  );
}
beforeEach(() => {
  vi.spyOn(api, "capabilities").mockResolvedValue({ capabilities: [] });
  vi.spyOn(api, "sourceStatuses").mockResolvedValue([status]);
  vi.spyOn(api, "sourceRevisions").mockResolvedValue([r1, r2]);
  vi.spyOn(api, "baselines").mockResolvedValue([baseline]);
  vi.spyOn(api, "comparisons").mockResolvedValue([]);
  vi.spyOn(api, "revisionImport").mockResolvedValue(run);
});
afterEach(() => vi.restoreAllMocks());

it("selects a logical source and confirms the complete version set without a READY/processing gate", async () => {
  const select = vi.fn();
  const create = vi
    .spyOn(api, "createBaseline")
    .mockResolvedValue({ ...baseline, id: "b2", sequence: 2 });
  mount(
    <ProjectSourceRegister
      project="project"
      sourceId="model"
      onSelectSource={select}
    />,
  );
  const row = await screen.findByRole("button", {
    name: /East model.*最新.*R2.*基线.*R1/,
  });
  fireEvent.click(row);
  expect(select).toHaveBeenCalledWith("model");
  expect(await screen.findByText("Invalid IFC header")).toBeVisible();
  expect(screen.queryByRole("button", { name: "确认新基线" })).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "基线记录与操作" }));
  fireEvent.click(screen.getByRole("button", { name: "确认新基线" }));
  const dialog = screen.getByRole("dialog", { name: "确认基线 B2" });
  expect(within(dialog).getByText("East model：R2")).toBeVisible();
  expect(within(dialog).getByText("处理失败")).toBeVisible();
  expect(create).not.toHaveBeenCalled();
  fireEvent.click(within(dialog).getByRole("button", { name: "确认 B2" }));
  await waitFor(() =>
    expect(create).toHaveBeenCalledWith("project", {
      name: "B2",
      entries: [{ source_id: "model", revision_id: "r2" }],
    }),
  );
});
it("compares B1 directly with current, not just adjacent revisions", async () => {
  const r3 = { ...r2, id: "r3", sequence: 3 };
  vi.mocked(api.sourceStatuses).mockResolvedValue([
    { ...status, latest_revision_id: "r3", accepted_revision_id: "r2" },
  ]);
  vi.mocked(api.sourceRevisions).mockResolvedValue([r1, r2, r3]);
  vi.mocked(api.baselines).mockResolvedValue([
    baseline,
    {
      ...baseline,
      id: "b2",
      sequence: 2,
      entries: [{ source_id: "model", revision_id: "r2" }],
    },
  ]);
  vi.mocked(api.revisionImport).mockResolvedValue({
    ...run,
    status: "COMPLETED",
    error: null,
  });
  const compare = vi
    .spyOn(api, "compareRevisions")
    .mockRejectedValue(new Error("comparison unavailable"));
  mount(
    <SourceContextPane
      project="project"
      sourceId="model"
      onContext={vi.fn()}
      onInvestigate={vi.fn()}
      onInspectImpact={vi.fn()}
    />,
  );
  fireEvent.click(
    await screen.findByRole("button", { name: "比较详情与操作" }),
  );
  const action = await screen.findByRole("button", { name: "B1 → R3" });
  await waitFor(() => expect(action).toBeEnabled());
  fireEvent.click(action);
  await waitFor(() =>
    expect(compare).toHaveBeenCalledWith("project", "model", {
      from_revision_id: "r1",
      to_revision_id: "r3",
    }),
  );
  expect(screen.queryByText("original.ifc")).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "版本历史与操作" }));
  expect(screen.getByText("original.ifc")).toBeVisible();
  expect(screen.getByRole("button", { name: "添加版本" })).toBeVisible();
});
it("keeps multi-file Add Revision targeted to the selected source and retains individual upload failures", async () => {
  const create = vi.fn();
  const upload = vi
    .fn()
    .mockRejectedValueOnce(new Error("Upload interrupted"))
    .mockResolvedValue({ revision: r2, duplicate: false });
  mount(
    <AddSourcesDialog
      open
      onOpenChange={vi.fn()}
      sourceId="model"
      sources={[status]}
      supportedFormats={[".ifc"]}
      onCreate={create}
      onUpload={upload}
    />,
  );
  fireEvent.change(screen.getByLabelText("选择文件（可多选）"), {
    target: { files: [new File(["a"], "a.ifc"), new File(["b"], "b.ifc")] },
  });
  fireEvent.click(screen.getByRole("button", { name: "上传并处理" }));
  expect(await screen.findByText("Upload interrupted")).toBeVisible();
  await waitFor(() =>
    expect(
      screen.getByRole("button", { name: "重试未上传文件" }),
    ).toBeEnabled(),
  );
  expect(upload).toHaveBeenCalledTimes(2);
  expect(upload.mock.calls.every(([input]) => input.source === "model")).toBe(
    true,
  );
  expect(create).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "重试未上传文件" }));
  await waitFor(() => expect(upload).toHaveBeenCalledTimes(3));
});
it("retains a created logical source after upload failure instead of creating it twice on retry", async () => {
  const create = vi.fn().mockResolvedValue(status.source);
  const upload = vi
    .fn()
    .mockRejectedValueOnce(new Error("Upload interrupted"))
    .mockResolvedValue({ revision: r1, duplicate: false });
  mount(
    <AddSourcesDialog
      open
      onOpenChange={vi.fn()}
      sources={[]}
      supportedFormats={[".ifc"]}
      onCreate={create}
      onUpload={upload}
    />,
  );
  fireEvent.change(screen.getByLabelText("选择文件（可多选）"), {
    target: { files: [new File(["a"], "a.ifc")] },
  });
  fireEvent.change(screen.getByLabelText("新资料名称 · a.ifc"), {
    target: { value: "East model" },
  });
  fireEvent.click(screen.getByRole("button", { name: "上传并处理" }));
  await screen.findByText(/Upload interrupted/);
  fireEvent.click(screen.getByRole("button", { name: "重试未上传文件" }));
  await waitFor(() =>
    expect(screen.getByRole("button", { name: "完成" })).toBeVisible(),
  );
  expect(create).toHaveBeenCalledTimes(1);
  expect(create).toHaveBeenCalledWith({ name: "East model", kind: "BIM" });
  expect(upload.mock.calls[1][0].source).toBe("model");
});

it("keeps investigation progress/results scoped to the selected logical source", async () => {
  const scope = {
    source_id: "other",
    from_revision_id: null,
    to_revision_id: "r2",
    work_package_ids: [],
    area_ids: [],
    element_ids: [],
  };
  mount(
    <SourceContextPane
      project="project"
      sourceId="model"
      investigation={{ scope, progress: <span>Other source progress</span> }}
      report={{
        scope,
        answer: {
          summary: "Other source result",
          evidence_ids: [],
          limitations: [],
        },
        evidence: [],
        tools: [],
        persisted: true,
        run_id: "investigation",
        analysis_id: "analysis",
        generation: 0,
      }}
    />,
  );
  await screen.findByRole("heading", { name: "East model" });
  expect(screen.queryByText("Other source progress")).toBeNull();
  expect(screen.queryByText("Other source result")).toBeNull();
});

it("hands affected work-package changes to the parent's model context", async () => {
  vi.mocked(api.revisionImport).mockResolvedValue({
    ...run,
    status: "COMPLETED",
    error: null,
  });
  const comparison = {
    id: "comparison",
    engine: "test",
    engine_version: "1",
    status: "COMPLETED" as const,
    raw_result_key: "comparison-result",
    project_id: "project",
    source_id: "model",
    from_revision_id: "r1",
    to_revision_id: "r2",
    created_at: "2026-01-01T00:00:00Z",
    evidence_ids: [],
    summary: {
      added: 0,
      deleted: 0,
      changed: 1,
      from_elements: 1,
      to_elements: 1,
      common_global_ids: 1,
      global_id_continuity: 1,
      warnings: [],
      compare_seconds: 0.1,
    },
  };
  const changes = [
    {
      comparison_id: "comparison",
      global_id: "element-1",
      change_kind: "changed" as const,
      changed_aspects: ["name"],
    },
  ];
  vi.mocked(api.comparisons).mockResolvedValue([comparison]);
  vi.spyOn(api, "comparison").mockResolvedValue({
    comparison,
    changes,
    affected_work_packages: [{ work_package_id: "real-work", changes }],
  });
  const inspect = vi.fn();
  mount(
    <SourceContextPane
      project="project"
      sourceId="model"
      onContext={vi.fn()}
      onInvestigate={vi.fn()}
      onInspectImpact={inspect}
    />,
  );
  expect(await screen.findByText("受影响工作包 1 个")).toBeVisible();
  expect(
    screen.queryByRole("button", { name: /关联工作包.*1 个变更构件/ }),
  ).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "比较详情与操作" }));
  fireEvent.click(
    await screen.findByRole("button", { name: /关联工作包.*1 个变更构件/ }),
  );
  expect(inspect).toHaveBeenCalledWith("real-work", {
    sourceId: "model",
    fromRevisionId: "r1",
    fromRevisionLabel: "R1",
    revisionId: "r2",
    revisionLabel: "R2",
    highlightIds: ["element-1"],
    changes,
  });
});

it.each(["Response", "DOM"] as const)(
  "opens focused revision actions and authenticates/retries downloads with a %s Blob",
  async (blobKind) => {
    vi.mocked(api.revisionImport).mockResolvedValue({
      ...run,
      status: "COMPLETED",
      error: null,
    });
    const openModel = vi.fn();
    const investigate = vi.fn();
    const response = new Response("original IFC");
    if (blobKind === "DOM") {
      vi.spyOn(response, "blob").mockResolvedValue(
        new Blob(["original IFC"], { type: "text/plain;charset=utf-8" }),
      );
    }
    const fetchSource = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(new Response(null, { status: 403 }))
      .mockResolvedValueOnce(response);
    const createUrl = vi.fn((_blob: Blob) => "blob:original-ifc");
    Object.defineProperty(URL, "createObjectURL", {
      configurable: true,
      value: createUrl,
    });
    Object.defineProperty(URL, "revokeObjectURL", {
      configurable: true,
      value: vi.fn(),
    });
    const anchorClick = vi
      .spyOn(HTMLAnchorElement.prototype, "click")
      .mockImplementation(() => {});
    mount(
      <SourceContextPane
        project="project"
        sourceId="model"
        focusRevisionId="r1"
        onOpenModel={openModel}
        onInvestigate={investigate}
      />,
    );
    const filename = await screen.findByText("original.ifc");
    const revision = filename.closest("article")!;
    expect(revision).toHaveClass("is-focused");
    expect(within(revision).getByText("R1")).toBeVisible();
    expect(within(revision).getByText("B1")).toBeVisible();
    expect(revision.querySelector("time")).toHaveAttribute(
      "datetime",
      r1.imported_at,
    );
    await waitFor(() =>
      expect(
        within(revision).getByRole("button", { name: "查看模型" }),
      ).toBeVisible(),
    );
    fireEvent.click(within(revision).getByRole("button", { name: "查看模型" }));
    expect(openModel).toHaveBeenCalledWith("model", "r1");
    fireEvent.click(
      within(revision).getByRole("button", { name: "调查此版本" }),
    );
    expect(investigate).toHaveBeenCalledWith(
      "model",
      "r1",
      undefined,
      undefined,
      "R1",
    );
    expect(
      within(revision).queryByRole("button", { name: "下载原文件" }),
    ).toBeNull();
    const disclosure = within(revision).getByRole("button", {
      name: "原文件与处理记录",
    });
    expect(disclosure).toHaveAttribute("aria-expanded", "false");
    fireEvent.click(disclosure);
    expect(await within(revision).findByText("parse-run")).toBeVisible();
    fireEvent.click(
      within(revision).getByRole("button", { name: "下载原文件" }),
    );
    expect(await within(revision).findByRole("alert")).toHaveTextContent(
      "来源文件不可用",
    );
    expect(fetchSource).toHaveBeenCalledWith(
      "/api/projects/project/sources/model/revisions/r1/content",
      { headers: requestHeaders() },
    );
    fireEvent.click(
      within(revision).getByRole("button", { name: "重试下载原文件" }),
    );
    await waitFor(() => expect(anchorClick).toHaveBeenCalledTimes(1));
    expect(createUrl).toHaveBeenCalledTimes(1);
    const blob = createUrl.mock.calls[0][0];
    expect(blob.size).toBe(12);
    expect(blob.type).toBe("text/plain;charset=utf-8");
    // Node Response and jsdom expose different Blob constructors/read APIs.
    const content =
      typeof blob.text === "function"
        ? await blob.text()
        : await new Promise<string>((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(String(reader.result));
            reader.onerror = () => reject(reader.error);
            reader.readAsText(blob);
          });
    expect(content).toBe("original IFC");
    await waitFor(() =>
      expect(within(revision).queryByRole("alert")).toBeNull(),
    );
  },
);

it("retains the exact selected comparison when a newer revision exists", async () => {
  const r3 = { ...r2, id: "r3", sequence: 3 };
  vi.mocked(api.sourceStatuses).mockResolvedValue([
    { ...status, latest_revision_id: "r3" },
  ]);
  vi.mocked(api.sourceRevisions).mockResolvedValue([r1, r2, r3]);
  vi.mocked(api.revisionImport).mockResolvedValue({
    ...run,
    status: "COMPLETED",
    error: null,
  });
  vi.mocked(api.comparisons).mockResolvedValue([
    {
      id: "saved-comparison",
      engine: "test",
      engine_version: "1",
      status: "COMPLETED",
      raw_result_key: "result",
      project_id: "project",
      source_id: "model",
      from_revision_id: "r1",
      to_revision_id: "r2",
      created_at: r1.imported_at,
      evidence_ids: [],
      summary: {
        added: 1,
        deleted: 0,
        changed: 0,
        from_elements: 1,
        to_elements: 2,
        common_global_ids: 1,
        global_id_continuity: 1,
        warnings: [],
        compare_seconds: 0.1,
      },
    },
  ]);
  vi.spyOn(api, "comparison").mockImplementation(async () => ({
    comparison: (await api.comparisons("project", "model"))[0],
    changes: [],
    affected_work_packages: [],
  }));
  const context = vi.fn();
  mount(
    <SourceContextPane
      project="project"
      sourceId="model"
      focusComparisonId="saved-comparison"
      onContext={context}
    />,
  );
  const comparison = await screen.findByRole("region", {
    name: "基线与最新版本比较",
  });
  expect(
    await within(comparison).findByRole("heading", {
      name: "版本比较 · R1 → R2",
    }),
  ).toBeVisible();
  expect(comparison).toHaveClass("is-focused");
  expect(within(comparison).getByText(/新增 1/)).toBeVisible();
  await waitFor(() =>
    expect(context).toHaveBeenLastCalledWith("model", "r2", "R2", "r1"),
  );
  expect(
    within(comparison).queryByRole("button", { name: "B1 → R3" }),
  ).toBeNull();
});

it("leads with the latest comparison, truthful unlinked impact and one existing investigation action", async () => {
  vi.mocked(api.revisionImport).mockResolvedValue({
    ...run,
    status: "COMPLETED",
    error: null,
  });
  const comparison = {
    id: "latest-comparison",
    engine: "test",
    engine_version: "1",
    status: "COMPLETED" as const,
    raw_result_key: "result",
    project_id: "project",
    source_id: "model",
    from_revision_id: "r1",
    to_revision_id: "r2",
    created_at: r2.imported_at,
    evidence_ids: [],
    summary: {
      added: 61,
      deleted: 4,
      changed: 5,
      from_elements: 10,
      to_elements: 67,
      common_global_ids: 6,
      global_id_continuity: 0.6,
      warnings: ["GlobalId continuity warning"],
      compare_seconds: 0.1,
    },
  };
  vi.mocked(api.comparisons).mockResolvedValue([comparison]);
  vi.spyOn(api, "comparison").mockResolvedValue({
    comparison,
    changes: [],
    affected_work_packages: [],
  });
  const investigate = vi.fn();
  const openModel = vi.fn();
  mount(
    <SourceContextPane
      project="project"
      sourceId="model"
      onContext={vi.fn()}
      onInvestigate={investigate}
      onInspectImpact={vi.fn()}
      onOpenModel={openModel}
    />,
  );
  const identity = await screen.findByRole("region", { name: "当前资料版本" });
  expect(identity).toHaveTextContent("最新版本R2 · 待确认");
  expect(identity).toHaveTextContent("当前基线 B1R1");
  const summary = screen.getByRole("region", { name: "基线与最新版本比较" });
  expect(
    await within(summary).findByText(/新增 61 · 删除 4 · 变更 5/),
  ).toBeVisible();
  expect(
    await within(summary).findByText(
      /受影响工作包 0 个 · 有构件变化，暂未关联工作包/,
    ),
  ).toBeVisible();
  expect(screen.queryByText("没有影响")).toBeNull();
  expect(screen.queryByText("可用 · 处理完成")).toBeNull();
  expect(screen.queryByText("original.ifc")).toBeNull();
  expect(screen.queryByRole("button", { name: "添加版本" })).toBeNull();
  expect(within(summary).getByRole("heading")).toHaveTextContent("R1 → R2");
  expect(within(summary).getAllByText(/R1 → R2/)).toHaveLength(1);
  expect(within(summary).getByRole("status")).toHaveTextContent(
    "GlobalId continuity warning",
  );
  expect(await screen.findByText("GlobalId continuity warning")).toBeVisible();
  const review = within(summary).getByRole("button", { name: "调查此比较" });
  expect(review).toBeEnabled();
  fireEvent.click(review);
  expect(investigate).toHaveBeenCalledExactlyOnceWith(
    "model",
    "r2",
    "r1",
    [],
    "R2",
    "R1",
  );
  fireEvent.click(screen.getByRole("button", { name: "版本历史与操作" }));
  expect(await screen.findByText("original.ifc")).toBeVisible();
  const latestRevision = screen.getByText("renamed.ifc").closest("article")!;
  fireEvent.click(
    within(latestRevision).getByRole("button", { name: "查看模型" }),
  );
  expect(openModel).toHaveBeenCalledExactlyOnceWith("model", "r2");
});
