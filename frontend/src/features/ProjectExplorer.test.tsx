import { useState, type ComponentProps } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import fixture from "../../tests/fixtures/inspector.json";
import {
  api,
  type DTO,
  type ProjectSourceStatus,
  type Workspace,
} from "../api/client";
import { ProjectExplorer, type ExplorerTarget } from "./ProjectExplorer";
import { BrowseStage, browseNavigatorItems } from "../app/BrowseStage";
import { WorkspaceNavigator } from "../app/WorkspaceChrome";
import { ContextInspector } from "../app/ContextInspector";
import { stageKey, stageObject, type StageObject } from "../app/stageContracts";
import { FindingWorkbench } from "./FindingWorkbench";
import { useWorkspaceLayout } from "../layout/WorkspaceLayout";
const project = "tower-project";
const timestamp = "2026-01-01T00:00:00Z";
const workspace = structuredClone(fixture.waiting) as unknown as Workspace;
workspace.state.project.id = project;
workspace.state.work_packages = [
  {
    ...workspace.state.work_packages[0],
    id: "pkg-west",
    name: "West tower duct installation",
    discipline: "Mechanical",
  },
];
workspace.analysis!.evidence = [
  {
    ...workspace.analysis!.evidence[0],
    id: "ev-clearance",
    source_id: "site-survey/west",
    source_revision: "Survey-7",
    work_package_id: "pkg-west",
    provider: "clearance-survey",
    location: "Level 12",
    fact: "Duct clearance measured at 420 mm",
  },
];

// A document precedes two models so comparison indices cannot be source indices.
const sources: ProjectSourceStatus[] = [
  ["src-brief", "Safety brief", "DOCUMENT", "rev-brief-1", "rev-brief-1"],
  ["src-hvac", "West tower HVAC", "BIM", "rev-hvac-9", "rev-hvac-4"],
  ["src-frame", "East tower structure", "BIM", "rev-frame-3", "rev-frame-2"],
].map(([id, name, kind, latest, accepted]) => ({
  source: {
    id,
    project_id: project,
    name,
    kind: kind as "DOCUMENT" | "BIM",
    created_at: timestamp,
  },
  latest_revision_id: latest,
  accepted_revision_id: accepted,
  baseline_id: "baseline-handover",
  has_pending_revision: latest !== accepted,
}));
const revisions: DTO<"ProjectSourceRevision">[] = [
  ["rev-brief-1", "src-brief", 1, "brief.md"],
  ["rev-hvac-4", "src-hvac", 4, "hvac-old.ifc"],
  ["rev-hvac-9", "src-hvac", 9, "hvac-current.ifc"],
  ["rev-frame-2", "src-frame", 2, "frame-old.ifc"],
  ["rev-frame-3", "src-frame", 3, "frame-current.ifc"],
].map(([id, source_id, sequence, filename]) => ({
  id: String(id),
  project_id: project,
  source_id: String(source_id),
  sequence: Number(sequence),
  original_filename: String(filename),
  external_label: "Issued for coordination",
  sha256: "a".repeat(64),
  media_type: "application/octet-stream",
  size_bytes: 100,
  storage_key: `sources/${id}`,
  import_status: "STORED",
  imported_at: timestamp,
}));
const comparison: DTO<"RevisionComparison"> = {
  id: "cmp-frame",
  project_id: project,
  source_id: "src-frame",
  from_revision_id: "rev-frame-2",
  to_revision_id: "rev-frame-3",
  engine: "IfcDiff",
  engine_version: "1",
  status: "COMPLETED",
  raw_result_key: "comparison/frame",
  evidence_ids: [],
  created_at: timestamp,
  summary: {
    added: 2,
    deleted: 1,
    changed: 3,
    warnings: [],
    from_elements: 10,
    to_elements: 11,
    common_global_ids: 9,
    global_id_continuity: 0.9,
    compare_seconds: 0.1,
  },
};
const document: DTO<"DocumentMetadata"> = {
  id: "doc-permit",
  project_id: project,
  filename: "Permit notes.md",
  content_hash: "b".repeat(64),
  parser: "lightweight",
  created_at: timestamp,
};
const baseline: DTO<"Baseline"> = {
  id: "baseline-handover",
  project_id: project,
  sequence: 7,
  name: "Handover approval",
  accepted_by: "Engineer Lin",
  created_at: timestamp,
  entries: [
    { source_id: "src-hvac", revision_id: "rev-hvac-4" },
    { source_id: "src-frame", revision_id: "rev-frame-2" },
  ],
};

