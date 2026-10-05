import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { useState, useRef, type ReactNode } from "react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { api, APIError, type DTO, type Workspace } from "../api/client";
import { useWorkspaceLayout } from "../layout/WorkspaceLayout";
import { FindingWorkbench } from "./FindingWorkbench";
import { engineeringKeys } from "./useEngineeringFindings";

vi.mock("../layout/PaneSplit", () => ({
  PaneSplit: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  Pane: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  PaneDivider: () => null,
  usePanelRef: () => ({ current: { resize() {} } }),
}));

const timestamp = "2026-01-01T00:00:00Z";
const makeFinding = (
  id = "finding/opaque-73",
  project = "project-a",
): DTO<"Finding"> => ({
  id,
  project_id: project,
  state: "PROPOSED",
  snapshot_id: "snapshot-2",
  work_package_id: "work-4",
  title: `Clearance conflict ${id}`,
  conclusion: "Measured clearance conflict",
  what_changed: "Duct moved in R2",
  why_it_matters: "Clearance below design requirement",
  evidence_ids: ["geometry", "text", "inference"],
  reasoning_summary: "Compare engineering sources",
  confidence: 0.9,
  limitations: ["Requires engineer review"],
  created_at: timestamp,
  updated_at: timestamp,
  impact: null,
  change_ids: ["change-2"],
  dependencies: [
    {
      source_id: "source-model",
      source_revision_id: "r2",
      capability: "clash",
      expected_condition: "No clash",
      target: {
        kind: "bim",
        source_revision_id: "r2",
        global_ids: ["beam-142", "duct-38"],
      },
    },
  ],
  suggested_action: "Coordinate duct route",
  suggested_discipline: "MEP",
});
const makeEvidence = (id: string): DTO<"Evidence"> => ({
  id,
  snapshot_id: "snapshot-2",
  provider: id === "inference" ? "reasoning" : "detector",
  source_id: "source-model",
  source_revision: "sha256-exact",
  source_revision_id: "r2",
  observed_at: timestamp,
  work_package_id: "work-4",
  element_ids: ["beam-142"],
  page: null,
  location: null,
  fact:
    {
      geometry: "Beam and duct intersect",
      text: "Design change requires clearance",
      inference: "Suggested reroute",
    }[id] ?? `Engineering result ${id}`,
  quality:
    id === "text"
      ? "extracted"
      : id === "inference"
        ? "inferred"
        : "structured",
  viewer_target:
    id === "text"
      ? {
          kind: "document",
          source_revision_id: "r2",
          page: 2,
          structural_path: ["Design change", "Clearance"],
        }
      : id === "inference"
        ? {
            kind: "bim",
            source_revision_id: "r2",
            global_ids: ["beam-142", "duct-38"],
          }
        : {
            kind: "drawing",
            source_revision_id: "r2",
            page: 5,
            normalized_bbox: [0.32, 0.28, 0.62, 0.52],
          },
});
const source: DTO<"ProjectSourceStatus"> = {
  source: {
    id: "source-model",
    project_id: "project-a",
    name: "MEP",
    kind: "BIM",
    created_at: timestamp,
  },
  latest_revision_id: "r2",
  accepted_revision_id: "r1",
  baseline_id: null,
  has_pending_revision: true,
};
const makeCheck = (outcome: DTO<"ReCheck">["outcome"] = null) => {
  const check = {
    id: "check-1",
    project_id: "project-a",
    finding_id: "finding/opaque-73",
    source_id: "source-model",
    source_revision_id: "r2",
    dependencies: makeFinding().dependencies,
    finding_updated_at: timestamp,
    request_id: "operation-1",
    outcome,
    evidence_ids: outcome ? ["recheck-evidence"] : [],
    explanation: "Engineering capability result, not an AI resolution",
    created_at: timestamp,
    completed_at: outcome ? timestamp : null,
    inputs: [],
    ids_requirements: null,
  };
  return check satisfies DTO<"ReCheck">;
};
const makeRun = (
  status: DTO<"AgentRun">["status"] = "COMPLETED",
): DTO<"AgentRun"> => ({
  id: "check-1",
  project_id: "project-a",
  category: "engineering_recheck",
  event_id: null,
  status,
  runtime: "dbos",
  runtime_execution_id: null,
  generation: 1,
  runtime_generation: 1,
  analysis_id: null,
  error: null,
  created_at: timestamp,
  updated_at: timestamp,
});
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((yes) => {
    resolve = yes;
  });
  return { promise, resolve };
}
let findings: DTO<"Finding">[];
let history: DTO<"Coordination">[];
let checks: DTO<"ReCheck">[];
const caches: QueryClient[] = [];
beforeEach(() => {
  findings = [makeFinding(), makeFinding("finding-other")];
  history = [];
  checks = [];
  vi.spyOn(api, "engineeringFindings").mockImplementation(async (project) =>
    findings.filter((item) => item.project_id === project),
  );
  vi.spyOn(api, "engineeringFinding").mockImplementation(
    async (project, id) => {
      const finding = findings.find(
        (item) => item.id === id && item.project_id === project,
      );
      if (!finding) throw new APIError(404, "Finding unavailable");
      return finding;
    },
  );
  vi.spyOn(api, "engineeringEvidence").mockImplementation(
    async (_project, id) => makeEvidence(id),
  );
  vi.spyOn(api, "engineeringCoordination").mockImplementation(async () => [
    ...history,
  ]);
  vi.spyOn(api, "engineeringRechecks").mockImplementation(async () => [
    ...checks,
  ]);
  vi.spyOn(api, "run").mockResolvedValue(makeRun());
  vi.spyOn(api, "sourceRevisions").mockResolvedValue([]);
  vi.spyOn(api, "comparisons").mockResolvedValue([]);
  vi.spyOn(api, "requestEngineeringRechecks").mockResolvedValue([]);
  vi.spyOn(api, "engineeringDecision").mockImplementation(
    async (project, id, input) => {
      const old = findings.find((item) => item.id === id)!;
      const state =
        input.decision === "REOPENED"
          ? "PROPOSED"
          : input.decision === "EDITED"
            ? old.state
            : input.decision;
      const next = {
        ...old,
        state,
        title: input.title ?? old.title,
        suggested_action: input.suggested_action ?? old.suggested_action,
      };
      findings = findings.map((item) => (item.id === id ? next : item));
      history.push({
        id: `decision-${history.length}`,
        project_id: project,
        finding_id: id,
        actor: "engineer@example.com",
        decision: input.decision,
        note: input.note ?? "",
        recheck_id: null,
        created_at: timestamp,
      });
      return next;
    },
  );
});
afterEach(() => {
  cleanup();
  caches.splice(0).forEach((cache) => cache.clear());
  localStorage.clear();
  vi.restoreAllMocks();
});
function setup({
  project = "project-a",
  selectedId = "finding/opaque-73",
  sources = [source],
}: {
  project?: string;
  selectedId?: string;
  sources?: DTO<"ProjectSourceStatus">[];
} = {}) {
  const cache = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: Infinity } },
  });
  caches.push(cache);
  const onSelect = vi.fn();
  const work = (project: string) => ({
    workspace: {
      state: {
        project: { id: project, name: "Project" },
        work_packages: [],
        areas: [],
      },
      analysis: null,
      events: [],
      proposals: [],
      audit: [],
      stale: false,
      analysis_run: null,
      run: null,
    } as unknown as Workspace,
    sources,
    onPackage: vi.fn(),
    onModels: vi.fn(),
    onRecheck: vi.fn(),
    onReport: vi.fn(),
    onProject: vi.fn(),
  });
  function Host({
    project,
    evidenceId,
  }: {
    project: string;
    evidenceId?: string;
  }) {
    const prefs = useWorkspaceLayout();
    const [id, setId] = useState(selectedId);
    const [open, setOpen] = useState(true);
    const workButtonRef = useRef<HTMLButtonElement>(null);
    return (
      <>
        {/* The header owns the Work toggle now; the panel only reports close. */}
        <button
          ref={workButtonRef}
          type="button"
          aria-expanded={open}
          onClick={() => setOpen(true)}
        >
          审核面板
        </button>
        <FindingWorkbench
          project={project}
          open={open}
          onClose={() => {
            setOpen(false);
            workButtonRef.current?.focus();
          }}
          selectedId={id}
          evidenceId={evidenceId}
          onSelect={(next) => {
            onSelect(next);
            setId(next);
          }}
          prefs={prefs}
          work={work(project)}
        />
      </>
    );
  }
  const tree = (project: string, evidenceId?: string) => (
    <QueryClientProvider client={cache}>
      <Host project={project} evidenceId={evidenceId} />
    </QueryClientProvider>
  );
  const view = render(tree(project));
  return {
    cache,
    onSelect,
    switchProject: (next: string) => view.rerender(tree(next)),
    openEvidence: (evidenceId: string) =>
      view.rerender(tree(project, evidenceId)),
  };
}
async function loaded() {
  return screen.findByRole("button", { name: /Beam and duct intersect/ });
}
function selectedState(state: DTO<"Finding">["state"]) {
  const inspector = screen.getByRole("region", {
    name: "Finding 详情",
    hidden: true,
  });
  expect(
    JSON.parse(
      within(inspector).getByLabelText("Exact Finding record").textContent!,
    ).state,
  ).toBe(state);
  const label = {
    PROPOSED: "待人工判断",
    CONFIRMED: "已确认",
    DISMISSED: "已忽略",
    CLOSED: "人工关闭",
  }[state];
  const status = within(inspector).getByRole("status", { hidden: true });
  expect(status).toHaveTextContent(label);
  expect(status).not.toHaveTextContent(state);
  return status;
}
function openDecision(label: string) {
  const trigger = screen.getByRole("button", { name: label });
  trigger.focus();
  fireEvent.click(trigger);
  return screen.getByRole("dialog", { name: `${label} Finding` });
}
function submit(dialog: HTMLElement, note = "Engineer verified sources") {
  fireEvent.change(within(dialog).getByRole("textbox", { name: "判断说明" }), {
    target: { value: note },
  });
  fireEvent.click(within(dialog).getByRole("button", { name: "提交人工判断" }));
}

