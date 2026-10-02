import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { api, type DTO } from "../api/client";
import fixture from "../../tests/fixtures/inspector.json";
import {
  BimMappingWorkspace,
  filterBimCandidates,
} from "./BimMappingWorkspace";

vi.mock("../components/ui/AppSelect", () => ({
  AppSelect: ({
    label,
    value,
    onChange,
    options,
  }: {
    label: string;
    value: string;
    onChange: (value: string) => void;
    options: { value: string; label: string }[];
  }) => (
    <select
      aria-label={label}
      value={value}
      onChange={(event) => onChange(event.target.value)}
    >
      {options.map((option) => (
        <option key={option.value} value={option.value}>
          {option.label}
        </option>
      ))}
    </select>
  ),
}));
const viewer = vi.hoisted(() => ({
  props: null as null | {
    file: File;
    focusId?: string;
    onSelected: (id: string) => void;
    mapping?: {
      candidateIds: readonly string[];
      selectedIds: readonly string[];
      allowedIds: readonly string[];
    };
    onProperties?: (data: unknown, id?: string) => void;
  },
}));
vi.mock("../viewers/IFCViewer", () => ({
  default: (props: NonNullable<typeof viewer.props>) => {
    viewer.props = props;
    return <div>Mapping geometry</div>;
  },
}));
const modelSource = {
  source: {
    id: "source-1",
    project_id: "project",
    name: "MEP",
    kind: "BIM" as const,
    created_at: "2026-01-01T00:00:00Z",
  },
  latest_revision_id: "r1",
  accepted_revision_id: "r1",
  baseline_id: "b1",
  has_pending_revision: false,
};
beforeEach(() => {
  vi.spyOn(api, "workspace").mockResolvedValue({
    analysis: null,
    run: null,
    analysis_run: null,
    proposals: [],
    approvals: [],
    events: [],
    audit: [],
    stale: false,
    state: {
      ...fixture.waiting.state,
      work_packages: [
        {
          ...fixture.waiting.state.work_packages[0],
          id: "WP-1",
          name: "North floor",
          element_ids: [],
          materials: {},
          equipment: {},
        },
        {
          ...fixture.waiting.state.work_packages[0],
          id: "WP-2",
          name: "South floor",
          element_ids: [],
          materials: {},
          equipment: {},
        },
      ],
    },
  });
  vi.spyOn(api, "bim").mockResolvedValue([]);
  vi.spyOn(api, "sourceRevisions").mockResolvedValue([]);
  vi.spyOn(globalThis, "fetch").mockImplementation(
    async () => new Response(new Blob(["IFC"]), { status: 200 }),
  );
  viewer.props = null;
});

const elements = [
  {
    revision_id: "r1",
    global_id: "wall-l02",
    ifc_class: "IfcWall",
    name: "Wall",
    storey: "L02",
    space: "Lab",
    properties: { FireRating: "Current wall" },
  },
  {
    revision_id: "r1",
    global_id: "duct-l02",
    ifc_class: "IfcDuctSegment",
    name: "Duct",
    storey: "L02",
    space: "Plant",
    properties: {},
  },
  {
    revision_id: "r1",
    global_id: "wall-l03",
    ifc_class: "IfcWall",
    name: "Wall",
    storey: "L03",
    space: "Lab",
    properties: {},
  },
] satisfies DTO<"BimElementSnapshot">[];

it("intersects storey, space, and IFC type filters without inventing membership", () => {
  expect(
    filterBimCandidates(elements, {
      storey: "L02",
      space: "Lab",
      ifcClass: "IfcWall",
    }).map((item) => item.global_id),
  ).toEqual(["wall-l02"]);
  expect(
    filterBimCandidates(elements, {
      storey: "L02",
      space: "",
      ifcClass: "",
    }),
  ).toHaveLength(2);
});

afterEach(() => vi.restoreAllMocks());

