import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { api } from "../api/client";
import { WorkPackageModelContext } from "./WorkPackageModelContext";

vi.mock("../viewers/IFCViewer", () => ({
  default: ({ file }: { file: File }) => <div>IFC viewer: {file.name}</div>,
}));

afterEach(() => vi.restoreAllMocks());

it("uses the authenticated project IFC and keeps linked GlobalIds visible", async () => {
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
  expect(screen.getByText("gid-1")).toBeVisible();
  expect(screen.getByText("1 个关联构件受到影响")).toBeVisible();
  cache.clear();
});