it("loads the canonical list, selects opaque IDs, and fences detail/evidence on project switch", async () => {
  findings.push(makeFinding("finding-b", "project-b"));
  const { onSelect, switchProject } = setup({ selectedId: "", sources: [] });
  expect(screen.getByText("正在读取工程 Findings…")).toBeInTheDocument();
  fireEvent.click(
    await screen.findByRole("button", {
      name: /Clearance conflict finding-other/,
    }),
  );
  await loaded();
  expect(onSelect).toHaveBeenCalledWith("finding-other");
  expect(api.engineeringFinding).toHaveBeenCalledWith(
    "project-a",
    "finding-other",
  );
  expect(
    screen.getByRole("button", { name: /Clearance conflict finding-other/ }),
  ).toHaveAttribute("aria-pressed", "true");
  switchProject("project-b");
  expect(
    screen.queryByRole("region", { name: "Finding 详情" }),
  ).not.toBeInTheDocument();
  expect(
    screen.queryByRole("region", { name: /Drawing/ }),
  ).not.toBeInTheDocument();
  expect(await screen.findByText("工程判断已不在当前列表")).toBeInTheDocument();
  fireEvent.click(
    screen.getByRole("button", { name: /Clearance conflict finding-b/ }),
  );
  await loaded();
  expect(api.engineeringFinding).toHaveBeenCalledWith("project-b", "finding-b");
  expect(api.engineeringEvidence).toHaveBeenCalledWith("project-b", "geometry");
});

