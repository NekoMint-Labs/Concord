import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import fixture from "../../tests/fixtures/inspector.json";
import {
  api,
  type DTO,
  type ProjectSourceStatus,
  type Workspace,
} from "../api/client";
import { ProjectExplorer, type ExplorerTarget } from "./ProjectExplorer";
import type { ComponentProps } from "react";
import { Manager, Table } from "@thatopen/ui";

// The app registers donors in main.tsx; this scoped suite doesn't import main.
Manager.init();

function tableRoots(scope: ParentNode = window.document.body): ShadowRoot[] {
  return Array.from(scope.querySelectorAll("*")).flatMap((element) =>
    element.shadowRoot
      ? [element.shadowRoot, ...tableRoots(element.shadowRoot)]
      : [],
  );
}

function tableText(text: string, scope: ParentNode = window.document.body) {
  return (
    tableRoots(scope).flatMap((root) =>
      within(root as unknown as HTMLElement).queryAllByText(text),
    )[0] ?? null
  );
}

function tableButton(
  name: string | RegExp,
  scope: ParentNode = window.document.body,
) {
  const button = tableRoots(scope).flatMap((root) =>
    within(root as unknown as HTMLElement).queryAllByRole("button", { name }),
  )[0];
  expect(button).toBeDefined();
  return button;
}

function filterTab(name: string) {
  const selector = window.document.querySelector("bim-selector")!;
  return within(selector.shadowRoot as unknown as HTMLElement).getByRole(
    "tab",
    { name },
  );
}

function searchBox() {
  const input = window.document.querySelector("bim-text-input")!;
  return input.shadowRoot?.querySelector<HTMLInputElement>("input")!;
}

function tables(scope: ParentNode = window.document.body) {
  return Array.from(scope.querySelectorAll<Table>("bim-table"));
}

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
const categories = [
  ["资料", 3],
  ["工作包", 1],
  ["文档", 1],
  ["版本与比较", 6],
  ["判断依据", 1],
  ["基线与历史", 1],
] as const;

