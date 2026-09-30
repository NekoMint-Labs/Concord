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
  const action = await screen.findByRole("button", { name: "B1 → R3" });
  await waitFor(() => expect(action).toBeEnabled());
  fireEvent.click(action);
  await waitFor(() =>
    expect(compare).toHaveBeenCalledWith("project", "model", {
      from_revision_id: "r1",
      to_revision_id: "r3",
    }),
  );
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