it("shows an empty project without manufacturing demo findings", async () => {
  findings = [];
  setup({ selectedId: "", sources: [] });
  expect(
    await screen.findByText(/当前项目尚无资料版本或工程判断/),
  ).toBeInTheDocument();
  expect(api.engineeringFinding).not.toHaveBeenCalled();
  expect(api.engineeringEvidence).not.toHaveBeenCalled();
});

it.each(["list", "detail", "evidence"] as const)(
  "exposes %s API errors and retries the actual read",
  async (kind) => {
    const failure = new APIError(503, `${kind} service unavailable`);
    if (kind === "list")
      vi.mocked(api.engineeringFindings).mockRejectedValueOnce(failure);
    if (kind === "detail")
      vi.mocked(api.engineeringFinding).mockRejectedValueOnce(failure);
    if (kind === "evidence")
      vi.mocked(api.engineeringEvidence).mockImplementation(
        async (_project, id) => {
          if (id === "geometry") throw failure;
          return makeEvidence(id);
        },
      );
    setup();
    const retryLabel = {
      list: "重试读取 Findings",
      detail: "重试详情",
      evidence: "重试读取 Evidence",
    }[kind];
    const retry = await screen.findByRole("button", { name: retryLabel });
    expect(
      screen
        .getAllByRole("alert")
        .some((alert) => alert.textContent?.includes(failure.message)),
    ).toBe(true);
    if (kind === "evidence") {
      expect(
        screen.getByRole("region", { name: "结构化与提取证据" }),
      ).not.toHaveTextContent("Beam and duct intersect");
      vi.mocked(api.engineeringEvidence).mockImplementation(
        async (_project, id) => makeEvidence(id),
      );
    }
    fireEvent.click(retry);
    await loaded();
    expect(
      screen.queryByRole("button", { name: retryLabel }),
    ).not.toBeInTheDocument();
  },
);