beforeEach(() => {
  // jsdom has no viewport intersection; render real donor cells as visible.
  vi.stubGlobal(
    "IntersectionObserver",
    class {
      constructor(private callback: IntersectionObserverCallback) {}
      observe(target: Element) {
        this.callback(
          [{ target, isIntersecting: true } as IntersectionObserverEntry],
          this as unknown as IntersectionObserver,
        );
      }
      unobserve() {}
      disconnect() {}
    },
  );
  vi.spyOn(api, "sourceStatuses").mockResolvedValue(sources);
  vi.spyOn(api, "documents").mockResolvedValue([document]);
  vi.spyOn(api, "baselines").mockResolvedValue([baseline]);
  vi.spyOn(api, "sourceRevisions").mockImplementation(
    async (_project, source) =>
      revisions.filter((revision) => revision.source_id === source),
  );
  vi.spyOn(api, "comparisons").mockImplementation(async (_project, source) =>
    source === comparison.source_id ? [comparison] : [],
  );
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

function mountExplorer(
  preview: Pick<
    ComponentProps<typeof ProjectExplorer>,
    "previewEntries" | "onPreviewEnabled" | "findingEntries"
  > = {},
) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  const onOpen = vi.fn<(target: ExplorerTarget) => void>();
  const onTab = vi.fn();
  render(
    <QueryClientProvider client={client}>
      <ProjectExplorer
        workspace={workspace}
        sources={sources}
        onOpen={onOpen}
        onTab={onTab}
        {...preview}
      />
    </QueryClientProvider>,
  );
  return { onOpen, onTab };
}

async function loaded() {
  await waitFor(() => {
    expect(searchBox()).toHaveAttribute("aria-label", "搜索项目对象");
    expect(searchBox()).toHaveAttribute("type", "search");
  });
  fireEvent.input(searchBox(), {
    target: { value: "r" },
  });
  await screen.findByText("13 个对象匹配「r」");
  const versions = screen.getByRole("region", { name: "版本与比较" });
  await waitFor(() =>
    expect(tableText("West tower HVAC · R9", versions)).toBeVisible(),
  );
}

it("loads project API records into all six categories and filters each category", async () => {
  mountExplorer();
  expect(
    screen.getByRole("navigation", { name: "浏览对象类型" }),
  ).toBeVisible();
  expect(tables().length).toBeGreaterThan(0);
  await screen.findByText("13 个项目对象");
  await loaded();
  expect(api.documents).toHaveBeenCalledWith(project);
  expect(api.baselines).toHaveBeenCalledWith(project);
  for (const { source } of sources) {
    expect(api.sourceRevisions).toHaveBeenCalledWith(project, source.id);
  }
  expect(vi.mocked(api.comparisons).mock.calls).toEqual([
    [project, "src-hvac"],
    [project, "src-frame"],
  ]);
  const groups = new Map(
    categories.map(
      ([name]) => [name, screen.getByRole("region", { name })] as const,
    ),
  );
  expect(tableText("Permit notes.md", groups.get("文档"))).toBeVisible();
  expect(
    tableText("West tower HVAC · R9", groups.get("版本与比较")),
  ).toBeVisible();
  expect(
    tableText("East tower structure · R2 → R3", groups.get("版本与比较")),
  ).toBeVisible();
  expect(
    tableText("Duct clearance measured at 420 mm", groups.get("判断依据")),
  ).toBeVisible();
  expect(
    tableText("B7 · Handover approval", groups.get("基线与历史")),
  ).toBeVisible();

  for (const [category, count] of categories) {
    const table = tables(groups.get(category)!)[0];
    expect(table.data).toHaveLength(count);
    await table.updateComplete;
    const root = table.shadowRoot!;
    await waitFor(
      () =>
        expect(
          [root, ...tableRoots(root)].flatMap((root) =>
            Array.from(root.querySelectorAll("bim-table-row:not([is-header])")),
          ),
        ).toHaveLength(count),
      { container: root as unknown as HTMLElement },
    );
  }
  for (const [category, count] of categories) {
    fireEvent.click(filterTab(category));
    await waitFor(() =>
      expect(filterTab(category)).toHaveAttribute("aria-selected", "true"),
    );
    expect(screen.getByText(`${count} 个对象匹配「r」`)).toBeVisible();
    expect(screen.getByRole("region", { name: category })).toBeVisible();
    // Assert the entire retained group set, not six repeated global role scans.
    expect(
      Array.from(window.document.querySelectorAll(".explorer-group"), (group) =>
        group.getAttribute("aria-label"),
      ),
    ).toEqual([category]);
  }
  fireEvent.click(filterTab("全部"));
  await loaded();
  for (const [category] of categories) {
    expect(screen.getByRole("region", { name: category })).toBeVisible();
  }
});

it("opens exact source, revision, comparison, package, document, evidence and baseline identities", async () => {
  const { onOpen, onTab } = mountExplorer();
  await loaded();
  const action = tableButton("打开 Safety brief");
  expect(action.tagName).toBe("BIM-BUTTON");
  expect(action).toHaveAttribute("role", "button");
  expect(action.constructor).toBe(customElements.get("bim-button"));
  expect(action.tabIndex).toBe(0);
  action.focus();
  expect(action.getRootNode()).toHaveProperty("activeElement", action);
  for (const table of tables()) {
    expect(table).toBeInstanceOf(Table);
    expect(table.shadowRoot).not.toBeNull();
    expect(table.children).toHaveLength(0);
    expect(table.selectableRows).toBe(false);
    expect(table.queryString).toBeNull();
    expect(table.columns.map((column) => column.name)).toEqual([
      "名称",
      "类型",
      "记录",
      "状态",
      "操作",
      "编号",
    ]);
    expect(table.hiddenColumns).toEqual(["编号"]);
  }
  const cases: [string, RegExp, ExplorerTarget][] = [
    ["资料", /^打开 Safety brief$/, { kind: "source", id: "src-brief" }],
    ["资料", /^打开 West tower HVAC$/, { kind: "source", id: "src-hvac" }],
    [
      "版本与比较",
      /^打开 Safety brief · R1$/,
      { kind: "source", id: "src-brief", revisionId: "rev-brief-1" },
    ],
    [
      "版本与比较",
      /^打开 West tower HVAC · R9$/,
      { kind: "source", id: "src-hvac", revisionId: "rev-hvac-9" },
    ],
    [
      "版本与比较",
      /^打开 East tower structure · R2 → R3$/,
      { kind: "source", id: "src-frame", comparisonId: "cmp-frame" },
    ],
    [
      "工作包",
      /^打开 West tower duct installation$/,
      { kind: "package", id: "pkg-west" },
    ],
    ["文档", /^打开 Permit notes\.md$/, { kind: "document", id: "doc-permit" }],
    [
      "判断依据",
      /^打开 Duct clearance measured at 420 mm$/,
      { kind: "evidence", id: "ev-clearance" },
    ],
    [
      "基线与历史",
      /^打开 B7 · Handover approval$/,
      { kind: "baseline", id: "baseline-handover" },
    ],
  ];
  for (const [category, name] of cases) {
    fireEvent.click(
      tableButton(name, screen.getByRole("region", { name: category })),
    );
  }
  expect(onOpen.mock.calls).toEqual(cases.map(([, , target]) => [target]));
  expect(onTab).not.toHaveBeenCalled();
});

it("searches existing titles, metadata and IDs case-insensitively within the selected category", async () => {
  mountExplorer();
  await loaded();
  const search = searchBox();
  const cases = [
    ["资料", "  SAFETY BRIEF  ", "Safety brief"],
    ["资料", "SRC-HVAC", "West tower HVAC"],
    ["工作包", "PKG-WEST", "West tower duct installation"],
    ["文档", "LIGHTWEIGHT", "Permit notes.md"],
    ["文档", "DOC-PERMIT", "Permit notes.md"],
    ["版本与比较", "HVAC-CURRENT.IFC", "West tower HVAC · R9"],
    ["版本与比较", "REV-BRIEF-1", "Safety brief · R1"],
    ["版本与比较", "CMP-FRAME", "East tower structure · R2 → R3"],
    ["判断依据", "CLEARANCE-SURVEY", "Duct clearance measured at 420 mm"],
    ["判断依据", "EV-CLEARANCE", "Duct clearance measured at 420 mm"],
    ["基线与历史", "ENGINEER LIN", "B7 · Handover approval"],
    ["基线与历史", "BASELINE-HANDOVER", "B7 · Handover approval"],
  ];
  for (const [category, keyword, title] of cases) {
    fireEvent.click(filterTab(category));
    fireEvent.input(search, { target: { value: keyword } });
    expect(screen.getByText(`1 个对象匹配「${keyword.trim()}」`)).toBeVisible();
    const group = screen.getByRole("region", { name: category });
    expect(tables(group)[0].data).toHaveLength(1);
    await waitFor(() => expect(tableText(title, group)).toBeVisible());
  }
  // Local inventory search must not refetch records or invoke a search endpoint.
  expect(api.documents).toHaveBeenCalledTimes(1);
  expect(api.baselines).toHaveBeenCalledTimes(1);
  expect(api.sourceRevisions).toHaveBeenCalledTimes(3);
  expect(api.comparisons).toHaveBeenCalledTimes(2);
});

it("combines keyword and category filters, then clears both after no results", async () => {
  mountExplorer();
  await loaded();
  const search = searchBox();
  fireEvent.input(search, { target: { value: "  pErMiT  " } });
  expect(screen.getByText("1 个对象匹配「pErMiT」")).toBeVisible();
  // Matching objects stay above the fold instead of following empty categories.
  expect(
    screen.queryByRole("region", { name: "资料" }),
  ).not.toBeInTheDocument();
  expect(screen.getByRole("region", { name: "文档" })).toBeVisible();
  expect(tableText("Permit notes.md")).toBeVisible();
  fireEvent.click(filterTab("工作包"));
  expect(screen.getByText("0 个对象匹配「pErMiT」")).toBeVisible();
  expect(
    screen.getByRole("heading", { name: "没有匹配的项目对象" }),
  ).toBeVisible();
  expect(tableText("Permit notes.md")).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "清除搜索与筛选" }));
  await waitFor(() => expect(search).toHaveValue(""));
  expect(
    screen.getByRole("navigation", { name: "浏览对象类型" }),
  ).toBeVisible();
  expect(
    screen.queryByRole("heading", { name: "没有匹配的项目对象" }),
  ).not.toBeInTheDocument();
  expect(tables()).toHaveLength(categories.length);
  await waitFor(() =>
    expect(filterTab("全部")).toHaveAttribute("aria-selected", "true"),
  );
  for (const [category, count] of categories)
    expect(
      tables(screen.getByRole("region", { name: category }))[0].data,
    ).toHaveLength(count);
});

