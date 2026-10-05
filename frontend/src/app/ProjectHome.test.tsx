import type { ComponentProps } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import fixture from "../../tests/fixtures/inspector.json";
import {
  api,
  type DTO,
  type ProjectSourceStatus,
  type Workspace,
} from "../api/client";
import {
  demoAreaName,
  demoDiscipline,
  demoWorkPackageName,
} from "../ui/demo/demoPresentation";
import { statusLabel } from "../ui/labels";
import { ProjectStage, projectNavigatorItems } from "./ProjectStage";
import { donorButton } from "../../tests/donor-dom";

// ProjectHome was retired; the project stage now owns these engineering facts.
afterEach(() => vi.restoreAllMocks());

const model: ProjectSourceStatus = {
  source: {
    id: "model",
    project_id: fixture.waiting.state.project.id,
    name: "MEP",
    kind: "BIM",
    created_at: "2026-01-01T00:00:00Z",
  },
  latest_revision_id: "r2",
  accepted_revision_id: "r1",
  baseline_id: "b1",
  has_pending_revision: true,
};

function mount(
  data: Workspace,
  overrides: Partial<ComponentProps<typeof ProjectStage>> = {},
) {
  vi.spyOn(api, "baselines").mockResolvedValue([]);
  vi.spyOn(api, "engineeringFindings").mockResolvedValue([]);
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  const props = {
    project: data.state.project.id,
    data,
    sources: [],
    object: null,
    perform: vi.fn(async () => {}),
    onOpen: vi.fn(),
    onSource: vi.fn(),
    onWorkPackage: vi.fn(),
    onTab: vi.fn(),
    onRecheck: vi.fn(),
    onStructure: vi.fn(),
    onOpenFinding: vi.fn(),
    ...overrides,
  } satisfies ComponentProps<typeof ProjectStage>;
  const content = () => (
    <QueryClientProvider client={client}>
      <ProjectStage {...props} />
    </QueryClientProvider>
  );
  const view = render(content());
  return { props, refresh: () => view.rerender(content()) };
}

it("keeps each package's real facts and opens its exact identity", () => {
  const data = structuredClone(fixture.waiting) as unknown as Workspace;
  const { props } = mount(data);
  const list = within(screen.getByRole("region", { name: "项目工程状态" }));
  for (const wp of data.state.work_packages) {
    const name = demoWorkPackageName(wp.id, wp.name);
    const row = list.getByRole("button", { name: new RegExp(name) });
    const area = data.state.areas.find((item) => item.id === wp.area_id);
    expect(row).toHaveTextContent(
      `${demoAreaName(wp.area_id, area?.name ?? wp.area_id)} · ${demoDiscipline(wp.discipline)} · ${wp.element_ids.length} 构件`,
    );
    expect(row).toHaveTextContent(
      statusLabel(
        data.analysis?.readiness.find((item) => item.work_package_id === wp.id)
          ?.status ?? "UNCHECKED",
      ),
    );
    row.focus();
    expect(row).toHaveFocus();
    fireEvent.click(row);
    expect(props.onWorkPackage).toHaveBeenLastCalledWith(wp.id);
  }
  expect(props.onWorkPackage).toHaveBeenCalledTimes(
    data.state.work_packages.length,
  );
  expect(props.onRecheck).not.toHaveBeenCalled();
});

it("does not present stale, unchecked, or empty packages as ready", () => {
  const data = structuredClone(fixture.waiting) as unknown as Workspace;
  data.analysis!.readiness = data.analysis!.readiness.map((item) => ({
    ...item,
    status: "READY",
  }));
  data.stale = true;
  const { refresh, props } = mount(data);
  const stage = screen.getByRole("main", { name: "项目" });
  expect(stage).toHaveTextContent("需要重新检查");
  expect(within(stage).queryByText("就绪")).toBeNull();
  for (const wp of data.state.work_packages) {
    expect(
      within(stage).getByRole("button", {
        name: new RegExp(demoWorkPackageName(wp.id, wp.name)),
      }),
    ).toHaveTextContent("需要重新检查");
  }
  fireEvent.click(screen.getByRole("button", { name: "重新检查" }));
  expect(props.onRecheck).toHaveBeenCalledOnce();

  data.stale = false;
  data.analysis = null;
  refresh();
  expect(stage).toHaveTextContent("尚未检查");
  for (const wp of data.state.work_packages) {
    expect(
      within(stage).getByRole("button", {
        name: new RegExp(demoWorkPackageName(wp.id, wp.name)),
      }),
    ).toHaveTextContent("未检查");
  }
  expect(within(stage).queryByText("就绪")).toBeNull();

  data.state.work_packages = [];
  refresh();
  expect(stage).toHaveTextContent("还没有工作包。");
  expect(within(stage).queryByText("就绪")).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "项目结构" }));
  expect(props.onStructure).toHaveBeenCalledOnce();
});