it("updates mounted inspection context and keeps deleted changes visible without binding", async () => {
  vi.spyOn(api, "sourceStatuses").mockResolvedValue([
    {
      source: {
        id: "source-1",
        project_id: "project",
        name: "MEP",
        kind: "BIM",
        created_at: "2026-01-01T00:00:00Z",
      },
      latest_revision_id: "r1",
      accepted_revision_id: "r1",
      baseline_id: "b1",
      has_pending_revision: false,
    },
    {
      source: {
        id: "source-2",
        project_id: "project",
        name: "Structure",
        kind: "BIM",
        created_at: "2026-01-01T00:00:00Z",
      },
      latest_revision_id: "r3",
      accepted_revision_id: "r2",
      baseline_id: "b1",
      has_pending_revision: true,
    },
  ]);
  vi.spyOn(api, "bimSnapshot").mockImplementation(
    async (_project, source, revision) => ({
      project_id: "project",
      source_id: source,
      revision_id: revision,
      ifc_schema: "IFC4",
      imported_at: "2026-01-01T00:00:00Z",
      import_seconds: 0.1,
      elements: source === "source-1" ? elements : [],
    }),
  );
  vi.spyOn(api, "bimBindings").mockResolvedValue([]);
  const onContext = vi.fn();
  const queryClient = new QueryClient();
  const { rerender } = render(
    <QueryClientProvider client={queryClient}>
      <BimMappingWorkspace
        project="project"
        workPackageId="WP-1"
        initial={{ sourceId: "source-1", revisionId: "r1" }}
        onContext={onContext}
        onInvestigate={() => {}}
      />
    </QueryClientProvider>,
  );
  await waitFor(() =>
    expect(screen.getByLabelText("项目模型")).toHaveTextContent("MEP"),
  );

  const deleted: DTO<"BimElementChange"> = {
    comparison_id: "comparison",
    global_id: "deleted-guid",
    change_kind: "deleted",
    changed_aspects: [],
  };
  rerender(
    <QueryClientProvider client={queryClient}>
      <BimMappingWorkspace
        project="project"
        workPackageId="WP-1"
        initial={{
          sourceId: "source-2",
          fromRevisionId: "r2",
          revisionId: "r3",
          highlightIds: ["deleted-guid"],
          changes: [deleted],
        }}
        onContext={onContext}
        onInvestigate={() => {}}
      />
    </QueryClientProvider>,
  );

  await waitFor(() =>
    expect(screen.getByLabelText("项目模型")).toHaveTextContent("Structure"),
  );
  expect((await screen.findAllByText(/目标版本无几何/))[0]).toBeVisible();
  expect(screen.queryByRole("button", { name: /确认关联/ })).toBeNull();
  await waitFor(() =>
    expect(onContext).toHaveBeenCalledWith(
      "source-2",
      "r3",
      ["deleted-guid"],
      "r2",
      "r3",
      "r2",
    ),
  );
});

function mappingView(wp = "WP-1") {
  vi.spyOn(api, "sourceStatuses").mockResolvedValue([modelSource]);
  vi.spyOn(api, "bimBindings").mockResolvedValue([]);
  vi.spyOn(api, "bimSnapshot").mockResolvedValue({
    project_id: "project",
    source_id: "source-1",
    revision_id: "r1",
    ifc_schema: "IFC4",
    imported_at: "2026-01-01",
    import_seconds: 0,
    elements,
  });
  const cache = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  const props = {
    project: "project",
    workPackageId: wp,
    initial: { sourceId: "source-1", revisionId: "r1" },
    onContext: vi.fn(),
    onInvestigate: vi.fn(),
    onWorkPackage: vi.fn(),
  };
  const result = render(
    <QueryClientProvider client={cache}>
      <BimMappingWorkspace {...props} />
    </QueryClientProvider>,
  );
  return { ...result, props, cache };
}