const finding: DTO<"Finding"> = {
  id: "finding/opaque-73",
  project_id: project,
  state: "PROPOSED",
  snapshot_id: "snapshot-x",
  work_package_id: "pkg-west",
  title: "梁调整需要复核",
  conclusion: "Measured change",
  what_changed: "结构梁标高变化",
  why_it_matters: "Review duct clearance",
  evidence_ids: ["evidence/opaque-29"],
  reasoning_summary: "Compare survey",
  confidence: 0.9,
  limitations: ["Requires engineer review"],
  created_at: timestamp,
  updated_at: timestamp,
  impact: null,
  change_ids: [],
  dependencies: [],
  suggested_action: "复核净空",
  suggested_discipline: "Mechanical",
};
const evidence: DTO<"Evidence"> = {
  id: finding.evidence_ids[0],
  snapshot_id: finding.snapshot_id,
  source_id: "src-frame",
  source_revision_id: "rev-frame-3",
  source_revision: "hash-x",
  provider: "internal-provider",
  observed_at: timestamp,
  fact: "结构梁标高变化",
  quality: "structured",
  element_ids: [],
  work_package_id: "pkg-west",
  page: null,
  location: null,
  viewer_target: {
    kind: "drawing",
    source_revision_id: "rev-frame-3",
    page: 3,
    normalized_bbox: [0.1, 0.2, 0.3, 0.4],
  },
};
const clients: QueryClient[] = [];
const noop = () => {};

beforeEach(() => {
  vi.spyOn(api, "sourceStatuses").mockResolvedValue(sources);
  vi.spyOn(api, "documents").mockResolvedValue([document]);
  vi.spyOn(api, "baselines").mockResolvedValue([baseline]);
  vi.spyOn(api, "capabilities").mockResolvedValue({ capabilities: [] });
  vi.spyOn(api, "sourceRevisions").mockImplementation(
    async (_project, source) =>
      revisions.filter((revision) => revision.source_id === source),
  );
  vi.spyOn(api, "comparisons").mockImplementation(async (_project, source) =>
    source === comparison.source_id ? [comparison] : [],
  );
  vi.spyOn(api, "comparison").mockResolvedValue({
    comparison,
    changes: [],
    affected_work_packages: [],
  });
  vi.spyOn(api, "revisionImport").mockResolvedValue(null);
  vi.spyOn(api, "chunks").mockResolvedValue([]);
  vi.spyOn(api, "engineeringFindings").mockResolvedValue([finding]);
  vi.spyOn(api, "engineeringFinding").mockResolvedValue(finding);
  vi.spyOn(api, "engineeringEvidence").mockResolvedValue(evidence);
  vi.spyOn(api, "engineeringCoordination").mockResolvedValue([]);
  vi.spyOn(api, "engineeringRechecks").mockResolvedValue([]);
  vi.spyOn(api, "engineeringDecision");
});
afterEach(() => {
  cleanup();
  clients.splice(0).forEach((client) => client.clear());
  vi.restoreAllMocks();
  localStorage.clear();
});

function mount(element: React.ReactNode) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  clients.push(client);
  render(<QueryClientProvider client={client}>{element}</QueryClientProvider>);
  return client;
}
function mountExplorer(
  entries: Pick<
    ComponentProps<typeof ProjectExplorer>,
    "previewEntries" | "onPreviewEnabled" | "findingEntries"
  > = {},
) {
  const onOpen = vi.fn<(target: ExplorerTarget) => void>();
  const onTab = vi.fn();
  mount(
    <ProjectExplorer
      workspace={workspace}
      sources={sources}
      onOpen={onOpen}
      onTab={onTab}
      {...entries}
    />,
  );
  return { onOpen, onTab };
}