it("routes exact persisted targets and separates extracted/structured evidence from inference", async () => {
  setup();
  await loaded();
  const verified = screen.getByRole("region", { name: "结构化与提取证据" });
  const inferred = screen.getByRole("region", { name: "推断与 AI 建议" });
  expect(verified).toHaveTextContent("结构化 · 已验证");
  expect(verified).toHaveTextContent("提取 · 来源内容");
  expect(verified).not.toHaveTextContent("Suggested reroute");
  expect(inferred).toHaveTextContent("推断 · 未验证");
  expect(inferred).toHaveTextContent("AI 解释不会成为 Evidence 或人工决策");
  const drawing = screen.getByRole("region", {
    name: "Drawing · 图纸 workspace host",
  });
  expect(drawing).toHaveAttribute("data-source-revision-id", "r2");
  expect(drawing).toHaveTextContent("第 5 页");
  expect(drawing).toHaveTextContent("0.32 · 0.28 · 0.62 · 0.52");
  fireEvent.click(
    within(verified).getByRole("button", {
      name: /Design change requires clearance/,
    }),
  );
  expect(
    screen.getByRole("region", { name: "Document · 文档 workspace host" }),
  ).toHaveTextContent("Design change / Clearance");
  fireEvent.click(
    within(inferred).getByRole("button", { name: /Suggested reroute/ }),
  );
  const model = screen.getByRole("region", {
    name: "Model · 模型 workspace host",
  });
  expect(model).toHaveTextContent("beam-142 · duct-38");
  expect(model).toHaveTextContent("不是已验证工程事实");
  expect(
    JSON.parse(
      within(model).getByLabelText("Exact viewer target").textContent!,
    ),
  ).toEqual(makeEvidence("inference").viewer_target);
  expect(api.engineeringDecision).not.toHaveBeenCalled();
});

it("opens externally selected Evidence after a local selection in the same Finding", async () => {
  const view = setup();
  await loaded();
  fireEvent.click(screen.getByRole("button", { name: /Suggested reroute/ }));
  expect(
    screen.getByRole("region", { name: "Model · 模型 workspace host" }),
  ).toHaveAttribute("data-evidence-id", "inference");
  view.openEvidence("text");
  await waitFor(() =>
    expect(
      screen.getByRole("region", { name: "Document · 文档 workspace host" }),
    ).toHaveAttribute("data-evidence-id", "text"),
  );
});

it("retains evidence with a missing viewer target without inventing a location", async () => {
  vi.mocked(api.engineeringEvidence).mockImplementation(
    async (_project, id) => ({ ...makeEvidence(id), viewer_target: null }),
  );
  setup();
  await loaded();
  const host = screen.getByRole("region", {
    name: "Evidence · 证据 workspace host",
  });
  expect(host).toHaveAttribute("data-evidence-id", "geometry");
  expect(host).toHaveAttribute(
    "data-navigation-state",
    "missing_viewer_target",
  );
  expect(host).toHaveTextContent("不从旧版页码或位置推断目标");
});

it("requires explicit confirmation and keeps the proposed state until the server accepts", async () => {
  const pending = deferred<DTO<"Finding">>();
  vi.mocked(api.engineeringDecision).mockReturnValue(pending.promise);
  setup();
  await loaded();
  const dialog = openDecision("确认");
  expect(api.engineeringDecision).not.toHaveBeenCalled();
  fireEvent.click(within(dialog).getByRole("button", { name: "提交人工判断" }));
  await waitFor(() =>
    expect(api.engineeringDecision).toHaveBeenCalledWith(
      "project-a",
      "finding/opaque-73",
      { decision: "CONFIRMED", note: "" },
    ),
  );
  expect(selectedState("PROPOSED")).toBeInTheDocument();
  expect(screen.getByText("正在提交，请等待确认…")).toBeInTheDocument();
  expect(
    within(dialog).getByRole("button", { name: "正在提交…" }),
  ).toBeDisabled();
  await act(async () => {
    findings[0] = { ...findings[0], state: "CONFIRMED" };
    history.push({
      id: "human-1",
      project_id: "project-a",
      finding_id: findings[0].id,
      actor: "engineer@example.com",
      decision: "CONFIRMED",
      note: "Reviewed by engineer",
      recheck_id: null,
      created_at: timestamp,
    });
    pending.resolve(findings[0]);
  });
  await waitFor(() =>
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument(),
  );
  expect(selectedState("CONFIRMED")).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "协调 / 复核" }));
  const coordination = screen.getByRole("region", { name: "人工决策历史" });
  expect(coordination).toHaveTextContent("engineer@example.com");
  expect(coordination).toHaveTextContent("Reviewed by engineer");
  expect(coordination).toHaveTextContent("CONFIRMED");
});