it("uses one shell and synchronizes geometry, checkbox, list and exact snapshot inspector", async () => {
  const { cache } = mappingView();
  await screen.findByText("Mapping geometry");
  expect(screen.getByText("North floor")).toBeVisible();
  expect(document.querySelectorAll(".pane-split")).toHaveLength(1);
  expect(viewer.props?.mapping?.candidateIds).toEqual(
    elements.map((item) => item.global_id),
  );
  const file = viewer.props!.file;
  act(() => viewer.props!.onSelected("12345"));
  expect(
    screen.getByRole("button", { name: "确认关联 0 个构件" }),
  ).toBeDisabled();
  act(() => viewer.props!.onSelected("wall-l02"));
  expect(
    screen.getAllByRole("checkbox", { name: "关联 Wall" })[0],
  ).toBeChecked();
  expect(viewer.props!.focusId).toBe("wall-l02");
  expect(viewer.props!.mapping!.selectedIds).toEqual(["wall-l02"]);
  fireEvent.click(screen.getByRole("button", { name: "技术详情" }));
  expect(screen.getByText("Current wall")).toBeVisible();
  act(() => viewer.props!.onProperties?.({ FireRating: "STALE" }, "wall-l02"));
  expect(screen.queryByText("STALE")).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: /Duct IfcDuctSegment/ }));
  expect(screen.getByRole("checkbox", { name: "关联 Duct" })).toBeChecked();
  expect(viewer.props!.focusId).toBe("duct-l02");
  const inspector = screen.getByRole("complementary", { name: "构件详情" });
  expect(within(inspector).getAllByText("IfcDuctSegment")[0]).toBeVisible();
  fireEvent.click(screen.getByRole("button", { name: "清除选择" }));
  expect(viewer.props!.mapping!.selectedIds).toEqual([]);
  expect(viewer.props!.file).toBe(file);
  expect(fetch).toHaveBeenCalledTimes(1);
  cache.clear();
});

