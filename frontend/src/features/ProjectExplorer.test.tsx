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
afterEach(() => vi.restoreAllMocks());

function mountExplorer() {
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
      />
    </QueryClientProvider>,
  );
  return { onOpen, onTab };
}

async function loaded() {
  fireEvent.change(screen.getByRole("searchbox", { name: "搜索项目对象" }), {
    target: { value: "r" },
  });
  await screen.findByText("13 个对象匹配「r」");
}

it("loads project API records into all six categories and filters each category", async () => {
  mountExplorer();
  expect(screen.queryByRole("navigation", { name: "浏览对象类型" })).toBeNull();
  expect(screen.queryByRole("list")).toBeNull();
  expect(screen.queryByText(/个对象/)).toBeNull();
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
  expect(screen.getByText("Permit notes.md")).toBeVisible();
  expect(screen.getByText("West tower HVAC · R9")).toBeVisible();
  expect(screen.getByText("East tower structure · R2 → R3")).toBeVisible();
  expect(screen.getByText("Duct clearance measured at 420 mm")).toBeVisible();
  expect(screen.getByText("B7 · Handover approval")).toBeVisible();

  for (const [category, count] of categories) {
    const group = screen.getByRole("region", { name: category });
    expect(within(group).getAllByRole("listitem")).toHaveLength(count);
  }
  for (const [category, count] of categories) {
    fireEvent.click(screen.getByRole("button", { name: category }));
    expect(screen.getByRole("button", { name: category })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(screen.getByText(`${count} 个对象匹配「r」`)).toBeVisible();
    for (const [other] of categories) {
      expect(Boolean(screen.queryByRole("region", { name: other }))).toBe(
        other === category,
      );
    }
  }
  fireEvent.click(screen.getByRole("button", { name: "全部" }));
  await loaded();
  for (const [category] of categories) {
    expect(screen.getByRole("region", { name: category })).toBeVisible();
  }
});

it("opens exact source, revision, comparison, package, document, evidence and baseline identities", async () => {
  const { onOpen, onTab } = mountExplorer();
  await loaded();
  const cases: [string, RegExp, ExplorerTarget][] = [
    ["资料", /^Safety brief /, { kind: "source", id: "src-brief" }],
    ["资料", /^West tower HVAC /, { kind: "source", id: "src-hvac" }],
    [
      "版本与比较",
      /^Safety brief · R1 /,
      { kind: "source", id: "src-brief", revisionId: "rev-brief-1" },
    ],
    [
      "版本与比较",
      /^West tower HVAC · R9 /,
      { kind: "source", id: "src-hvac", revisionId: "rev-hvac-9" },
    ],
    [
      "版本与比较",
      /^East tower structure · R2 → R3 /,
      { kind: "source", id: "src-frame", comparisonId: "cmp-frame" },
    ],
    [
      "工作包",
      /^West tower duct installation /,
      { kind: "package", id: "pkg-west" },
    ],
    ["文档", /^Permit notes\.md /, { kind: "document", id: "doc-permit" }],
    [
      "判断依据",
      /^Duct clearance measured at 420 mm /,
      { kind: "evidence", id: "ev-clearance" },
    ],
    [
      "基线与历史",
      /^B7 · Handover approval /,
      { kind: "baseline", id: "baseline-handover" },
    ],
  ];
  for (const [category, name] of cases) {
    fireEvent.click(
      within(screen.getByRole("region", { name: category })).getByRole(
        "button",
        { name },
      ),
    );
  }
  expect(onOpen.mock.calls).toEqual(cases.map(([, , target]) => [target]));
  expect(onTab).not.toHaveBeenCalled();
});

it("searches existing titles, metadata and IDs case-insensitively within the selected category", async () => {
  mountExplorer();
  await loaded();
  const search = screen.getByRole("searchbox", { name: "搜索项目对象" });
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
    fireEvent.click(screen.getByRole("button", { name: category }));
    fireEvent.change(search, { target: { value: keyword } });
    expect(screen.getByText(`1 个对象匹配「${keyword.trim()}」`)).toBeVisible();
    const group = screen.getByRole("region", { name: category });
    expect(within(group).getAllByRole("listitem")).toHaveLength(1);
    expect(within(group).getByText(title)).toBeVisible();
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
  const search = screen.getByRole("searchbox", { name: "搜索项目对象" });
  fireEvent.change(search, { target: { value: "  pErMiT  " } });
  expect(screen.getByText("1 个对象匹配「pErMiT」")).toBeVisible();
  // Matching objects stay above the fold instead of following empty categories.
  expect(
    screen.queryByRole("region", { name: "资料" }),
  ).not.toBeInTheDocument();
  expect(screen.getByRole("region", { name: "文档" })).toBeVisible();
  expect(screen.getByText("Permit notes.md")).toBeVisible();
  fireEvent.click(screen.getByRole("button", { name: "工作包" }));
  expect(screen.getByText("0 个对象匹配「pErMiT」")).toBeVisible();
  expect(
    screen.getByRole("heading", { name: "没有匹配的项目对象" }),
  ).toBeVisible();
  expect(screen.queryByText("Permit notes.md")).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "清除搜索与筛选" }));
  expect(search).toHaveValue("");
  expect(screen.queryByRole("navigation", { name: "浏览对象类型" })).toBeNull();
  expect(
    screen.queryByRole("heading", { name: "没有匹配的项目对象" }),
  ).not.toBeInTheDocument();
  expect(screen.queryByRole("list")).toBeNull();
  expect(screen.queryByRole("navigation", { name: "浏览对象类型" })).toBeNull();
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
      "部分项目记录读取失败，搜索结果可能不完整。",
    );
    const search = screen.getByRole("searchbox", { name: "搜索项目对象" });
    fireEvent.change(search, { target: { value: "r" } });
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
    expect(screen.queryByText(missingTitle)).not.toBeInTheDocument();
    expect(screen.getByText("West tower duct installation")).toBeVisible();
    expect(screen.getByText("Duct clearance measured at 420 mm")).toBeVisible();
    fireEvent.change(search, { target: { value: "duct" } });
    fireEvent.click(screen.getByRole("button", { name: "工作包" }));
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
    expect(screen.getByRole("button", { name: "工作包" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(screen.getByText("1 个对象匹配「duct」")).toBeVisible();
    fireEvent.change(search, { target: { value: "" } });
    expect(screen.queryByRole("list")).toBeNull();
    await loaded();
    expect(screen.getByRole("button", { name: "全部" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(screen.getByText("Permit notes.md")).toBeVisible();
    expect(screen.getByText("Safety brief · R1")).toBeVisible();
    expect(screen.getByText("West tower HVAC · R9")).toBeVisible();
    expect(screen.getByText("East tower structure · R2 → R3")).toBeVisible();
    expect(screen.getByText("B7 · Handover approval")).toBeVisible();
  },
);