it("validates dismissal, edit and reopen notes and renders only server-owned state", async () => {
  setup();
  await loaded();
  let dialog = openDecision("编辑");
  const save = within(dialog).getByRole("button", { name: "提交人工判断" });
  expect(save).toBeDisabled();
  fireEvent.change(within(dialog).getByRole("textbox", { name: "判断说明" }), {
    target: { value: "Edit after review" },
  });
  fireEvent.change(
    within(dialog).getByRole("textbox", { name: "Finding 标题" }),
    { target: { value: " " } },
  );
  expect(save).toBeDisabled();
  fireEvent.change(
    within(dialog).getByRole("textbox", { name: "Finding 标题" }),
    { target: { value: " Engineer title " } },
  );
  fireEvent.change(within(dialog).getByRole("textbox", { name: "建议行动" }), {
    target: { value: " Verify clearance " },
  });
  fireEvent.click(save);
  await waitFor(() =>
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument(),
  );
  expect(api.engineeringDecision).toHaveBeenLastCalledWith(
    "project-a",
    findings[0].id,
    {
      decision: "EDITED",
      note: "Edit after review",
      title: "Engineer title",
      suggested_action: "Verify clearance",
    },
  );
  expect(
    screen.getByRole("region", { name: "Finding 详情" }),
  ).toHaveTextContent("Engineer title");
  dialog = openDecision("忽略");
  expect(
    within(dialog).getByRole("button", { name: "提交人工判断" }),
  ).toBeDisabled();
  submit(dialog, " Duplicate issue ");
  await waitFor(() =>
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument(),
  );
  expect(selectedState("DISMISSED")).toBeInTheDocument();
  dialog = openDecision("重新打开");
  expect(
    within(dialog).getByRole("button", { name: "提交人工判断" }),
  ).toBeDisabled();
  submit(dialog, "New engineering evidence");
  await waitFor(() =>
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument(),
  );
  expect(selectedState("PROPOSED")).toBeInTheDocument();
  expect(api.engineeringDecision).toHaveBeenLastCalledWith(
    "project-a",
    findings[0].id,
    { decision: "REOPENED", note: "New engineering evidence" },
  );
});

it.each([403, 409, 422])(
  "keeps rejected closure (%s) open and refreshes authoritative Finding/Coordination",
  async (status) => {
    findings[0] = { ...findings[0], state: "CONFIRMED" };
    vi.mocked(api.engineeringDecision).mockImplementation(async () => {
      findings[0] = {
        ...findings[0],
        title: "Concurrent engineering revision",
      };
      throw new APIError(status, "Current dependency evidence required");
    });
    setup();
    await loaded();
    const dialog = openDecision("关闭");
    expect(
      within(dialog).getByRole("button", { name: "提交人工判断" }),
    ).toBeDisabled();
    submit(dialog);
    await waitFor(() =>
      expect(within(dialog).getByRole("alert")).toHaveTextContent(
        "Current dependency evidence required",
      ),
    );
    expect(selectedState("CONFIRMED")).toBeInTheDocument();
    expect(
      screen.getByRole("region", { name: "Finding 详情", hidden: true }),
    ).toHaveTextContent("Concurrent engineering revision");
    expect(api.engineeringCoordination).toHaveBeenCalledTimes(2);
    expect(history).toEqual([]);
  },
);

it("closes only after accepted human judgment, then supports explicit reopening", async () => {
  findings[0] = { ...findings[0], state: "CONFIRMED" };
  checks = [makeCheck("RESOLVED")];
  setup();
  await loaded();
  const dialog = openDecision("关闭");
  const closure = within(dialog).getByRole("combobox", {
    name: "关闭依据 ReCheck",
  });
  expect(closure).toHaveValue("");
  fireEvent.change(closure, { target: { value: checks[0].id } });
  submit(dialog, "All current dependencies verified");
  await waitFor(() =>
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument(),
  );
  expect(selectedState("CLOSED")).toBeInTheDocument();
  expect(api.engineeringDecision).toHaveBeenLastCalledWith(
    "project-a",
    findings[0].id,
    {
      decision: "CLOSED",
      note: "All current dependencies verified",
      recheck_id: checks[0].id,
    },
  );
  submit(openDecision("重新打开"), "Reassess new revision");
  await waitFor(() =>
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument(),
  );
  expect(selectedState("PROPOSED")).toBeInTheDocument();
});

it("shows evidence-insufficient as a contract gap, never silently dismissing or editing", async () => {
  setup();
  await loaded();
  fireEvent.click(screen.getByRole("button", { name: "证据不足" }));
  const dialog = screen.getByRole("dialog", {
    name: "证据不足",
  });
  expect(dialog).toHaveTextContent("此操作不可提交");
  expect(dialog).toHaveTextContent("不会更改工程判断");
  expect(
    within(dialog).queryByRole("button", { name: "提交人工判断" }),
  ).not.toBeInTheDocument();
  fireEvent.click(within(dialog).getByRole("button", { name: "返回证据" }));
  expect(api.engineeringDecision).not.toHaveBeenCalled();
  expect(api.requestEngineeringRechecks).not.toHaveBeenCalled();
  expect(selectedState("PROPOSED")).toBeInTheDocument();
});