it("renders the compact source/package/finding index with exact identities and no inventory refetch", () => {
  const target = {
    kind: "finding",
    id: finding.id,
    evidenceId: evidence.id,
  } as const;
  const { onOpen, onTab } = mountExplorer({
    findingEntries: [
      {
        target,
        title: finding.title,
        meta: finding.what_changed,
        type: "工程依据",
        state: "待确认",
      },
    ],
  });
  expect(screen.getByText("5 个项目对象")).toBeVisible();
  const cases: [string, string, ExplorerTarget][] = [
    ["资料", "Safety brief", { kind: "source", id: "src-brief" }],
    ["资料", "West tower HVAC", { kind: "source", id: "src-hvac" }],
    ["资料", "East tower structure", { kind: "source", id: "src-frame" }],
    [
      "工作包",
      "West tower duct installation",
      { kind: "package", id: "pkg-west" },
    ],
    ["工程判断", finding.title, target],
  ];
  for (const [group, title] of cases) {
    const row = within(screen.getByRole("region", { name: group })).getByRole(
      "button",
      { name: new RegExp(title) },
    );
    row.focus();
    expect(row).toHaveFocus();
    fireEvent.click(row);
  }
  expect(onOpen.mock.calls).toEqual(cases.map(([, , target]) => [target]));
  expect(onTab).not.toHaveBeenCalled();
  expect(api.documents).not.toHaveBeenCalled();
  expect(api.baselines).not.toHaveBeenCalled();
  expect(api.sourceRevisions).not.toHaveBeenCalled();
  expect(api.engineeringEvidence).not.toHaveBeenCalled();
});

it("keeps explicit fixture entries separate from authoritative rows and reports opt-out", () => {
  const onPreviewEnabled = vi.fn();
  const { onOpen } = mountExplorer({
    onPreviewEnabled,
    previewEntries: [
      {
        target: { kind: "fixture-evidence", id: "clash" },
        title: "B-142 × M-038 碰撞",
        meta: "结构 R2 / 机电 R1",
        type: "Evidence 示例",
        state: "不写入项目",
      },
    ],
  });
  expect(
    screen.getByRole("checkbox", { name: "包含 Finding 交互示例" }),
  ).toBeChecked();
  const group = screen.getByRole("region", { name: "交互示例" });
  expect(
    within(screen.getByRole("region", { name: "资料" })).queryByText(
      "B-142 × M-038 碰撞",
    ),
  ).toBeNull();
  fireEvent.click(
    within(group).getByRole("button", { name: /B-142 × M-038 碰撞/ }),
  );
  expect(onOpen).toHaveBeenCalledExactlyOnceWith({
    kind: "fixture-evidence",
    id: "clash",
  });
  fireEvent.click(
    screen.getByRole("checkbox", { name: "包含 Finding 交互示例" }),
  );
  expect(onPreviewEnabled).toHaveBeenCalledExactlyOnceWith(false);
  expect(api.engineeringDecision).not.toHaveBeenCalled();
});

it("does not invent empty compact groups or opt in to fixture targets", () => {
  mountExplorer();
  expect(screen.queryByRole("region", { name: "交互示例" })).toBeNull();
  expect(screen.queryByRole("region", { name: "工程判断" })).toBeNull();
  expect(screen.queryByRole("checkbox")).toBeNull();
});

function mountNavigator() {
  const items = browseNavigatorItems({
    data: workspace,
    sources,
    findings: [finding],
    revisions,
    documents: [document],
  });
  const onSelect = vi.fn();
  const onClose = vi.fn();
  function Host() {
    const [current, setCurrent] = useState<string>();
    return (
      <WorkspaceNavigator
        open
        title="工程对象"
        label="工程对象导航"
        placeholder="查找资料、版本或文档…"
        empty="没有工程对象"
        emptySearch="没有匹配的工程对象"
        footerLabel="在项目中查看资料"
        items={items}
        current={current}
        onSelect={(key) => {
          onSelect(stageObject(key));
          setCurrent(key);
        }}
        onClose={onClose}
        onFooter={noop}
      />
    );
  }
  mount(<Host />);
  return { items, onSelect, onClose };
}

