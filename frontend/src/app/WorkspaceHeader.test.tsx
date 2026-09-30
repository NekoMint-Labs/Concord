import { fireEvent, render, screen, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, expect, it, vi } from "vitest";
import fixture from "../../tests/fixtures/inspector.json";
import { api, type DTO, type Workspace } from "../api/client";
import { useProjectSources } from "../features/useProjectSources";
import { useProjectContext } from "./useProjectContext";

afterEach(() => vi.restoreAllMocks());
import { WorkspaceHeader } from "./WorkspaceHeader";

it("carries project and location context without repeating the work package", () => {
  const data = structuredClone(fixture.waiting) as unknown as Workspace;
  const wp = data.state.work_packages.find((item) => item.id === "WP-200")!;
  const onNavigate = vi.fn();
  render(
    <QueryClientProvider
      client={
        new QueryClient({ defaultOptions: { queries: { retry: false } } })
      }
    >
      <WorkspaceHeader data={data} wp={wp} tab="bim" onNavigate={onNavigate} />
    </QueryClientProvider>,
  );

  expect(screen.getByText("A 栋项目")).toBeVisible();
  expect(
    screen.queryByRole("button", { name: "A 栋项目" }),
  ).not.toBeInTheDocument();
  expect(screen.getByText("东翼风管安装")).toBeVisible();
  expect(screen.getByText("L02 东翼")).toBeVisible();
  expect(
    screen.queryByRole("button", { name: "L02 东翼" }),
  ).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "东翼风管安装" }));
  expect(onNavigate).toHaveBeenCalledWith("coordination");
  expect(screen.getByText("模型")).toBeVisible();
  expect(screen.queryByText("WP-200")).not.toBeInTheDocument();

  // Title, status, and actions belong to the coordination workspace.
  expect(
    screen.queryByText("East-wing duct installation"),
  ).not.toBeInTheDocument();
  expect(screen.queryByText("就绪")).not.toBeInTheDocument();
  expect(
    screen.queryByRole("button", { name: /重新检查/ }),
  ).not.toBeInTheDocument();
});

it("updates mounted header and project context revisions after source upload without reload", async () => {
  const data = structuredClone(fixture.waiting) as unknown as Workspace;
  const project = data.state.project.id;
  let latest = "r1";
  const r1 = {
    id: "r1",
    source_id: "model",
    sequence: 1,
  } as DTO<"ProjectSourceRevision">;
  const r2 = {
    id: "r2",
    source_id: "model",
    sequence: 2,
  } as DTO<"ProjectSourceRevision">;
  vi.spyOn(api, "sourceStatuses").mockImplementation(async () => [
    {
      source: {
        id: "model",
        project_id: project,
        name: "MEP",
        kind: "BIM",
        created_at: "2026-01-01",
      },
      latest_revision_id: latest,
      accepted_revision_id: "r1",
      baseline_id: "b1",
      has_pending_revision: latest === "r2",
    },
  ]);
  vi.spyOn(api, "sourceRevisions").mockImplementation(async () =>
    latest === "r1" ? [r1] : [r1, r2],
  );
  vi.spyOn(api, "baselines").mockResolvedValue([]);
  vi.spyOn(api, "documents").mockResolvedValue([]);
  vi.spyOn(api, "comparisons").mockResolvedValue([]);
  const upload = vi
    .spyOn(api, "uploadRevision")
    .mockImplementation(async () => {
      latest = "r2";
      return { revision: r2, duplicate: false };
    });
  const file = new File(["IFC"], "revision.ifc");
  function SourceFlow() {
    const source = useProjectSources(project, "model");
    const context = useProjectContext(project, source.sources.data ?? []);
    return (
      <>
        <button
          onClick={() =>
            source.upload.mutate({ source: "model", file, label: "Revision 2" })
          }
        >
          Upload revision
        </button>
        <output aria-label="Project context revision">
          {context.revisionNo(0, latest)}
        </output>
      </>
    );
  }
  render(
    <QueryClientProvider
      client={
        new QueryClient({
          defaultOptions: { queries: { retry: false, gcTime: 0 } },
        })
      }
    >
      <WorkspaceHeader data={data} tab="bim" />
      <SourceFlow />
    </QueryClientProvider>,
  );
  const header = within(screen.getByRole("banner"));
  expect(await header.findByText("R1", { exact: true })).toBeVisible();
  fireEvent.click(screen.getByRole("button", { name: "Upload revision" }));
  expect(await header.findByText("R2", { exact: true })).toBeVisible();
  expect(screen.getByLabelText("Project context revision")).toHaveTextContent(
    "R2",
  );
  expect(header.getByText("新版本待审核")).toBeVisible();
  expect(upload).toHaveBeenCalledWith(project, "model", file, "Revision 2");
});