it.each(["coordination", "rechecks"] as const)(
  "shows and retries %s read failures without inventing history",
  async (kind) => {
    if (kind === "coordination")
      vi.mocked(api.engineeringCoordination).mockRejectedValueOnce(
        new APIError(503, "History offline"),
      );
    else
      vi.mocked(api.engineeringRechecks).mockRejectedValueOnce(
        new APIError(503, "Rechecks offline"),
      );
    setup();
    await loaded();
    fireEvent.click(screen.getByRole("button", { name: "协调 / 复核" }));
    const dialog = screen.getByRole("dialog", {
      name: "协调 / ReCheck",
    });
    const retry = await within(dialog).findByRole("button", {
      name: kind === "coordination" ? "重试读取历史" : "重试读取复核",
    });
    expect(within(dialog).getByRole("alert")).toHaveTextContent("offline");
    fireEvent.click(retry);
    await waitFor(() =>
      expect(within(dialog).queryByRole("alert")).not.toBeInTheDocument(),
    );
    expect(dialog).toHaveTextContent("尚无人工决策记录");
    expect(dialog).toHaveTextContent("尚无 ReCheck");
  },
);

it("requests persisted pending ReChecks and disables duplicate submissions", async () => {
  findings[0] = { ...findings[0], state: "CONFIRMED" };
  const pending = deferred<DTO<"ReCheck">[]>();
  vi.mocked(api.requestEngineeringRechecks).mockReturnValue(pending.promise);
  vi.mocked(api.run).mockResolvedValue(makeRun("QUEUED"));
  setup();
  await loaded();
  fireEvent.click(screen.getByRole("button", { name: "协调 / 复核" }));
  const dialog = screen.getByRole("dialog", { name: "协调 / ReCheck" });
  fireEvent.click(
    within(dialog).getByRole("button", { name: "请求当前版本复核" }),
  );
  await waitFor(() =>
    expect(api.requestEngineeringRechecks).toHaveBeenCalledWith(
      "project-a",
      findings[0].id,
      { operation_id: expect.any(String) },
    ),
  );
  expect(
    within(dialog).getByRole("button", { name: "正在提交…" }),
  ).toBeDisabled();
  expect(dialog).not.toHaveTextContent("PENDING ·");
  await act(async () => {
    checks = [makeCheck()];
    pending.resolve(checks);
  });
  expect(
    await within(dialog).findByText("PENDING · 工程结论待定"),
  ).toBeInTheDocument();
  expect(await within(dialog).findByText("执行：QUEUED")).toBeInTheDocument();
  expect(selectedState("CONFIRMED")).toBeInTheDocument();
  expect(api.engineeringDecision).not.toHaveBeenCalled();
});

it.each([null, "RESOLVED", "STILL_OPEN", "CHANGED", "NEEDS_REVIEW"] as const)(
  "separates completed execution from %s outcome and never performs AI resolution",
  async (outcome) => {
    findings[0] = { ...findings[0], state: "CONFIRMED" };
    checks = [makeCheck(outcome)];
    setup();
    await loaded();
    fireEvent.click(screen.getByRole("button", { name: "协调 / 复核" }));
    const dialog = screen.getByRole("dialog", {
      name: "协调 / ReCheck",
    });
    expect(
      await within(dialog).findByText("执行：COMPLETED"),
    ).toBeInTheDocument();
    const expected = {
      RESOLVED: "条件已验证满足",
      STILL_OPEN: "问题仍存在",
      CHANGED: "问题已变化，需重新判断",
      NEEDS_REVIEW: "需要人工复核 · 非执行失败",
    };
    expect(
      within(dialog).getByRole("list", { name: "ReCheck 历史" }),
    ).toHaveTextContent(
      `${outcome ?? "PENDING"} · ${outcome ? expected[outcome] : "工程结论待定"}`,
    );
    expect(dialog).toHaveTextContent(
      "新版本、AI 解释或执行完成均不自动关闭 Finding",
    );
    expect(selectedState("CONFIRMED")).toBeInTheDocument();
    expect(api.engineeringDecision).not.toHaveBeenCalled();
    if (outcome) {
      fireEvent.click(
        within(dialog).getByRole("button", {
          name: "查看复核 Evidence · recheck-evidence",
        }),
      );
      await waitFor(() =>
        expect(
          screen.getByRole("region", { name: "Drawing · 图纸 workspace host" }),
        ).toHaveAttribute("data-evidence-id", "recheck-evidence"),
      );
      expect(
        screen.getByRole("region", { name: "Drawing · 图纸 workspace host" }),
      ).toHaveAttribute("data-evidence-stale", "false");
    }
  },
);

