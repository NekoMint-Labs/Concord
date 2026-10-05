import { useState } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import fixture from "../../tests/fixtures/inspector.json";
import { api, type DTO, type Workspace } from "../api/client";
import { BrowseStage, browseNavigatorItems } from "../app/BrowseStage";
import { ContextInspector } from "../app/ContextInspector";
import { WorkspaceNavigator } from "../app/WorkspaceChrome";
import { stageKey, stageObject, type StageObject } from "../app/stageContracts";
import { ProjectExplorer } from "./ProjectExplorer";

// The former overview/disclosure layout is gone; use the navigator -> stage -> inspector flow.
const data = structuredClone(fixture.waiting) as unknown as Workspace;
const project = data.state.project.id;
const timestamp = "2026-01-01T00:00:00Z";
const documents: DTO<"DocumentMetadata">[] = [
  ["drawing-1", "East-wing drawing.pdf"],
  ["method-2", "Installation method.pdf"],
].map(([id, filename]) => ({
  id,
  project_id: project,
  filename,
  content_hash: `hash-${id}`,
  parser: "Docling",
  created_at: timestamp,
}));
const finding: DTO<"Finding"> = {
  id: "finding-opaque",
  project_id: project,
  work_package_id: "WP-200",
  state: "CONFIRMED",
  snapshot_id: "snapshot",
  title: "Review duct clearance",
  conclusion: "Clearance requires review",
  what_changed: "Duct moved in the issued revision",
  why_it_matters: "Clearance is below the requirement",
  reasoning_summary: "Compare the engineering records",
  confidence: 0.9,
  evidence_ids: ["evidence-opaque"],
  change_ids: [],
  dependencies: [],
  limitations: [],
  suggested_action: "Coordinate route",
  suggested_discipline: "MEP",
  impact: null,
  created_at: timestamp,
  updated_at: timestamp,
};

beforeEach(() => {
  vi.spyOn(api, "documents").mockResolvedValue(documents);
  vi.spyOn(api, "chunks").mockResolvedValue([]);
  vi.spyOn(api, "engineeringFindings").mockResolvedValue([finding]);
  vi.spyOn(api, "engineeringFinding").mockResolvedValue(finding);
});
afterEach(() => vi.restoreAllMocks());

function mount(initial: StageObject | null = null) {
  const onTab = vi.fn();
  const onWorkPackage = vi.fn();
  const onOpenFinding = vi.fn();
  function Host() {
    const [object, setObject] = useState(initial);
    return (
      <>
        <WorkspaceNavigator
          open
          title="浏览"
          label="浏览对象"
          placeholder="搜索对象"
          empty="还没有项目对象"
          emptySearch="没有匹配的项目对象"
          footerLabel="项目资料"
          items={browseNavigatorItems({
            data,
            sources: [],
            documents,
            findings: [finding],
          })}
          current={object ? stageKey(object) : undefined}
          onSelect={(key) => setObject(stageObject(key))}
          onClose={vi.fn()}
          onFooter={() => onTab("project")}
        />
        <BrowseStage
          project={project}
          data={data}
          sources={[]}
          object={object}
          perform={async () => {}}
          onOpen={setObject}
          onTab={onTab}
          onWorkPackage={onWorkPackage}
          onOpenFinding={onOpenFinding}
          onSource={vi.fn()}
          onInvestigate={vi.fn()}
        />
        <ContextInspector
          project={project}
          data={data}
          sources={[]}
          object={object}
          onClose={() => setObject(null)}
          onOpen={setObject}
          onWorkPackage={onWorkPackage}
          onTab={onTab}
        />
      </>
    );
  }
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  render(
    <QueryClientProvider client={client}>
      <Host />
    </QueryClientProvider>,
  );
  return { onTab, onWorkPackage, onOpenFinding };
}

it("opens the exact document from search and replaces the selected document rather than falling back to the first one", async () => {
  const { onTab } = mount();
  expect(
    screen.getByRole("heading", { name: "在导航中选择对象" }),
  ).toBeVisible();
  const navigator = within(
    screen.getByRole("complementary", { name: "浏览对象" }),
  );
  fireEvent.change(navigator.getByRole("textbox"), {
    target: { value: "  INSTALLATION  " },
  });
  expect(
    navigator.queryByRole("button", { name: /East-wing drawing.pdf/ }),
  ).toBeNull();
  const method = navigator.getByRole("button", {
    name: /Installation method.pdf/,
  });
  method.focus();
  expect(method).toHaveFocus();
  fireEvent.click(method);
  expect(
    await screen.findByRole("heading", { name: "Installation method.pdf" }),
  ).toBeVisible();
  expect(api.chunks).toHaveBeenCalledWith("method-2");
  const inspector = screen.getByRole("complementary", { name: "检查器" });
  expect(inspector).toHaveTextContent("文档编号method-2");
  expect(inspector).toHaveTextContent("document:method-2");
  expect(method).toHaveAttribute("aria-current", "page");
  expect(onTab).not.toHaveBeenCalled();

  fireEvent.change(navigator.getByRole("textbox"), {
    target: { value: "drawing" },
  });
  fireEvent.click(
    navigator.getByRole("button", { name: /East-wing drawing.pdf/ }),
  );
  expect(
    await screen.findByRole("heading", { name: "East-wing drawing.pdf" }),
  ).toBeVisible();
  expect(api.chunks).toHaveBeenCalledWith("drawing-1");
  expect(inspector).toHaveTextContent("document:drawing-1");
  expect(
    screen.queryByRole("heading", { name: "Installation method.pdf" }),
  ).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "在文档工作区打开" }));
  expect(onTab).toHaveBeenCalledExactlyOnceWith("documents");
});

