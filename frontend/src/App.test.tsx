import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { App } from "./App";
import { api, type DTO, type Workspace } from "./api/client";
import fixture from "../tests/fixtures/inspector.json";
import type { ComponentProps } from "react";
import type { WorkspaceViews } from "./app/WorkspaceViews";
import type { WorkSurfaceProps } from "./features/FindingWorkbench";
import { WorkPanel } from "./features/WorkPanel";
import { SourceContextPane } from "./features/SourceContextPane";

/*
 * The workspace shell mounts either `FindingWorkbench` (the Work destination)
 * or `WorkspaceViews` (every other destination). The mocks below keep the real
 * `WorkPanel`/`SourceContextPane` so the tests still exercise the product, and
 * expose the props the shell forwards so the tests can assert App's state - the
 * Finding/Evidence selection now lives on the Work destination, and the mapping,
 * inspector and element context on the WorkspaceViews destinations.
 */
vi.mock("./app/WorkspaceViews", () => ({
  WorkspaceViews: (props: ComponentProps<typeof WorkspaceViews>) => (
    <section aria-label="active project context">
      <output
        data-testid="context"
        data-project={props.project}
        data-selected={props.selected}
        data-inspector={props.detailsOpen}
        data-mapping={props.mappingMode}
        data-element={props.selectedElement}
        data-source={props.mappingContext?.sourceId}
        data-history-report={props.report?.answer.summary ?? ""}
        data-history-revision={props.investigationContext.revisionId ?? ""}
        data-history-work-package={
          props.investigationContext.workPackageId ?? ""
        }
      />
      <button
        onClick={() =>
          props.onInspectImpact(props.selected, {
            sourceId: "old-source",
            revisionId: "old-r2",
            highlightIds: ["old-element"],
          })
        }
      >
        Inspect source impact
      </button>
      <button onClick={() => props.onDetailsOpen(true)}>Open inspector</button>
      {props.tab === "bim" && (
        <SourceContextPane
          project={props.project}
          sourceId="source-1"
          focusComparisonId="comparison"
          onContext={props.onSourceContext}
          onInvestigate={props.onInvestigateSource}
        />
      )}
      <button
        onClick={() =>
          props.onSourceContext?.("source-1", "r3", "R3", "r2", "R2")
        }
      >
        Change work source context
      </button>
    </section>
  ),
}));

vi.mock("./features/FindingWorkbench", () => ({
  FindingWorkbench: (props: {
    project: string;
    selectedId?: string;
    evidenceId?: string;
    work: WorkSurfaceProps;
  }) => (
    <section aria-label="work destination">
      <output
        data-testid="work-context"
        data-project={props.project}
        data-finding-id={props.selectedId ?? ""}
        data-finding-evidence={props.evidenceId ?? ""}
      />
      <WorkPanel
        workspace={props.work.workspace}
        sources={props.work.sources}
        onInvestigate={props.work.onInvestigate}
        onPackage={props.work.onPackage}
        onModels={props.work.onModels}
        onRecheck={props.work.onRecheck}
        onReport={props.work.onReport}
        onProject={props.work.onProject}
        report={props.work.report}
        run={props.work.run}
      />
    </section>
  ),
}));