it.each(["finding", "source", "unknown"] as const)(
  "marks resolved ReChecks %s freshness without claiming current closure",
  async (kind) => {
    findings[0] = { ...findings[0], state: "CONFIRMED" };
    checks = [makeCheck("RESOLVED")];
    if (kind === "finding")
      checks[0] = { ...checks[0], finding_updated_at: "2025-12-01T00:00:00Z" };
    setup({
      sources:
        kind === "unknown"
          ? []
          : [
              {
                ...source,
                latest_revision_id: kind === "source" ? "r3" : "r2",
              },
            ],
    });
    await loaded();
    fireEvent.click(screen.getByRole("button", { name: "协调 / 复核" }));
    const dialog = screen.getByRole("dialog", {
      name: "协调 / ReCheck",
    });
    const expected = {
      finding: "已过期 · Finding 已更新",
      source: "已过期 · 源版本已更新",
      unknown: "版本时效未验证 · 当前源版本不可用",
    };
    expect(await within(dialog).findByText(expected[kind])).toBeInTheDocument();
    expect(selectedState("CONFIRMED")).toBeInTheDocument();
    expect(api.engineeringDecision).not.toHaveBeenCalled();
    if (kind !== "unknown") {
      fireEvent.click(
        within(dialog).getByRole("button", {
          name: "查看复核 Evidence · recheck-evidence",
        }),
      );
      const host = await screen.findByRole("region", {
        name: "Drawing · 图纸 workspace host",
      });
      await waitFor(() =>
        expect(host).toHaveAttribute("data-evidence-id", "recheck-evidence"),
      );
      expect(host).toHaveAttribute("data-evidence-stale", "true");
      expect(host).toHaveTextContent("历史证据 · 已过期或被替换");
      fireEvent.click(
        screen.getByRole("button", { name: /Beam and duct intersect/ }),
      );
      expect(host).toHaveAttribute("data-evidence-id", "geometry");
      expect(host).toHaveAttribute("data-evidence-stale", "false");
    }
  },
);

it("drops a removed selection and its cached receipt rather than selecting another list position", async () => {
  const { cache } = setup();
  await loaded();
  findings = [findings[1]];
  await act(() =>
    cache.invalidateQueries({
      queryKey: engineeringKeys.findings("project-a"),
    }),
  );
  expect(await screen.findByText("工程判断已不在当前列表")).toBeInTheDocument();
  expect(
    screen.queryByRole("region", { name: "Finding 详情" }),
  ).not.toBeInTheDocument();
  expect(
    screen.queryByRole("region", { name: /Drawing/ }),
  ).not.toBeInTheDocument();
});

it("supports panel Escape/focus return without switching Work modes", async () => {
  setup();
  await loaded();
  fireEvent.keyDown(screen.getByRole("complementary", { name: "工作与审核" }), {
    key: "Escape",
  });
  expect(
    screen.queryByRole("complementary", { name: "工作与审核" }),
  ).not.toBeInTheDocument();
  expect(screen.getByRole("button", { name: "审核面板" })).toHaveFocus();
  fireEvent.click(screen.getByRole("button", { name: "审核面板" }));
  expect(
    screen.getByRole("complementary", { name: "工作与审核" }),
  ).toBeInTheDocument();
  expect(
    screen.queryByRole("button", { name: "返回工作列表" }),
  ).not.toBeInTheDocument();
});

it("shows a failed ReCheck request and offers a real retry without synthesizing an outcome", async () => {
  findings[0] = { ...findings[0], state: "CONFIRMED" };
  vi.mocked(api.requestEngineeringRechecks).mockRejectedValueOnce(
    new APIError(503, "Capability queue offline"),
  );
  setup();
  await loaded();
  fireEvent.click(screen.getByRole("button", { name: "协调 / 复核" }));
  const dialog = screen.getByRole("dialog", { name: "协调 / ReCheck" });
  fireEvent.click(
    within(dialog).getByRole("button", { name: "请求当前版本复核" }),
  );
  expect(await within(dialog).findByRole("alert")).toHaveTextContent(
    "Capability queue offline",
  );
  expect(dialog).toHaveTextContent("尚无 ReCheck");
  fireEvent.click(within(dialog).getByRole("button", { name: "重试复核请求" }));
  await waitFor(() =>
    expect(within(dialog).queryByRole("alert")).not.toBeInTheDocument(),
  );
  expect(api.requestEngineeringRechecks).toHaveBeenCalledTimes(2);
  expect(api.engineeringDecision).not.toHaveBeenCalled();
});

it("lets dialog Escape return to the review panel without submitting a human decision", async () => {
  setup();
  await loaded();
  const dialog = openDecision("忽略");
  fireEvent.keyDown(dialog, { key: "Escape" });
  await waitFor(() =>
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument(),
  );
  expect(
    screen.getByRole("complementary", { name: "工作与审核" }),
  ).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "忽略" })).toHaveFocus();
  expect(api.engineeringDecision).not.toHaveBeenCalled();
});