it("builds loaded Browse inventory without inventing revisions and round-trips every object identity", () => {
  const { items, onSelect } = mountNavigator();
  const expected: StageObject[] = [
    ...sources.map(({ source }) => ({
      kind: "source" as const,
      id: source.id,
    })),
    { kind: "revision", sourceId: "src-brief", id: "rev-brief-1" },
    { kind: "revision", sourceId: "src-hvac", id: "rev-hvac-9" },
    { kind: "revision", sourceId: "src-hvac", id: "rev-hvac-4" },
    { kind: "revision", sourceId: "src-frame", id: "rev-frame-3" },
    { kind: "revision", sourceId: "src-frame", id: "rev-frame-2" },
    { kind: "document", id: document.id },
    { kind: "work-package", id: "pkg-west" },
    { kind: "finding", id: finding.id },
  ];
  expect(items.map((item) => item.key)).toEqual(expected.map(stageKey));
  const nav = screen.getByRole("complementary", { name: "工程对象导航" });
  for (const item of items) {
    const row = within(nav).getByTitle(`${item.label} · ${item.file}`);
    fireEvent.click(row);
    expect(row).toHaveAttribute("aria-current", "page");
  }
  expect(onSelect.mock.calls).toEqual(expected.map((object) => [object]));
  expect(
    items.find(
      (item) => item.key === stageKey({ kind: "work-package", id: "pkg-west" }),
    )?.count,
  ).toBe(1);
  expect(
    browseNavigatorItems({ data: workspace, sources }).map(
      (item) => item.label,
    ),
  ).not.toContain("West tower HVAC · R9");
  expect(api.sourceRevisions).not.toHaveBeenCalled();
});

it("searches loaded titles and metadata locally and retains exact Open targets after filtering", () => {
  const { onSelect, onClose } = mountNavigator();
  const search = screen.getByRole("textbox", { name: "工程对象导航" });
  const nav = screen.getByRole("complementary", { name: "工程对象导航" });
  const cases: [string, string, StageObject][] = [
    ["  SAFETY BRIEF  ", "Safety brief", { kind: "source", id: "src-brief" }],
    [
      "HVAC · R9",
      "West tower HVAC · R9",
      { kind: "revision", sourceId: "src-hvac", id: "rev-hvac-9" },
    ],
    ["LIGHTWEIGHT", "Permit notes.md", { kind: "document", id: document.id }],
    [
      "DUCT INSTALLATION",
      "West tower duct installation",
      { kind: "work-package", id: "pkg-west" },
    ],
    [finding.title, finding.title, { kind: "finding", id: finding.id }],
  ];
  for (const [keyword, title, target] of cases) {
    fireEvent.change(search, { target: { value: keyword } });
    const row = within(nav)
      .getByText(title, { exact: true })
      .closest("button")!;
    expect(
      Array.from(
        nav.querySelectorAll(".calm-sheet-list button strong"),
        (label) => label.textContent,
      ),
    ).toEqual(
      title === "Safety brief"
        ? ["Safety brief", "Safety brief · R1"]
        : [title],
    );
    fireEvent.click(row);
    expect(onSelect).toHaveBeenLastCalledWith(target);
    expect(row).toHaveAttribute("aria-current", "page");
  }
  fireEvent.change(search, { target: { value: "no-such-object" } });
  expect(screen.getByText("没有匹配的工程对象")).toBeVisible();
  expect(nav.querySelectorAll(".calm-sheet-list button")).toHaveLength(0);
  fireEvent.change(search, { target: { value: "" } });
  expect(nav.querySelectorAll(".calm-sheet-list button")).toHaveLength(11);
  fireEvent.keyDown(search, { key: "Escape" });
  expect(onClose).toHaveBeenCalledOnce();
  expect(api.documents).not.toHaveBeenCalled();
  expect(api.sourceRevisions).not.toHaveBeenCalled();
  expect(api.engineeringDecision).not.toHaveBeenCalled();
});

function mountStage(object: StageObject) {
  const onOpen = vi.fn();
  const onInvestigate = vi.fn();
  const onOpenFinding = vi.fn();
  const onSource = vi.fn();
  const onTab = vi.fn();
  mount(
    <BrowseStage
      project={project}
      data={workspace}
      sources={sources}
      object={object}
      perform={async (operation) => {
        await operation();
      }}
      onOpen={onOpen}
      onInvestigate={onInvestigate}
      onOpenFinding={onOpenFinding}
      onSource={onSource}
      onTab={onTab}
      onWorkPackage={noop}
    />,
  );
  return { onOpen, onInvestigate, onOpenFinding, onSource, onTab };
}