vi.mock("./features/ConcordAgent", () => ({
  ConcordAgent: AgentContextProbe,
  /* The docked Work panel mounts the same surface; the probe stands in for both so the
   * context assertions hold whichever surface is rendering. */
  ConcordAgentSurface: AgentContextProbe,
}));
function AgentContextProbe({
  context,
  currentRun,
  report,
}: {
  context: {
    sourceId?: string;
    fromRevisionId?: string;
    revisionId?: string;
    workPackageId?: string;
    elementIds: string[];
  };
  currentRun?: { id: string } | null;
  report?: { answer: { summary: string } } | null;
}) {
  return (
    <output
      data-testid="agent-context"
      data-source={context.sourceId ?? ""}
      data-from={context.fromRevisionId ?? ""}
      data-revision={context.revisionId ?? ""}
      data-work-package={context.workPackageId ?? ""}
      data-elements={JSON.stringify(context.elementIds)}
      data-run={currentRun?.id ?? ""}
      data-report={report?.answer.summary ?? ""}
    />
  );
}
vi.mock("./api/stream", () => ({ useRunStream: () => [] }));
vi.mock("./layout/PaneSplit", () => ({
  PaneSplit: ({ children }: { children: import("react").ReactNode }) => (
    <div>{children}</div>
  ),
  Pane: ({ children }: { children: import("react").ReactNode }) => (
    <div>{children}</div>
  ),
  PaneDivider: () => null,
  usePanelRef: () => ({ current: { collapse() {}, expand() {} } }),
}));
vi.mock("./app/ProjectSidebar", () => ({
  ProjectSidebar: ({
    tab,
    onTab,
  }: {
    tab: string;
    onTab: (tab: string) => void;
  }) => (
    <>
      <output data-testid="rail" data-tab={tab} />
      <button onClick={() => onTab("browse")}>浏览工作区</button>
      <button onClick={() => onTab("bim")}>模型工作区</button>
    </>
  ),
}));

beforeEach(() => {
  vi.spyOn(api, "engineeringFindings").mockResolvedValue([]);
});

const finding = (
  project: string,
  id: string,
  title: string,
): DTO<"Finding"> => ({
  id,
  project_id: project,
  state: "PROPOSED",
  snapshot_id: "snapshot-2",
  work_package_id: "work-4",
  title,
  conclusion: "Measured conflict",
  what_changed: "Duct moved",
  why_it_matters: "Clearance",
  evidence_ids: [`${id}-evidence`],
  reasoning_summary: "Measured",
  confidence: 0.9,
  limitations: [],
  created_at: "2026-01-01T00:00:00Z",
  updated_at: "2026-01-01T00:00:00Z",
  impact: null,
  change_ids: [],
  dependencies: [],
  suggested_action: "Review",
  suggested_discipline: "MEP",
});

afterEach(() => {
  vi.restoreAllMocks();
  localStorage.clear();
});

/** The header's current work package select mirrors App's `selected` state. */
function currentPackage() {
  return screen.getByRole("combobox", { name: "工作包" });
}