it("keeps document loading, failed extraction reads and successful empty content distinct", async () => {
  let reject!: (reason: Error) => void;
  vi.mocked(api.chunks).mockImplementationOnce(
    () =>
      new Promise((_, rejectQuery) => {
        reject = rejectQuery;
      }),
  );
  mount({ kind: "document", id: "method-2" });
  expect(screen.getByText("正在读取文档依据…")).toBeVisible();
  expect(screen.queryByText("当前文档没有解析内容")).toBeNull();
  reject(new Error("Extraction unavailable"));
  expect(await screen.findByRole("alert")).toHaveTextContent("文档依据不可用");
  expect(screen.queryByText("当前文档没有解析内容")).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "关闭检查器" }));
  const navigator = within(
    screen.getByRole("complementary", { name: "浏览对象" }),
  );
  fireEvent.click(
    navigator.getByRole("button", { name: /East-wing drawing.pdf/ }),
  );
  expect(await screen.findByText("当前文档没有解析内容")).toBeVisible();
  expect(screen.queryByRole("alert")).toBeNull();
});

it("opens the persisted Finding in Work and its exact work-package context without changing engineering facts", async () => {
  const before = structuredClone(data);
  const { onWorkPackage, onOpenFinding } = mount();
  const navigator = within(
    screen.getByRole("complementary", { name: "浏览对象" }),
  );
  fireEvent.click(
    navigator.getByRole("button", { name: /Review duct clearance/ }),
  );
  expect(
    await screen.findByRole("heading", { name: finding.title }),
  ).toBeVisible();
  expect(api.engineeringFinding).toHaveBeenCalledWith(project, finding.id);
  const inspector = screen.getByRole("complementary", { name: "检查器" });
  expect(
    await within(inspector).findByText(finding.what_changed),
  ).toBeVisible();
  expect(within(inspector).getByText(finding.suggested_action!)).toBeVisible();
  fireEvent.click(screen.getByRole("button", { name: "在「工作」中打开" }));
  expect(onOpenFinding).toHaveBeenCalledExactlyOnceWith(finding.id);
  fireEvent.click(
    within(inspector).getByRole("button", { name: "在工作面板处理 →" }),
  );
  expect(onWorkPackage).toHaveBeenCalledExactlyOnceWith("WP-200");
  fireEvent.click(
    within(inspector).getByRole("button", { name: "查看工作包上下文 →" }),
  );
  expect(
    await screen.findByRole("heading", { name: "东翼风管安装" }),
  ).toBeVisible();
  expect(inspector).toHaveTextContent("work-package:WP-200");
  const elements = screen.getByRole("region", { name: "关联构件" });
  for (const id of data.state.work_packages.find(
    (item) => item.id === "WP-200",
  )!.element_ids) {
    expect(within(elements).getByText(id)).toBeVisible();
  }
  expect(data).toEqual(before);
});

it("does not invent project inventories or readiness for an empty project", () => {
  const empty = structuredClone(data);
  empty.state.work_packages = [];
  empty.state.sources = [];
  empty.analysis = null;
  expect(browseNavigatorItems({ data: empty, sources: [] })).toEqual([]);
  const onOpen = vi.fn();
  render(
    <ProjectExplorer
      workspace={empty}
      sources={[]}
      onOpen={onOpen}
      onTab={vi.fn()}
    />,
  );
  expect(screen.getByText("0 个项目对象")).toBeVisible();
  expect(screen.queryByRole("region", { name: "工作包" })).toBeNull();
  expect(screen.queryByRole("region", { name: "资料" })).toBeNull();
  expect(screen.queryByText("就绪")).toBeNull();
  expect(onOpen).not.toHaveBeenCalled();
});

it("keeps the retained compact explorer's real source and package targets exact", () => {
  const onOpen = vi.fn();
  const source = {
    source: {
      id: "model",
      project_id: project,
      name: "MEP",
      kind: "BIM" as const,
      created_at: timestamp,
    },
    latest_revision_id: "r2",
    accepted_revision_id: "r1",
    baseline_id: "b1",
    has_pending_revision: true,
  };
  render(
    <ProjectExplorer
      workspace={data}
      sources={[source]}
      onOpen={onOpen}
      onTab={vi.fn()}
    />,
  );
  fireEvent.click(screen.getByRole("button", { name: /^MEP/ }));
  expect(onOpen).toHaveBeenLastCalledWith({ kind: "source", id: "model" });
  fireEvent.click(screen.getByRole("button", { name: /^东翼风管安装/ }));
  expect(onOpen).toHaveBeenLastCalledWith({ kind: "package", id: "WP-200" });
});