it("loads selected-source revisions/comparison independently of source-list indices and preserves baseline provenance", async () => {
  const { onOpen, onInvestigate } = mountStage({
    kind: "source",
    id: "src-frame",
  });
  expect(await screen.findByText("frame-current.ifc")).toBeVisible();
  expect(
    await screen.findByRole("region", { name: "版本影响" }),
  ).toHaveTextContent("R2 → R3");
  expect(api.comparisons).toHaveBeenCalledExactlyOnceWith(project, "src-frame");
  expect(api.comparison).toHaveBeenCalledExactlyOnceWith(
    project,
    "src-frame",
    "cmp-frame",
  );
  expect(api.baselines).toHaveBeenCalledWith(project);
  const accepted = screen.getByText("frame-old.ifc").closest("article")!;
  expect(accepted).toHaveTextContent("当前基线");
  expect(accepted).toHaveTextContent("B7");
  expect(accepted).not.toHaveTextContent("最新 · 待确认");
  expect(
    screen.getByText("frame-current.ifc").closest("article"),
  ).toHaveTextContent("最新 · 待确认");
  fireEvent.click(screen.getByRole("button", { name: "查看最新版本" }));
  expect(onOpen).toHaveBeenCalledExactlyOnceWith({
    kind: "revision",
    sourceId: "src-frame",
    id: "rev-frame-3",
  });
  fireEvent.click(screen.getByRole("button", { name: "调查此比较" }));
  expect(onInvestigate).toHaveBeenCalledExactlyOnceWith({
    sourceId: "src-frame",
    revisionId: "rev-frame-3",
    fromRevisionId: "rev-frame-2",
    elementIds: [],
  });
  expect(api.engineeringDecision).not.toHaveBeenCalled();
});

it("focuses the requested immutable revision instead of substituting latest", async () => {
  mountStage({ kind: "revision", sourceId: "src-hvac", id: "rev-hvac-4" });
  const old = (await screen.findByText("hvac-old.ifc")).closest("article")!;
  expect(old).toHaveClass("is-focused");
  expect(old).toHaveTextContent("当前基线");
  expect(
    screen.getByText("hvac-current.ifc").closest("article"),
  ).not.toHaveClass("is-focused");
  expect(api.sourceRevisions).toHaveBeenCalledWith(project, "src-hvac");
});

it("opens the exact document's persisted chunks and labels extraction provenance", async () => {
  vi.mocked(api.chunks).mockResolvedValue([
    {
      id: "chunk-permit",
      source_hash: document.content_hash,
      parser: document.parser,
      page: 3,
      location: "Permit section",
      text: "## Approved access route",
    },
  ]);
  const { onTab } = mountStage({ kind: "document", id: document.id });
  expect(
    await screen.findByRole("heading", { name: "Permit notes.md" }),
  ).toBeVisible();
  expect(await screen.findByText("Approved access route")).toBeVisible();
  expect(screen.getByText("lightweight · 1/1")).toBeVisible();
  expect(screen.getByText("3")).toBeVisible();
  expect(screen.getByText("Permit section")).toBeVisible();
  expect(api.documents).toHaveBeenCalledExactlyOnceWith(project);
  expect(api.chunks).toHaveBeenCalledExactlyOnceWith(document.id);
  fireEvent.click(screen.getByRole("button", { name: "在文档工作区打开" }));
  expect(onTab).toHaveBeenCalledExactlyOnceWith("documents");
});

it("keeps other package records available when the related finding read fails", async () => {
  vi.mocked(api.engineeringFindings).mockRejectedValueOnce(
    new Error("Offline"),
  );
  mountStage({ kind: "work-package", id: "pkg-west" });
  expect(
    await screen.findByText("无法读取工程判断，请稍后重试。"),
  ).toBeVisible();
  expect(
    screen.getByRole("heading", { name: "West tower duct installation" }),
  ).toBeVisible();
  expect(screen.getByRole("region", { name: "关联构件" })).toBeVisible();
  expect(screen.getByRole("region", { name: "相关资料" })).toHaveTextContent(
    "尚无与工作包关联的资料依据。",
  );
});

it("returns the exact opaque finding from Browse to Work without submitting a human decision", async () => {
  const { onOpenFinding } = mountStage({ kind: "finding", id: finding.id });
  expect(
    await screen.findByRole("heading", { name: finding.title }),
  ).toBeVisible();
  expect(
    screen.getByRole("region", { name: "工程判断摘要" }),
  ).toHaveTextContent(finding.what_changed);
  expect(
    screen.getByRole("region", { name: "工程判断摘要" }),
  ).toHaveTextContent(finding.why_it_matters);
  fireEvent.click(screen.getByRole("button", { name: "在「工作」中打开" }));
  expect(api.engineeringFinding).toHaveBeenCalledExactlyOnceWith(
    project,
    finding.id,
  );
  expect(onOpenFinding).toHaveBeenCalledExactlyOnceWith(finding.id);
  expect(api.engineeringDecision).not.toHaveBeenCalled();
});