it("discards WP, source, element, mapping and inspector context when switching cached projects", async () => {
  const a = structuredClone(fixture.waiting) as unknown as Workspace;
  a.state.project = {
    id: "project-a",
    name: "项目 A",
    description: "",
    timezone: "UTC",
  };
  const b = structuredClone(a);
  b.state.project = { ...a.state.project, id: "project-b", name: "项目 B" };
  b.state.work_packages = [
    { ...a.state.work_packages[0], id: "new-package", name: "新项目工作包" },
  ];
  const findingA = finding(
    "project-a",
    "opaque-finding-a",
    "Project A engineering finding",
  );
  const findingB = finding(
    "project-b",
    "opaque-finding-b",
    "Project B engineering finding",
  );
  vi.mocked(api.engineeringFindings).mockImplementation(async (project) =>
    project === "project-a" ? [findingA] : [findingB],
  );
  localStorage.setItem("concord:last-project", a.state.project.id);
  vi.spyOn(api, "projects").mockResolvedValue([
    a.state.project,
    b.state.project,
  ]);
  vi.spyOn(api, "profile").mockResolvedValue(
    {} as Awaited<ReturnType<typeof api.profile>>,
  );
  vi.spyOn(api, "sourceStatuses").mockResolvedValue([]);
  vi.spyOn(api, "runs").mockResolvedValue([]);
  // The retained real source pane starts these reads even with an empty catalog.
  vi.spyOn(api, "capabilities").mockResolvedValue({ capabilities: [] });
  vi.spyOn(api, "sourceRevisions").mockResolvedValue([]);
  vi.spyOn(api, "baselines").mockResolvedValue([]);
  const cache = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: Infinity } },
  });
  cache.setQueryData(["workspace", a.state.project.id], a);
  cache.setQueryData(["workspace", b.state.project.id], b);
  render(
    <QueryClientProvider client={cache}>
      <App />
    </QueryClientProvider>,
  );
  const work = await screen.findByTestId("work-context");
  await waitFor(() =>
    expect(currentPackage()).toHaveValue(a.state.work_packages[0].id),
  );
  expect(work).toHaveAttribute("data-project", "project-a");
  expect(screen.getByTestId("rail")).toHaveAttribute("data-tab", "work");

  // Mapping and inspector context are only reachable from a WorkspaceViews destination.
  fireEvent.click(screen.getByRole("button", { name: "模型工作区" }));
  const context = await screen.findByTestId("context");
  fireEvent.click(
    screen.getByRole("button", { name: "Inspect source impact" }),
  );
  fireEvent.click(screen.getByRole("button", { name: "Open inspector" }));
  expect(context).toHaveAttribute("data-mapping", "true");
  expect(context).toHaveAttribute("data-source", "old-source");
  expect(context).toHaveAttribute("data-element", "old-element");
  expect(context).toHaveAttribute("data-inspector", "true");

  // A Finding keeps its opaque ID and no Evidence ID until one is chosen.
  fireEvent.keyDown(window, { key: "k", ctrlKey: true });
  const command = within(
    screen.getByRole("dialog", { name: "查找对象或操作" }),
  );
  const search = command.getByRole("combobox", { name: "搜索对象或操作" });
  fireEvent.change(search, { target: { value: findingA.title } });
  fireEvent.click(
    await command.findByRole("option", {
      name: new RegExp(`^${findingA.title}`),
    }),
  );
  const selectedFinding = screen.getByTestId("work-context");
  expect(selectedFinding).toHaveAttribute("data-finding-id", findingA.id);
  expect(screen.getByTestId("rail")).toHaveAttribute("data-tab", "work");
  expect(selectedFinding).toHaveAttribute("data-finding-evidence", "");
  // A real evidence entry keeps its opaque Finding and Evidence IDs.
  fireEvent.keyDown(window, { key: "k", ctrlKey: true });
  const evidenceCommand = within(
    screen.getByRole("dialog", { name: "查找对象或操作" }),
  );
  fireEvent.change(
    evidenceCommand.getByRole("combobox", { name: "搜索对象或操作" }),
    {
      target: { value: "工程依据" },
    },
  );
  fireEvent.click(
    await evidenceCommand.findByRole("option", { name: /工程依据/ }),
  );
  expect(screen.getByTestId("work-context")).toHaveAttribute(
    "data-finding-evidence",
    findingA.evidence_ids[0],
  );

  // Restore non-empty main context before switching: Finding navigation itself clears mapping.
  fireEvent.click(screen.getByRole("button", { name: "模型工作区" }));
  fireEvent.click(
    screen.getByRole("button", { name: "Inspect source impact" }),
  );
  fireEvent.click(screen.getByRole("button", { name: "Open inspector" }));
  const beforeSwitch = screen.getByTestId("context");
  expect(beforeSwitch).toHaveAttribute("data-mapping", "true");
  expect(beforeSwitch).toHaveAttribute("data-source", "old-source");
  expect(beforeSwitch).toHaveAttribute("data-element", "old-element");
  expect(beforeSwitch).toHaveAttribute("data-inspector", "true");

  fireEvent.click(screen.getByRole("button", { name: "打开或新建项目" }));
  const chooser = await screen.findByRole("dialog", { name: "打开项目" });
  fireEvent.click(within(chooser).getByRole("button", { name: /项目 B/ }));

  await waitFor(() =>
    expect(screen.getByTestId("work-context")).toHaveAttribute(
      "data-project",
      "project-b",
    ),
  );
  const fresh = screen.getByTestId("work-context");
  expect(fresh).toHaveAttribute("data-finding-id", "");
  expect(fresh).toHaveAttribute("data-finding-evidence", "");
  expect(screen.getByTestId("rail")).toHaveAttribute("data-tab", "work");
  await waitFor(() => expect(currentPackage()).toHaveValue("new-package"));

  // A WorkspaceViews destination shows the reset context.
  fireEvent.click(screen.getByRole("button", { name: "模型工作区" }));
  const reset = await screen.findByTestId("context");
  expect(reset).toHaveAttribute("data-project", "project-b");
  expect(reset).toHaveAttribute("data-inspector", "false");
  expect(reset).toHaveAttribute("data-mapping", "false");
  expect(reset).toHaveAttribute("data-element", "");
  expect(reset).not.toHaveAttribute("data-source");

  // App owns Finding command entries; WorkspaceViews does not receive that list.
  fireEvent.keyDown(window, { key: "k", ctrlKey: true });
  const projectCommand = within(
    screen.getByRole("dialog", { name: "查找对象或操作" }),
  );
  fireEvent.change(
    projectCommand.getByRole("combobox", { name: "搜索对象或操作" }),
    { target: { value: "engineering finding" } },
  );
  const currentFinding = await projectCommand.findByRole("option", {
    name: new RegExp(`^${findingB.title}`),
  });
  expect(
    projectCommand.queryByRole("option", {
      name: new RegExp(`^${findingA.title}`),
    }),
  ).not.toBeInTheDocument();
  fireEvent.click(currentFinding);
  await waitFor(() =>
    expect(screen.getByTestId("work-context")).toHaveAttribute(
      "data-finding-id",
      findingB.id,
    ),
  );
  expect(screen.getByTestId("rail")).toHaveAttribute("data-tab", "work");
  expect(screen.getByTestId("work-context")).toHaveAttribute(
    "data-finding-evidence",
    "",
  );
  expect(api.engineeringFindings).toHaveBeenCalledWith("project-a");
  expect(api.engineeringFindings).toHaveBeenCalledWith("project-b");
  cache.clear();
});

