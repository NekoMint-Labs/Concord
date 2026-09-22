import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { api, type DTO } from "../api/client";
import {
  BimMappingWorkspace,
  filterBimCandidates,
} from "./BimMappingWorkspace";

const elements = [
  {
    revision_id: "r1",
    global_id: "wall-l02",
    ifc_class: "IfcWall",
    name: "Wall",
    storey: "L02",
    space: "Lab",
    properties: {},
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
    expect(screen.getByLabelText("BIM 来源")).toHaveTextContent("MEP"),
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
    expect(screen.getByLabelText("BIM 来源")).toHaveTextContent("Structure"),
  );
  expect(await screen.findByText(/目标版本无几何/)).toBeVisible();
  expect(screen.queryByRole("button", { name: /确认关联/ })).toBeNull();
  await waitFor(() =>
    expect(onContext).toHaveBeenCalledWith(
      "source-2",
      "r3",
      ["deleted-guid"],
      "r2",
      undefined,
      undefined,
    ),
  );
});