it("shows exact revision identity in the single contextual inspector", () => {
  const object = {
    kind: "revision",
    sourceId: "src-frame",
    id: "rev-frame-2",
  } as const;
  const onClose = vi.fn();
  mount(
    <ContextInspector
      project={project}
      data={workspace}
      sources={sources}
      object={object}
      onClose={onClose}
      onWorkPackage={noop}
      onTab={noop}
    />,
  );
  const inspector = screen.getByRole("complementary", { name: "检查器" });
  expect(inspector).toHaveTextContent("East tower structure · 版本");
  expect(inspector).toHaveTextContent("版本编号rev-frame-2");
  expect(inspector).toHaveTextContent(stageKey(object));
  expect(inspector).not.toHaveTextContent("rev-frame-3");
  fireEvent.click(
    within(inspector).getByRole("button", { name: "关闭检查器" }),
  );
  expect(onClose).toHaveBeenCalledOnce();
});

function mountWork() {
  const onEvidenceContext = vi.fn();
  function Host() {
    const prefs = useWorkspaceLayout();
    const [selectedId, onSelect] = useState(finding.id);
    return (
      <FindingWorkbench
        prefs={prefs}
        project={project}
        selectedId={selectedId}
        evidenceId={evidence.id}
        onSelect={onSelect}
        onClose={noop}
        onEvidenceContext={onEvidenceContext}
        work={{
          workspace,
          sources,
          onPackage: noop,
          onModels: noop,
          onRecheck: noop,
          onReport: noop,
          onProject: noop,
        }}
      />
    );
  }
  const client = mount(<Host />);
  return { client, onEvidenceContext };
}

it("leads with canonical evidence metadata in Work while exact opaque provenance stays in collapsed technical details", async () => {
  const { onEvidenceContext } = mountWork();
  const receipt = await screen.findByRole("region", { name: "Finding 详情" });
  const link = await within(receipt).findByRole("button", {
    name: /结构梁标高变化/,
  });
  expect(link).toHaveTextContent("East tower structure");
  expect(link).toHaveTextContent("图纸 · 第 3 页 · 已提供区域");
  expect(link).toHaveTextContent("结构化 · 已验证");
  expect(link).not.toHaveTextContent(evidence.id);
  expect(link).not.toHaveTextContent(evidence.provider);
  fireEvent.click(link);
  expect(link).toHaveAttribute("aria-pressed", "true");
  await waitFor(() =>
    expect(onEvidenceContext).toHaveBeenLastCalledWith(evidence),
  );
  const host = screen.getByRole("main", { name: "工程依据" });
  const details = host.querySelector<HTMLDetailsElement>(
    ".evidence-technical-details",
  )!;
  expect(details.open).toBe(false);
  expect(details).toHaveTextContent(evidence.id);
  expect(details).toHaveTextContent(evidence.provider);
  expect(details).toHaveTextContent(evidence.source_revision);
  expect(details).toHaveTextContent(evidence.source_revision_id!);
  expect(
    within(details).getByLabelText("Exact viewer target").textContent,
  ).toBe(JSON.stringify(evidence.viewer_target, null, 2));
  expect(api.engineeringEvidence).toHaveBeenCalledExactlyOnceWith(
    project,
    evidence.id,
  );
  expect(api.engineeringDecision).not.toHaveBeenCalled();
});

it.each(["identity", "project"] as const)(
  "does not expose canonical evidence crossing the %s fence in the real Work session",
  async (fence) => {
    vi.mocked(api.engineeringEvidence).mockResolvedValue({
      ...evidence,
      id: fence === "identity" ? "wrong-evidence" : evidence.id,
      project_id: fence === "project" ? "other-project" : project,
      fact: "Must not leak across the evidence fence",
    } as DTO<"Evidence"> & { project_id: string });
    const { client, onEvidenceContext } = mountWork();
    await screen.findByRole("region", { name: "Finding 详情" });
    await waitFor(() => {
      expect(api.engineeringEvidence).toHaveBeenCalledWith(
        project,
        evidence.id,
      );
      expect(client.isFetching()).toBe(0);
    });
    expect(
      screen.queryByText("Must not leak across the evidence fence"),
    ).toBeNull();
    expect(
      within(screen.getByRole("region", { name: "Finding 详情" })).queryByRole(
        "button",
        { name: /结构梁标高变化/ },
      ),
    ).toBeNull();
    expect(screen.queryByLabelText("Exact viewer target")).toBeNull();
    expect(onEvidenceContext).toHaveBeenLastCalledWith(null);
    expect(api.engineeringDecision).not.toHaveBeenCalled();
  },
);