it.each([
  { entrypoint: "Work", elementIds: [] },
  { entrypoint: "Work", elementIds: ["changed-element"] },
  { entrypoint: "source comparison", elementIds: ["changed-element"] },
])(
  "synchronizes the real $entrypoint Investigation entrypoint before associating its run (elements: $elementIds)",
  async ({ entrypoint, elementIds }) => {
    const workspace = structuredClone(fixture.waiting) as unknown as Workspace;
    workspace.state.project = {
      ...workspace.state.project,
      id: "harbor-east",
      name: "Harbor East",
    };
    localStorage.setItem("concord:last-project", "harbor-east");
    const sourceStatus: DTO<"ProjectSourceStatus"> = {
      source: {
        id: "source-1",
        project_id: "harbor-east",
        name: "MEP model",
        kind: "BIM",
        created_at: "2026-01-01T00:00:00Z",
      },
      latest_revision_id: "r2",
      accepted_revision_id: "r1",
      baseline_id: "baseline-1",
      has_pending_revision: true,
    };
    const investigationRun: DTO<"AgentRun"> = {
      id: "work-investigation",
      project_id: "harbor-east",
      category: "investigation",
      event_id: null,
      status: "COMPLETED",
      runtime: "dbos",
      runtime_execution_id: null,
      generation: 1,
      runtime_generation: 1,
      analysis_id: "analysis-work",
      error: null,
      created_at: "2026-01-01T00:00:00Z",
      updated_at: "2026-01-01T00:00:00Z",
    };
    const report = {
      run_id: investigationRun.id,
      analysis_id: investigationRun.analysis_id,
      generation: investigationRun.generation,
      persisted: true,
      answer: {
        summary: "Historical work investigation",
        evidence_ids: [],
        limitations: [],
      },
      scope: {
        source_id: "source-1",
        from_revision_id: "r1",
        to_revision_id: "r2",
        work_package_ids: [],
        area_ids: [],
        element_ids: elementIds,
      },
      evidence: [],
      tools: [],
    } as DTO<"InvestigationReport">;
    vi.spyOn(api, "projects").mockResolvedValue([workspace.state.project]);
    vi.spyOn(api, "profile").mockResolvedValue(
      {} as Awaited<ReturnType<typeof api.profile>>,
    );
    vi.spyOn(api, "sourceStatuses").mockResolvedValue([sourceStatus]);
    vi.spyOn(api, "runs").mockResolvedValue([]);
    vi.spyOn(api, "investigate").mockResolvedValue(investigationRun);
    vi.spyOn(api, "run").mockResolvedValue(investigationRun);
    vi.spyOn(api, "investigation").mockResolvedValue(report);
    const revisions = [1, 2].map((sequence) => ({
      id: `r${sequence}`,
      sequence,
    })) as DTO<"ProjectSourceRevision">[];
    vi.spyOn(api, "sourceRevisions").mockResolvedValue(revisions);
    const comparison = {
      id: "comparison",
      project_id: "harbor-east",
      source_id: "source-1",
      from_revision_id: "r1",
      to_revision_id: "r2",
      summary: {
        added: 0,
        deleted: 0,
        changed: elementIds.length,
        from_elements: 1,
        to_elements: 1,
        common_global_ids: 1,
        global_id_continuity: 1,
        compare_seconds: 0,
        warnings: [],
      },
      engine: "ifcdiff",
      engine_version: "test",
      status: "COMPLETED",
      raw_result_key: "comparison-result",
      evidence_ids: [],
      created_at: "2026-01-01T00:00:00Z",
    } satisfies DTO<"RevisionComparison">;
    vi.spyOn(api, "comparisons").mockResolvedValue([comparison]);
    vi.spyOn(api, "comparison").mockResolvedValue({
      comparison,
      changes: elementIds.map((global_id) => ({
        global_id,
        comparison_id: "comparison",
        change_kind: "changed",
        changed_aspects: [],
      })),
      affected_work_packages: [],
    });
    vi.spyOn(api, "baselines").mockResolvedValue([]);
    vi.spyOn(api, "documents").mockResolvedValue([]);
    const cache = new QueryClient({
      defaultOptions: { queries: { retry: false, staleTime: Infinity } },
    });
    cache.setQueryData(["workspace", "harbor-east"], workspace);
    render(
      <QueryClientProvider client={cache}>
        <App />
      </QueryClientProvider>,
    );

    await waitFor(() => {
      expect(currentPackage()).toHaveValue(workspace.state.work_packages[0].id);
      expect(screen.getByTestId("rail")).toHaveAttribute("data-tab", "work");
      expect(
        cache.getQueryData([
          "comparison",
          "harbor-east",
          "source-1",
          "comparison",
        ]),
      ).toBeDefined();
    });
    if (entrypoint === "Work") {
      fireEvent.click(
        await screen.findByRole("button", { name: /MEP model 有新版本/ }),
      );
      const peek = screen.getByRole("region", { name: "所选工作事项" });
      expect(peek).toHaveTextContent("R1 → R2");
      fireEvent.click(within(peek).getByRole("button", { name: "处理新版本" }));
    } else {
      // BIM has a selected unrelated package; comparison Investigations stay source-scoped.
      fireEvent.click(screen.getByRole("button", { name: "模型工作区" }));
      const investigate = await screen.findByRole("button", {
        name: "调查此比较",
      });
      await waitFor(() => expect(investigate).toBeEnabled());
      fireEvent.click(investigate);
    }
    await waitFor(() =>
      expect(api.investigate).toHaveBeenCalledWith("harbor-east", {
        instruction:
          entrypoint === "Work"
            ? "调查此资料版本与比较影响"
            : "查看模型版本变化及影响",
        scope: {
          source_id: "source-1",
          from_revision_id: "r1",
          to_revision_id: "r2",
          work_package_ids: [],
          element_ids: elementIds,
        },
      }),
    );

    const agent = screen.getByTestId("agent-context");
    await waitFor(() => {
      expect(agent).toHaveAttribute("data-source", "source-1");
      expect(agent).toHaveAttribute("data-from", "r1");
      expect(agent).toHaveAttribute("data-revision", "r2");
      expect(agent).toHaveAttribute("data-work-package", "");
      expect(agent).toHaveAttribute(
        "data-elements",
        JSON.stringify(elementIds),
      );
      expect(agent).toHaveAttribute("data-run", "work-investigation");
      expect(agent).toHaveAttribute(
        "data-report",
        "Historical work investigation",
      );
    });

    if (entrypoint === "Work") {
      // Starting from Work keeps its destination; the shared inspector lives off it.
      expect(screen.getByTestId("rail")).toHaveAttribute("data-tab", "work");
      fireEvent.click(screen.getByRole("button", { name: "模型工作区" }));
    }
    const context = await screen.findByTestId("context");
    if (entrypoint !== "Work")
      expect(context).toHaveAttribute("data-inspector", "true");

    fireEvent.click(
      screen.getByRole("button", { name: "Change work source context" }),
    );
    await waitFor(() => {
      expect(agent).toHaveAttribute("data-revision", "r3");
      expect(agent).toHaveAttribute("data-run", "");
    });
    expect(context).toHaveAttribute(
      "data-history-report",
      "Historical work investigation",
    );
    expect(context).toHaveAttribute("data-history-revision", "r2");
    expect(context).toHaveAttribute("data-history-work-package", "");
    expect(agent).toHaveAttribute("data-report", "");
    cache.clear();
  },
);

