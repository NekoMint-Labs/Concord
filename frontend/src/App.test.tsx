import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { App } from "./App";
import { api, type DTO, type Workspace } from "./api/client";
import fixture from "../tests/fixtures/inspector.json";
import type { ComponentProps } from "react";
import type { WorkspaceViews } from "./app/WorkspaceViews";
import { WorkList } from "./features/WorkList";
import { SourceContextPane } from "./features/SourceContextPane";

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
        data-tab={props.tab}
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
      {props.tab === "work" && (
        <WorkList
          workspace={props.data}
          sources={props.modelSources ?? []}
          onInvestigate={props.onInvestigateWork}
          onPackage={props.onSelected}
          onModels={() => props.onTab("bim")}
          onRecheck={props.onRecheck}
          onReport={() => props.onDetailsOpen(true)}
          onProject={() => props.onTab("project")}
          onTab={props.onTab}
          report={props.report}
          run={props.run}
        />
      )}
      <button onClick={() => props.onTab("bim")}>Open source comparison</button>
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

vi.mock("./features/ConcordAgent", () => ({
  ConcordAgent: ({
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
  }) => (
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
  ),
}));
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
  ProjectSidebar: ({ onProject }: { onProject: (id: string) => void }) => (
    <button onClick={() => onProject("project-b")}>切换项目</button>
  ),
}));

afterEach(() => {
  vi.restoreAllMocks();
  localStorage.clear();
});

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
  const context = await screen.findByTestId("context");
  await waitFor(() =>
    expect(context).toHaveAttribute(
      "data-selected",
      a.state.work_packages[0].id,
    ),
  );
  fireEvent.click(
    screen.getByRole("button", { name: "Inspect source impact" }),
  );
  fireEvent.click(screen.getByRole("button", { name: "Open inspector" }));
  expect(context).toHaveAttribute("data-mapping", "true");
  expect(context).toHaveAttribute("data-source", "old-source");
  expect(context).toHaveAttribute("data-inspector", "true");
  fireEvent.click(screen.getByRole("button", { name: "切换项目" }));
  await waitFor(() =>
    expect(screen.getByTestId("context")).toHaveAttribute(
      "data-selected",
      "new-package",
    ),
  );
  const fresh = screen.getByTestId("context");
  expect(fresh).toHaveAttribute("data-project", "project-b");
  expect(fresh).toHaveAttribute("data-tab", "work");
  expect(fresh).toHaveAttribute("data-inspector", "false");
  expect(fresh).toHaveAttribute("data-mapping", "false");
  expect(fresh).toHaveAttribute("data-element", "");
  expect(fresh).not.toHaveAttribute("data-source");
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
      expect(screen.getByTestId("context")).toHaveAttribute(
        "data-selected",
        workspace.state.work_packages[0].id,
      );
      expect(screen.getByTestId("context")).toHaveAttribute("data-tab", "work");
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
      const peek = screen.getByRole("complementary", { name: "所选工作事项" });
      expect(peek).toHaveTextContent("R1 → R2");
      fireEvent.click(within(peek).getByRole("button", { name: "处理新版本" }));
    } else {
      // BIM has a selected unrelated package; comparison Investigations stay source-scoped.
      fireEvent.click(
        screen.getByRole("button", { name: "Open source comparison" }),
      );
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
    expect(screen.getByTestId("context")).toHaveAttribute(
      "data-inspector",
      "true",
    );

    fireEvent.click(
      screen.getByRole("button", { name: "Change work source context" }),
    );
    await waitFor(() => {
      expect(agent).toHaveAttribute("data-revision", "r3");
      expect(agent).toHaveAttribute("data-run", "");
    });
    expect(screen.getByTestId("context")).toHaveAttribute(
      "data-history-report",
      "Historical work investigation",
    );
    expect(screen.getByTestId("context")).toHaveAttribute(
      "data-history-revision",
      "r2",
    );
    expect(screen.getByTestId("context")).toHaveAttribute(
      "data-history-work-package",
      "",
    );
    expect(agent).toHaveAttribute("data-report", "");
    cache.clear();
  },
);