it("retries only failed canonical Evidence reads in Work without discarding the selected Finding", async () => {
  vi.mocked(api.engineeringEvidence).mockRejectedValueOnce(
    new Error("Offline"),
  );
  const { onEvidenceContext } = mountWork();
  const receipt = await screen.findByRole("region", { name: "Finding 详情" });
  expect(receipt).toHaveTextContent(finding.title);
  expect(await screen.findByText("Evidence 读取失败")).toBeVisible();
  expect(onEvidenceContext).toHaveBeenLastCalledWith(null);
  const calls = {
    findings: vi.mocked(api.engineeringFindings).mock.calls.length,
    finding: vi.mocked(api.engineeringFinding).mock.calls.length,
    coordination: vi.mocked(api.engineeringCoordination).mock.calls.length,
    rechecks: vi.mocked(api.engineeringRechecks).mock.calls.length,
  };
  fireEvent.click(screen.getByRole("button", { name: "重试读取 Evidence" }));
  const link = await within(receipt).findByRole("button", {
    name: /结构梁标高变化/,
  });
  expect(link).toHaveAttribute("aria-pressed", "true");
  await waitFor(() =>
    expect(onEvidenceContext).toHaveBeenLastCalledWith(evidence),
  );
  expect(screen.queryByText("Evidence 读取失败")).toBeNull();
  expect(api.engineeringEvidence).toHaveBeenCalledTimes(2);
  expect(api.engineeringEvidence).toHaveBeenNthCalledWith(
    2,
    project,
    evidence.id,
  );
  expect(api.engineeringFindings).toHaveBeenCalledTimes(calls.findings);
  expect(api.engineeringFinding).toHaveBeenCalledTimes(calls.finding);
  expect(api.engineeringCoordination).toHaveBeenCalledTimes(calls.coordination);
  expect(api.engineeringRechecks).toHaveBeenCalledTimes(calls.rechecks);
  expect(api.engineeringDecision).not.toHaveBeenCalled();
});

it("searches opaque Finding IDs locally in Work and keeps the exact Evidence selection through filtering", async () => {
  const { client, onEvidenceContext } = mountWork();
  const receipt = await screen.findByRole("region", { name: "Finding 详情" });
  await within(receipt).findByRole("button", { name: /结构梁标高变化/ });
  await waitFor(() => expect(client.isFetching()).toBe(0));
  const work = screen.getByRole("complementary", { name: "工作与审核" });
  const search = within(work).getByRole("textbox", { name: "搜索工作" });
  fireEvent.change(search, {
    target: { value: `  ${finding.id.toUpperCase()}  ` },
  });
  expect(
    work.querySelectorAll(".workspace-list > .workspace-row[aria-pressed]"),
  ).toHaveLength(1);
  const selected = within(work).getByRole("button", {
    name: new RegExp(finding.title),
  });
  expect(selected).toHaveAttribute("aria-pressed", "true");
  fireEvent.click(selected);
  expect(
    within(receipt).getByRole("button", { name: /结构梁标高变化/ }),
  ).toHaveAttribute("aria-pressed", "true");
  expect(onEvidenceContext).toHaveBeenLastCalledWith(evidence);
  fireEvent.change(search, { target: { value: finding.title } });
  expect(
    within(work).getByRole("button", { name: new RegExp(finding.title) }),
  ).toHaveAttribute("aria-pressed", "true");
  expect(api.engineeringFindings).toHaveBeenCalledTimes(1);
  expect(api.engineeringFinding).toHaveBeenCalledExactlyOnceWith(
    project,
    finding.id,
  );
  expect(api.engineeringEvidence).toHaveBeenCalledExactlyOnceWith(
    project,
    evidence.id,
  );
  expect(api.engineeringDecision).not.toHaveBeenCalled();
});