it("keeps focus and command shortcuts out of the work search input", async () => {
  const workspace = structuredClone(fixture.waiting) as unknown as Workspace;
  vi.spyOn(api, "projects").mockResolvedValue([workspace.state.project]);
  vi.spyOn(api, "profile").mockResolvedValue(
    {} as Awaited<ReturnType<typeof api.profile>>,
  );
  vi.spyOn(api, "sourceStatuses").mockResolvedValue([]);
  vi.spyOn(api, "runs").mockResolvedValue([]);
  localStorage.setItem("concord:last-project", workspace.state.project.id);
  const cache = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: Infinity } },
  });
  cache.setQueryData(["workspace", workspace.state.project.id], workspace);
  render(
    <QueryClientProvider client={cache}>
      <App />
    </QueryClientProvider>,
  );
  const input = await screen.findByRole("textbox", { name: "搜索工作" });
  // The work search is the donor's plain input, not a ThatOpen shadow control.
  expect(input).toBeInstanceOf(HTMLInputElement);
  expect(input.closest("label.workspace-search")).not.toBeNull();
  expect(input.getRootNode()).not.toBeInstanceOf(ShadowRoot);
  for (const options of [
    { key: "f" },
    { key: "F" },
    { key: "k", ctrlKey: true },
    { key: "k", metaKey: true },
  ]) {
    const event = new KeyboardEvent("keydown", {
      ...options,
      bubbles: true,
      composed: true,
      cancelable: true,
    });
    fireEvent(input, event);
    expect(event.defaultPrevented).toBe(false);
    expect(localStorage.getItem("concord_canvas_focus")).not.toBe("1");
    expect(
      screen.queryByRole("dialog", { name: "查找对象或操作" }),
    ).not.toBeInTheDocument();
  }
  fireEvent.keyDown(window, { key: "f" });
  expect(localStorage.getItem("concord_canvas_focus")).toBe("1");
  cache.clear();
});