it("uses one selected-object inspector: change, impact and next action precede Evidence and provenance", async () => {
  setup();
  await loaded();
  const inspector = screen.getByRole("region", { name: "Finding 详情" });
  const headings = within(inspector)
    .getAllByRole("heading")
    .map((heading) => heading.textContent);
  expect(headings.slice(0, 4)).toEqual([
    findings[0].title,
    "什么变了",
    "为什么重要",
    "下一步 · 建议",
  ]);
  const technical = within(inspector)
    .getByText("来源与技术详情")
    .closest("details")!;
  expect(technical.open).toBe(false);
  expect(
    JSON.parse(
      within(technical).getByLabelText("Exact Finding record").textContent!,
    ),
  ).toEqual(findings[0]);
  expect(within(inspector).getByText(findings[0].what_changed)).toBeVisible();
  expect(within(inspector).getByText(findings[0].why_it_matters)).toBeVisible();
  expect(
    within(inspector).getByText(findings[0].suggested_action!),
  ).toBeVisible();
});

it("keeps one Work list and one search beside the selected receipt and evidence", async () => {
  setup();
  await loaded();
  const panel = screen.getByRole("complementary", { name: "工作与审核" });
  // One list, one search, one receipt: no second queue or duplicate selection.
  expect(panel.querySelectorAll(".workspace-list")).toHaveLength(1);
  // One search: the donor's plain input inside the filter row, no shadow control.
  expect(panel.querySelectorAll("label.workspace-search input")).toHaveLength(
    1,
  );
  expect(screen.getByRole("textbox", { name: "搜索工作" })).toBeInstanceOf(
    HTMLInputElement,
  );
  expect(screen.queryByText(/工程判断列表 ·/)).not.toBeInTheDocument();
  expect(panel).toHaveTextContent("工作与审核");
  expect(screen.getByRole("region", { name: "Finding 详情" })).toBeVisible();
  expect(screen.getByRole("region", { name: /Drawing/ })).toBeVisible();
  fireEvent.click(screen.getByRole("button", { name: "关闭工作与审核面板" }));
  expect(
    screen.queryByRole("complementary", { name: "工作与审核" }),
  ).not.toBeInTheDocument();
  expect(screen.getByRole("region", { name: /Drawing/ })).toBeVisible();
  expect(
    screen.queryByRole("button", { name: "返回工作列表" }),
  ).not.toBeInTheDocument();
});

it("retries only failed secondary Evidence without losing the active successful target", async () => {
  const failure = new APIError(503, "secondary evidence unavailable");
  vi.mocked(api.engineeringEvidence).mockImplementation(
    async (_project, id) => {
      if (id === "text") throw failure;
      return makeEvidence(id);
    },
  );
  setup();
  await loaded();
  const active = screen.getByRole("region", { name: /Drawing/ });
  expect(active).toHaveAttribute("data-evidence-id", "geometry");
  const retry = await screen.findByRole("button", {
    name: "重试未读取 Evidence",
  });
  vi.mocked(api.engineeringEvidence).mockClear();
  vi.mocked(api.engineeringEvidence).mockImplementation(async (_project, id) =>
    makeEvidence(id),
  );
  fireEvent.click(retry);
  await waitFor(() => expect(retry).not.toBeInTheDocument());
  expect(api.engineeringEvidence).toHaveBeenCalledExactlyOnceWith(
    "project-a",
    "text",
  );
  expect(active).toHaveAttribute("data-evidence-id", "geometry");
  expect(
    screen.getByRole("region", { name: "结构化与提取证据" }),
  ).toHaveTextContent("Design change requires clearance");
});

it("clears the evidence session when a filter hides the selected Finding and restores only its own receipt", async () => {
  setup();
  await screen.findByRole("heading", { name: makeFinding().title });
  await screen.findByRole("region", { name: "Drawing · 图纸 workspace host" });
  fireEvent.change(screen.getByRole("textbox", { name: "搜索工作" }), {
    target: { value: "no matching Finding" },
  });
  await waitFor(() =>
    expect(
      screen.queryByRole("region", { name: "Drawing · 图纸 workspace host" }),
    ).not.toBeInTheDocument(),
  );
  expect(
    screen.queryByRole("button", { name: "确认" }),
  ).not.toBeInTheDocument();
  fireEvent.change(screen.getByRole("textbox", { name: "搜索工作" }), {
    target: { value: "" },
  });
  await screen.findByRole("heading", { name: makeFinding().title });
  expect(
    await screen.findByRole("region", {
      name: "Drawing · 图纸 workspace host",
    }),
  ).toHaveAttribute("data-evidence-id", "geometry");
});