it.each(["documents", "baselines", "sourceRevisions", "comparisons"] as const)(
  "recovers a failed %s query without discarding other records or filters",
  async (request) => {
    if (request === "comparisons") {
      // Fail the second model's populated query, not the first model's empty list.
      vi.mocked(api.comparisons).mockResolvedValueOnce([]);
    }
    vi.mocked(api[request]).mockRejectedValueOnce(new Error("Offline"));
    mountExplorer();
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "搜索结果可能不完整",
    );
    const search = searchBox();
    fireEvent.input(search, { target: { value: "r" } });
    // useProjectContext starts the shared HVAC revision query first (two rows).
    await screen.findByText(
      `${request === "sourceRevisions" ? 11 : 12} 个对象匹配「r」`,
    );
    const missingTitle = {
      documents: "Permit notes.md",
      baselines: "B7 · Handover approval",
      sourceRevisions: "West tower HVAC · R9",
      comparisons: "East tower structure · R2 → R3",
    }[request];
    expect(tableText(missingTitle)).not.toBeInTheDocument();
    await waitFor(() =>
      expect(tableText("West tower duct installation")).toBeVisible(),
    );
    await waitFor(() =>
      expect(tableText("Duct clearance measured at 420 mm")).toBeVisible(),
    );
    fireEvent.input(search, { target: { value: "duct" } });
    fireEvent.click(filterTab("工作包"));
    const callsBefore = {
      documents: vi.mocked(api.documents).mock.calls.length,
      baselines: vi.mocked(api.baselines).mock.calls.length,
      sourceRevisions: vi.mocked(api.sourceRevisions).mock.calls.length,
      comparisons: vi.mocked(api.comparisons).mock.calls.length,
    };
    fireEvent.click(screen.getByRole("button", { name: "重试读取" }));
    await waitFor(() =>
      expect(screen.queryByRole("alert")).not.toBeInTheDocument(),
    );
    for (const method of Object.keys(
      callsBefore,
    ) as (keyof typeof callsBefore)[]) {
      expect(api[method]).toHaveBeenCalledTimes(
        callsBefore[method] + Number(method === request),
      );
    }
    expect(search).toHaveValue("duct");
    await waitFor(() =>
      expect(filterTab("工作包")).toHaveAttribute("aria-selected", "true"),
    );
    expect(screen.getByText("1 个对象匹配「duct」")).toBeVisible();
    fireEvent.input(search, { target: { value: "" } });
    expect(tables()).toHaveLength(categories.length);
    await loaded();
    await waitFor(() =>
      expect(filterTab("全部")).toHaveAttribute("aria-selected", "true"),
    );
    expect(tableText("Permit notes.md")).toBeVisible();
    expect(tableText("Safety brief · R1")).toBeVisible();
    expect(tableText("West tower HVAC · R9")).toBeVisible();
    expect(tableText("East tower structure · R2 → R3")).toBeVisible();
    expect(tableText("B7 · Handover approval")).toBeVisible();
  },
);