it("captures submitted count, blocks duplicate confirmation and fences a pending request when WP changes", async () => {
  let finish!: (
    value: Awaited<ReturnType<typeof api.confirmBimBindings>>,
  ) => void;
  const confirm = vi.spyOn(api, "confirmBimBindings").mockImplementation(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  const { cache, props, rerender } = mappingView();
  const invalidate = vi.spyOn(cache, "invalidateQueries");
  await screen.findByText("Mapping geometry");
  fireEvent.click(screen.getByRole("checkbox", { name: "关联 Duct" }));
  const button = screen.getByRole("button", { name: "确认关联 1 个构件" });
  fireEvent.click(button);
  fireEvent.click(button);
  await waitFor(() => expect(confirm).toHaveBeenCalledTimes(1));
  expect(confirm).toHaveBeenCalledWith("project", "source-1", {
    revision_id: "r1",
    bindings: [{ work_package_id: "WP-1", global_ids: ["duct-l02"] }],
  });
  rerender(
    <QueryClientProvider client={cache}>
      <BimMappingWorkspace {...props} workPackageId="WP-2" />
    </QueryClientProvider>,
  );
  expect(
    screen.getByRole("button", { name: "确认关联 0 个构件" }),
  ).toBeDisabled();
  await act(async () => finish([]));
  await waitFor(() =>
    expect(invalidate).toHaveBeenCalledWith({
      queryKey: ["workspace", "project"],
    }),
  );
  expect(invalidate).toHaveBeenCalledWith({
    queryKey: ["bim-bindings", "project", "source-1"],
  });
  expect(screen.queryByText(/已关联/)).toBeNull();
  cache.clear();
});

it("reports the submitted count after the user clears the live selection", async () => {
  vi.spyOn(api, "confirmBimBindings").mockResolvedValue([]);
  const { cache } = mappingView();
  await screen.findByText("Mapping geometry");
  fireEvent.click(screen.getByRole("checkbox", { name: "关联 Duct" }));
  fireEvent.click(screen.getByRole("button", { name: "确认关联 1 个构件" }));
  await screen.findByText("已关联 1 个构件。");
  fireEvent.click(screen.getByRole("button", { name: "清除选择" }));
  expect(screen.getByText("已关联 1 个构件。")).toBeVisible();
  cache.clear();
});

it("keeps deleted elements inspectable with actual pair labels and no stale index or geometry properties", async () => {
  const { cache, props, rerender } = mappingView();
  vi.mocked(api.bim).mockResolvedValue([
    {
      id: "deleted-guid",
      name: "Stale name",
      type: "IfcWall",
      storey: "Old floor",
      space: "Old system",
      properties: { FireRating: "OLD" },
      related_ids: [],
      revision: "OLD",
      ifc_schema: "IFC4",
    },
  ]);
  await screen.findByText("Mapping geometry");
  act(() =>
    viewer.props!.onProperties?.({ Name: "Previous selection" }, "wall-l02"),
  );
  rerender(
    <QueryClientProvider client={cache}>
      <BimMappingWorkspace
        {...props}
        initial={{
          sourceId: "source-1",
          revisionId: "r1",
          revisionLabel: "R19 target",
          fromRevisionId: "r0",
          fromRevisionLabel: "R17 baseline",
          highlightIds: ["deleted-guid"],
          changes: [
            {
              comparison_id: "c1",
              global_id: "deleted-guid",
              change_kind: "deleted",
              changed_aspects: ["geometry"],
            },
          ],
        }}
      />
    </QueryClientProvider>,
  );
  const inspector = screen.getByRole("complementary", { name: "构件详情" });
  expect(within(inspector).getAllByText("R19 target")[0]).toBeVisible();
  expect(within(inspector).getByText("R17 baseline")).toBeVisible();
  expect(within(inspector).getByText(/当前版本无构件属性/)).toBeVisible();
  expect(within(inspector).queryByText("Previous selection")).toBeNull();
  expect(within(inspector).queryByText("Old floor")).toBeNull();
  expect(screen.queryByRole("button", { name: /确认关联/ })).toBeNull();
  cache.clear();
});

it("intersects rendered filters and keeps candidate, selected and active targets independent", async () => {
  const { cache } = mappingView();
  await screen.findByText("Mapping geometry");
  fireEvent.click(screen.getByRole("checkbox", { name: "关联 Duct" }));
  fireEvent.change(screen.getByLabelText("楼层"), { target: { value: "L02" } });
  fireEvent.change(screen.getByLabelText("空间"), { target: { value: "Lab" } });
  fireEvent.change(screen.getByLabelText("IFC 类型"), {
    target: { value: "IfcWall" },
  });
  expect(viewer.props!.mapping!.candidateIds).toEqual(["wall-l02"]);
  expect(viewer.props!.mapping!.selectedIds).toEqual(["duct-l02"]);
  expect(viewer.props!.focusId).toBe("duct-l02");
  expect(screen.getByText("1 个候选构件 · 已选 1")).toBeVisible();
  cache.clear();
});

it("resets selection across source, revision and project changes and never enables binding in impact mode", async () => {
  const { cache, props, rerender } = mappingView();
  await screen.findByText("Mapping geometry");
  vi.mocked(api.sourceStatuses).mockResolvedValue([
    modelSource,
    {
      ...modelSource,
      source: { ...modelSource.source, id: "source-2", name: "Structure" },
      latest_revision_id: "r2",
    },
  ]);
  vi.mocked(api.bimSnapshot).mockImplementation(
    async (project, source, revision) => ({
      project_id: project,
      source_id: source,
      revision_id: revision,
      ifc_schema: "IFC4",
      imported_at: "2026-01-01",
      import_seconds: 0,
      elements: elements.map((item) => ({ ...item, revision_id: revision })),
    }),
  );
  await act(async () => {
    await cache.invalidateQueries({ queryKey: ["sources", "project"] });
  });
  await screen.findByRole("option", { name: "Structure" });
  await screen.findByText("Mapping geometry");
  fireEvent.click(screen.getByRole("checkbox", { name: "关联 Duct" }));
  fireEvent.change(screen.getByLabelText("项目模型"), {
    target: { value: "source-2" },
  });
  await waitFor(() => expect(viewer.props!.mapping!.selectedIds).toEqual([]));
  expect(
    screen.getByRole("button", { name: "确认关联 0 个构件" }),
  ).toBeDisabled();
  rerender(
    <QueryClientProvider client={cache}>
      <BimMappingWorkspace
        {...props}
        initial={{ sourceId: "source-1", revisionId: "r0" }}
      />
    </QueryClientProvider>,
  );
  await waitFor(() => expect(viewer.props!.mapping!.selectedIds).toEqual([]));
  rerender(
    <QueryClientProvider client={cache}>
      <BimMappingWorkspace {...props} project="another-project" />
    </QueryClientProvider>,
  );
  await waitFor(() => expect(viewer.props!.mapping!.selectedIds).toEqual([]));
  rerender(
    <QueryClientProvider client={cache}>
      <BimMappingWorkspace
        {...props}
        initial={{
          sourceId: "source-1",
          revisionId: "r1",
          fromRevisionId: "r0",
        }}
      />
    </QueryClientProvider>,
  );
  fireEvent.change(screen.getByLabelText("项目模型"), {
    target: { value: "source-2" },
  });
  expect(screen.queryByRole("button", { name: /确认关联/ })).toBeNull();
  cache.clear();
});

it("keeps more than 200 visible candidates out of Agent scope until explicitly selected", async () => {
  const { cache, props } = mappingView();
  await screen.findByText("Mapping geometry");
  const manyElements = Array.from({ length: 201 }, (_, i) => ({
    ...elements[0],
    global_id: `wall-${i}`,
    name: `Wall ${i}`,
  }));
  act(() =>
    cache.setQueryData(["bim-snapshot", "project", "source-1", "r1"], {
      project_id: "project",
      source_id: "source-1",
      revision_id: "r1",
      ifc_schema: "IFC4",
      imported_at: "2026-01-01",
      import_seconds: 0,
      elements: manyElements,
    }),
  );
  await screen.findByText("201 个候选构件 · 已选 0");
  expect(props.onContext).toHaveBeenLastCalledWith(
    "source-1",
    "r1",
    [],
    undefined,
    undefined,
    undefined,
  );
  const investigate = screen.getByRole("button", { name: "调查当前选择" });
  expect(investigate).toBeDisabled();
  fireEvent.click(screen.getByRole("checkbox", { name: "关联 Wall 0" }));
  expect(props.onContext).toHaveBeenLastCalledWith(
    "source-1",
    "r1",
    ["wall-0"],
    undefined,
    undefined,
    undefined,
  );
  fireEvent.click(investigate);
  expect(props.onInvestigate).toHaveBeenLastCalledWith(
    "source-1",
    "r1",
    ["wall-0"],
    undefined,
  );
  props.onInvestigate.mockClear();
  fireEvent.click(screen.getByRole("button", { name: "选择全部" }));
  expect(viewer.props!.mapping!.selectedIds).toHaveLength(201);
  expect(props.onContext.mock.calls.at(-1)?.[2]).toHaveLength(201);
  expect(investigate).toBeDisabled();
  expect(screen.getByText(/最多.*200.*构件/)).toBeVisible();
  fireEvent.click(investigate);
  expect(props.onInvestigate).not.toHaveBeenCalled();
  // The full binding selection is retained. Removing one element permits the exact 200.
  fireEvent.click(screen.getByRole("checkbox", { name: "关联 Wall 200" }));
  expect(investigate).toBeEnabled();
  fireEvent.click(investigate);
  expect(props.onInvestigate.mock.calls.at(-1)?.[2]).toEqual(
    manyElements.slice(0, 200).map((item) => item.global_id),
  );
  fireEvent.click(screen.getByRole("button", { name: "清除选择" }));
  expect(props.onContext).toHaveBeenLastCalledWith(
    "source-1",
    "r1",
    [],
    undefined,
    undefined,
    undefined,
  );
  expect(investigate).toBeDisabled();
  cache.clear();
});

it("preserves the defined inspection impact scope and blocks oversized investigation without truncation", async () => {
  const { cache, props, rerender } = mappingView();
  await screen.findByText("Mapping geometry");
  const highlightIds = Array.from({ length: 201 }, (_, i) => `impacted-${i}`);
  rerender(
    <QueryClientProvider client={cache}>
      <BimMappingWorkspace
        {...props}
        initial={{
          intent: "inspect",
          sourceId: "source-1",
          fromRevisionId: "r0",
          revisionId: "r1",
          highlightIds,
        }}
      />
    </QueryClientProvider>,
  );
  await waitFor(() =>
    expect(props.onContext).toHaveBeenLastCalledWith(
      "source-1",
      "r1",
      highlightIds,
      "r0",
      "r1",
      "r0",
    ),
  );
  const investigate = screen.getByRole("button", { name: "调查当前选择" });
  expect(investigate).toBeDisabled();
  expect(screen.getByText(/最多.*200.*构件/)).toBeVisible();
  fireEvent.click(investigate);
  expect(props.onInvestigate).not.toHaveBeenCalled();
  cache.clear();
});
