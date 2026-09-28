import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { api } from "../api/client";
import { WorkPackageModelContext } from "./WorkPackageModelContext";

vi.mock("../viewers/IFCViewer", () => ({
  default: ({ file }: { file: File }) => <div>IFC viewer: {file.name}</div>,
}));

afterEach(() => vi.restoreAllMocks());

it("uses the authenticated project IFC and names linked elements without exposing IDs", async () => {
  vi.spyOn(api, "sourceStatuses").mockResolvedValue([]);
  vi.spyOn(api, "bim").mockResolvedValue([
    {
      id: "gid-1",
      name: "Beam 01",
      type: "IfcBeam",
      storey: "L02",
      space: "Structure",
      properties: {},
      related_ids: [],
      revision: "R17",
      ifc_schema: "IFC4",
    },
  ]);
  vi.spyOn(globalThis, "fetch").mockResolvedValue(
    new Response(new Blob(["IFC"]), { status: 200 }),
  );
  const cache = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });

  render(
    <QueryClientProvider client={cache}>
      <WorkPackageModelContext
        project="project"
        elementIds={["gid-1"]}
        impacted={["gid-1"]}
        revision="R17"
        onOpenModel={vi.fn()}
      />
    </QueryClientProvider>,
  );

  expect(
    await screen.findByText("IFC viewer: project-import.ifc"),
  ).toBeVisible();
  expect(screen.getByText("Beam 01")).toBeVisible();
  expect(screen.queryByText("gid-1")).toBeNull();
  expect(screen.getByText("1 个关联构件受到影响")).toBeVisible();
  cache.clear();
});

it("shows confirmed project bindings on the work package even when the legacy element list is empty", async () => {
  vi.spyOn(api, "sourceStatuses").mockResolvedValue([
    {
      source: {
        id: "model",
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
  ]);
  vi.spyOn(api, "bim").mockResolvedValue([]);
  vi.spyOn(api, "bimSnapshot").mockResolvedValue({
    project_id: "project",
    source_id: "model",
    revision_id: "r1",
    ifc_schema: "IFC4",
    imported_at: "2026-01-01T00:00:00Z",
    import_seconds: 0.1,
    elements: [
      {
        revision_id: "r1",
        global_id: "gid-1",
        ifc_class: "IfcDuctSegment",
        name: "Supply duct",
        storey: "L02",
        space: "Plant",
        properties: {},
      },
    ],
  });
  vi.spyOn(api, "bimBindings").mockResolvedValue([
    {
      binding: {
        id: "binding",
        project_id: "project",
        source_id: "model",
        work_package_id: "WP-1",
        global_id: "gid-1",
        confirmation_revision_id: "r1",
        evidence_id: "e1",
        origin: "human_confirmed",
        confirmed_by: "tester",
        created_at: "2026-01-01T00:00:00Z",
        retired_at: null,
      },
      revision_id: "r1",
      state: "present",
      element: null,
    },
  ]);
  vi.spyOn(globalThis, "fetch").mockResolvedValue(
    new Response(new Blob(["IFC"]), { status: 200 }),
  );
  const onOpenModel = vi.fn();
  const cache = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  render(
    <QueryClientProvider client={cache}>
      <WorkPackageModelContext
        project="project"
        workPackageId="WP-1"
        elementIds={[]}
        impacted={[]}
        revision="R1"
        onOpenModel={onOpenModel}
      />
    </QueryClientProvider>,
  );
  expect(await screen.findByText("Supply duct")).toBeVisible();
  expect(screen.getByRole("heading", { name: "1 个关联构件" })).toBeVisible();
  expect(
    screen.queryByText("当前工作包尚未关联 BIM 构件。"),
  ).not.toBeInTheDocument();
  cache.clear();
});

it("keeps a deleted confirmed component visible as an affected work-package change", async () => {
  vi.spyOn(api, "sourceStatuses").mockResolvedValue([
    {
      source: {
        id: "model",
        project_id: "project",
        name: "MEP",
        kind: "BIM",
        created_at: "2026-01-01T00:00:00Z",
      },
      latest_revision_id: "r2",
      accepted_revision_id: "r1",
      baseline_id: "b1",
      has_pending_revision: true,
    },
  ]);
  vi.spyOn(api, "bim").mockResolvedValue([]);
  vi.spyOn(api, "bimSnapshot").mockResolvedValue({
    project_id: "project",
    source_id: "model",
    revision_id: "r2",
    ifc_schema: "IFC4",
    imported_at: "2026-01-02T00:00:00Z",
    import_seconds: 0.1,
    elements: [],
  });
  vi.spyOn(api, "bimBindings").mockResolvedValue([
    {
      binding: {
        id: "binding",
        project_id: "project",
        source_id: "model",
        work_package_id: "WP-1",
        global_id: "deleted-id",
        confirmation_revision_id: "r1",
        evidence_id: "e1",
        origin: "human_confirmed",
        confirmed_by: "tester",
        created_at: "2026-01-01T00:00:00Z",
        retired_at: null,
      },
      revision_id: "r2",
      state: "missing",
      element: null,
    },
  ]);
  vi.spyOn(api, "comparisons").mockResolvedValue([
    { id: "c1", from_revision_id: "r1", to_revision_id: "r2" },
  ] as Awaited<ReturnType<typeof api.comparisons>>);
  vi.spyOn(api, "comparison").mockResolvedValue({
    affected_work_packages: [
      {
        work_package_id: "WP-1",
        changes: [{ global_id: "deleted-id", change_kind: "deleted" }],
      },
    ],
  } as Awaited<ReturnType<typeof api.comparison>>);
  vi.spyOn(globalThis, "fetch").mockResolvedValue(
    new Response(new Blob(["IFC"]), { status: 200 }),
  );
  const cache = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  render(
    <QueryClientProvider client={cache}>
      <WorkPackageModelContext
        project="project"
        workPackageId="WP-1"
        elementIds={[]}
        impacted={[]}
        revision=""
        onOpenModel={vi.fn()}
      />
    </QueryClientProvider>,
  );
  expect(await screen.findByText("1 个关联构件受到影响")).toBeVisible();
  expect(screen.getByText("此版本已删除的构件")).toBeVisible();
  expect(screen.getByText(/新版本待审核/)).toBeVisible();
  cache.clear();
});