it("only exposes fixture targets after explicit opt-in and keeps them in a separate group", async () => {
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
        search: "fixture-only",
      },
    ],
  });
  expect(
    screen.getByRole("checkbox", { name: "包含 Finding 交互示例" }),
  ).toBeChecked();
  await waitFor(() => expect(searchBox()).toBeDefined());
  fireEvent.input(searchBox(), {
    target: { value: "fixture-only" },
  });
  const result = await waitFor(() => tableButton("打开 B-142 × M-038 碰撞"));
  expect(screen.getByRole("region", { name: "交互示例" })).toBeVisible();
  fireEvent.click(result);
  expect(onOpen).toHaveBeenCalledWith({
    kind: "fixture-evidence",
    id: "clash",
  });
  fireEvent.click(
    screen.getByRole("checkbox", { name: "包含 Finding 交互示例" }),
  );
  expect(onPreviewEnabled).toHaveBeenCalledWith(false);
});

it("leads with canonical engineering metadata while opaque Evidence IDs stay searchable and navigation exact", async () => {
  const evidence = {
    id: "opaque-evidence-uuid",
    snapshot_id: "snapshot-x",
    source_id: "src-frame",
    source_revision_id: "rev-frame-3",
    source_revision: "hash-x",
    provider: "internal-provider",
    observed_at: timestamp,
    fact: "结构梁标高变化",
    quality: "structured",
    element_ids: [],
    work_package_id: null,
    page: null,
    location: null,
    viewer_target: {
      kind: "drawing",
      source_revision_id: "rev-frame-3",
      page: 3,
      normalized_bbox: [0.1, 0.2, 0.3, 0.4],
    },
  } satisfies DTO<"Evidence">;
  vi.spyOn(api, "engineeringEvidence").mockResolvedValue(evidence);
  const { onOpen } = mountExplorer({
    findingEntries: [
      {
        target: {
          kind: "finding",
          id: "opaque-finding",
          evidenceId: evidence.id,
        },
        title: "工程依据",
        type: "工程依据",
        meta: "梁调整需要复核",
        search: evidence.id,
      },
    ],
  });
  const row = await waitFor(() => tableButton("打开 结构梁标高变化"));
  await waitFor(() =>
    expect(tableText("图纸 · 第 3 页 · 已提供区域")).toBeVisible(),
  );
  await waitFor(() => expect(tableText("结构化 · 已验证")).toBeVisible());
  expect(row).not.toHaveTextContent(evidence.id);
  expect(row).not.toHaveTextContent(evidence.provider);
  const title = tableText("结构梁标高变化")!;
  const details = title.parentElement!.querySelector("details")!;
  expect(details.open).toBe(false);
  expect(details).toHaveTextContent(evidence.id);
  fireEvent.input(searchBox(), {
    target: { value: evidence.id },
  });
  await waitFor(() => expect(tableButton("打开 结构梁标高变化")).toBeVisible());
  fireEvent.click(tableButton("打开 结构梁标高变化"));
  expect(onOpen).toHaveBeenCalledWith({
    kind: "finding",
    id: "opaque-finding",
    evidenceId: evidence.id,
  });
  expect(api.engineeringEvidence).toHaveBeenCalledWith(project, evidence.id);
});