it("preserves a full long package name and does not trigger unrelated navigation", () => {
  const data = structuredClone(fixture.waiting) as unknown as Workspace;
  const wp = data.state.work_packages[0];
  wp.id = "custom-package";
  wp.name =
    "Level 02 east-wing coordinated mechanical installation with a deliberately long real object name";
  const { props } = mount(data, { sources: [model] });
  fireEvent.click(screen.getByRole("button", { name: new RegExp(wp.name) }));
  expect(props.onWorkPackage).toHaveBeenCalledExactlyOnceWith(wp.id);
  expect(screen.getByText(wp.name)).toBeVisible();
  expect(props.onSource).not.toHaveBeenCalled();
  expect(props.onTab).not.toHaveBeenCalled();
});

it("keeps pending model review separate from stale construction judgments", () => {
  const data = structuredClone(fixture.waiting) as unknown as Workspace;
  data.stale = true;
  data.analysis = null;
  const { props } = mount(data, { sources: [model] });
  expect(screen.getByRole("main")).toHaveTextContent("1 份模型待确认");
  expect(screen.getByRole("main")).toHaveTextContent("需要重新检查");
  const source = screen.getByRole("button", {
    name: /MEP IFC 模型 · 最新版本 待确认/,
  });
  fireEvent.click(source);
  expect(props.onSource).toHaveBeenCalledExactlyOnceWith("model");
  expect(props.onRecheck).not.toHaveBeenCalled();
});

it("offers project ingestion when no model exists without treating a local preview as a project model", () => {
  const data = structuredClone(fixture.waiting) as unknown as Workspace;
  const { props } = mount(data);
  expect(screen.getByRole("main")).toHaveTextContent("无项目模型");
  expect(screen.getByText(/还没有资料。添加 IFC/)).toBeVisible();
  fireEvent.click(screen.getByRole("button", { name: "添加资料" }));
  expect(props.onTab).toHaveBeenCalledExactlyOnceWith("sources");
  expect(props.onRecheck).not.toHaveBeenCalled();
});

it("builds navigator rows only from real sources and work packages, not legacy revision tokens", () => {
  const data = structuredClone(fixture.waiting) as unknown as Workspace;
  const items = projectNavigatorItems({ data, sources: [model] });
  expect(items.map((item) => item.key)).toEqual([
    "source:model",
    ...data.state.work_packages.map((wp) => `work-package:${wp.id}`),
  ]);
  expect(items[0]).toMatchObject({
    label: "MEP",
    file: "IFC 模型 · 最新版本 · 待确认",
  });
  data.state.work_packages = [];
  expect(projectNavigatorItems({ data, sources: [] })).toEqual([]);
});

it("opens a selected historical revision through the real source register and history without substituting latest", async () => {
  const data = structuredClone(fixture.waiting) as unknown as Workspace;
  const revisions: DTO<"ProjectSourceRevision">[] = [1, 2].map((sequence) => ({
    id: `r${sequence}`,
    project_id: data.state.project.id,
    source_id: "model",
    sequence,
    original_filename: `model-r${sequence}.ifc`,
    external_label: null,
    sha256: "a".repeat(64),
    media_type: "application/x-step",
    size_bytes: 100,
    storage_key: `model/r${sequence}`,
    import_status: "STORED",
    imported_at: "2026-01-01T00:00:00Z",
  }));
  vi.spyOn(api, "capabilities").mockResolvedValue({ capabilities: [] });
  vi.spyOn(api, "sourceStatuses").mockResolvedValue([model]);
  vi.spyOn(api, "sourceRevisions").mockResolvedValue(revisions);
  vi.spyOn(api, "comparisons").mockResolvedValue([]);
  vi.spyOn(api, "revisionImport").mockResolvedValue(null);
  const { props } = mount(data, {
    sources: [model],
    object: { kind: "revision", sourceId: "model", id: "r1" },
  });
  const history = screen.getByRole("region", { name: "资料版本历史" });
  const older = (await within(history).findByText("model-r1.ifc")).closest(
    "article",
  )!;
  const latest = within(history).getByText("model-r2.ifc").closest("article")!;
  expect(older).toHaveClass("is-focused");
  expect(latest).not.toHaveClass("is-focused");
  expect(within(older).getByText("当前基线")).toBeVisible();
  expect(within(latest).getByText("最新 · 待确认")).toBeVisible();
  expect(api.sourceRevisions).toHaveBeenCalledWith(
    data.state.project.id,
    "model",
  );
  await waitFor(() =>
    expect(within(older).getByRole("status")).toHaveTextContent(
      "已上传 · 尚未处理",
    ),
  );
  expect(within(older).queryByRole("button", { name: "查看模型" })).toBeNull();
  expect(props.onRecheck).not.toHaveBeenCalled();
  expect(props.onSource).not.toHaveBeenCalled();
  const register = screen.getByRole("region", { name: "项目资料" });
  await waitFor(() => expect(donorButton("打开 MEP", register)).toBeDefined());
  const open = donorButton("打开 MEP", register)!;
  expect(open).toHaveAttribute("aria-pressed", "true");
  fireEvent.click(open);
  expect(props.onSource).toHaveBeenCalledExactlyOnceWith("model");
});