it("keeps Open bound to the exact target when search removes and reorders visible rows", async () => {
  const { onOpen } = mountExplorer();
  await loaded();
  const search = searchBox();
  fireEvent.input(search, { target: { value: "SRC-HVAC" } });
  fireEvent.click(await waitFor(() => tableButton("打开 West tower HVAC")));
  expect(onOpen).toHaveBeenLastCalledWith({ kind: "source", id: "src-hvac" });
  fireEvent.input(search, { target: { value: "REV-FRAME-3" } });
  fireEvent.click(
    await waitFor(() => tableButton("打开 East tower structure · R3")),
  );
  expect(onOpen).toHaveBeenLastCalledWith({
    kind: "source",
    id: "src-frame",
    revisionId: "rev-frame-3",
  });
  expect(api.sourceRevisions).toHaveBeenCalledTimes(3);
});

it.each(["identity", "project"] as const)(
  "does not present canonical evidence crossing the %s fence",
  async (fence) => {
    const fencedEvidence = {
      id: fence === "identity" ? "wrong-evidence" : "requested-evidence",
      project_id: fence === "project" ? "other-project" : project,
      snapshot_id: "snapshot-x",
      source_id: "src-frame",
      source_revision_id: "rev-frame-3",
      source_revision: "hash-x",
      provider: "internal-provider",
      observed_at: timestamp,
      fact: "Must not leak across the evidence fence",
      quality: "structured",
      element_ids: [],
      work_package_id: null,
      page: null,
      location: null,
      viewer_target: null,
    } satisfies DTO<"Evidence"> & { project_id: string };
    vi.spyOn(api, "engineeringEvidence").mockResolvedValue(fencedEvidence);
    const { onOpen } = mountExplorer({
      findingEntries: [
        {
          target: {
            kind: "finding",
            id: "finding-x",
            evidenceId: "requested-evidence",
          },
          title: "Original engineering entry",
          type: "工程依据",
          meta: "Awaiting authoritative evidence",
          search: "requested-evidence",
        },
      ],
    });
    await waitFor(() =>
      expect(screen.queryByText("正在读取项目记录…")).not.toBeInTheDocument(),
    );
    expect(api.engineeringEvidence).toHaveBeenCalledWith(
      project,
      "requested-evidence",
    );
    expect(tableText("Must not leak across the evidence fence")).toBeNull();
    fireEvent.click(
      await waitFor(() => tableButton("打开 Original engineering entry")),
    );
    expect(onOpen).toHaveBeenCalledWith({
      kind: "finding",
      id: "finding-x",
      evidenceId: "requested-evidence",
    });
  },
);

it("keeps category filtering on the donor selector's roving keyboard implementation", async () => {
  mountExplorer();
  await loaded();
  const first = filterTab("全部");
  expect(first).toHaveAttribute("aria-selected", "true");
  expect(first).toHaveAttribute("tabindex", "0");
  fireEvent.keyDown(first, { key: "ArrowRight" });
  await waitFor(() =>
    expect(filterTab("资料")).toHaveAttribute("aria-selected", "true"),
  );
  await waitFor(() =>
    expect(
      window.document.querySelector("bim-selector")!.shadowRoot!.activeElement,
    ).toBe(filterTab("资料")),
  );
  expect(screen.getByRole("region", { name: "资料" })).toBeVisible();
  expect(screen.queryByRole("region", { name: "文档" })).toBeNull();
  fireEvent.keyDown(filterTab("资料"), { key: "Home" });
  await waitFor(() =>
    expect(filterTab("全部")).toHaveAttribute("aria-selected", "true"),
  );
  await waitFor(() =>
    expect(
      window.document.querySelector("bim-selector")!.shadowRoot!.activeElement,
    ).toBe(filterTab("全部")),
  );
  for (const [category] of categories)
    expect(screen.getByRole("region", { name: category })).toBeVisible();
});
