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
import { api, type DTO, type Workspace } from "../api/client";
import { WorkPanel } from "./WorkPanel";

afterEach(() => vi.restoreAllMocks());

function cache() {
  return new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
}

function finding(
  id: string,
  state: DTO<"Finding">["state"] = "PROPOSED",
): DTO<"Finding"> {
  return {
    id,
    project_id: "harbor-east",
    state,
    snapshot_id: "snapshot-2",
    work_package_id: "WP-200",
    title: `Finding ${id}`,
    conclusion: "Measured coordination issue",
    what_changed: "Duct moved in the latest revision",
    why_it_matters: "Clearance needs review",
    evidence_ids: ["evidence-1"],
    reasoning_summary: "Compare the current source evidence",
    confidence: 0.9,
    limitations: [],
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
    impact: null,
    change_ids: [],
    dependencies: [],
    suggested_action: "Coordinate the route",
    suggested_discipline: "MEP",
  };
}

function renderList(
  workspace = structuredClone(fixture.waiting) as unknown as Workspace,
) {
  return render(
    <QueryClientProvider client={cache()}>
      <WorkPanel
        workspace={workspace}
        sources={[]}
        onPackage={vi.fn()}
        onModels={vi.fn()}
        onRecheck={vi.fn()}
        onReport={vi.fn()}
        onProject={vi.fn()}
      />
    </QueryClientProvider>,
  );
}

it("combines opaque Finding IDs and project decisions in one queue", async () => {
  vi.spyOn(api, "baselines").mockResolvedValue([]);
  vi.spyOn(api, "documents").mockResolvedValue([]);
  vi.spyOn(api, "engineeringFindings").mockResolvedValue([
    finding("finding/opaque-73"),
    finding("finding-done", "CLOSED"),
  ]);
  const onFindingSelect = vi.fn();
  const onSelectionChange = vi.fn();
  render(
    <QueryClientProvider client={cache()}>
      <WorkPanel
        workspace={structuredClone(fixture.waiting) as unknown as Workspace}
        sources={[]}
        onPackage={vi.fn()}
        onModels={vi.fn()}
        onRecheck={vi.fn()}
        onReport={vi.fn()}
        onProject={vi.fn()}
        onFindingSelect={onFindingSelect}
        onSelectionChange={onSelectionChange}
      />
    </QueryClientProvider>,
  );

  expect(
    await screen.findByRole("button", { name: /Finding finding\/opaque-73/ }),
  ).toBeVisible();
  expect(screen.getByText("5")).toBeVisible();
  fireEvent.click(
    screen.getByRole("button", { name: /Finding finding\/opaque-73/ }),
  );
  expect(onFindingSelect).toHaveBeenCalledWith("finding/opaque-73");
  expect(
    screen.getByRole("button", { name: /Finding finding\/opaque-73/ }),
  ).toHaveAttribute("aria-pressed", "true");
  expect(onSelectionChange).toHaveBeenLastCalledWith({
    kind: "finding",
    id: "finding/opaque-73",
  });

  fireEvent.click(screen.getByRole("button", { name: "已处理" }));
  expect(
    screen.getByRole("button", { name: /Finding finding-done/ }),
  ).toBeVisible();
  await waitFor(() =>
    expect(
      screen.queryByRole("button", { name: /Finding finding\/opaque-73/ }),
    ).not.toBeInTheDocument(),
  );
});

it("keeps a selected work receipt in place and routes its authoritative action", async () => {
  vi.spyOn(api, "baselines").mockResolvedValue([]);
  vi.spyOn(api, "documents").mockResolvedValue([]);
  const workspace = structuredClone(fixture.waiting) as unknown as Workspace;
  const onPackage = vi.fn();
  render(
    <QueryClientProvider client={cache()}>
      <WorkPanel
        workspace={workspace}
        sources={[]}
        onPackage={onPackage}
        onModels={vi.fn()}
        onRecheck={vi.fn()}
        onReport={vi.fn()}
        onProject={vi.fn()}
      />
    </QueryClientProvider>,
  );

  const row = screen.getByRole("button", { name: /东翼风管安装/ });
  fireEvent.click(row);
  const receipt = screen.getByRole("region", { name: "所选工作事项" });
  expect(receipt).toHaveTextContent("为什么需要处理");
  expect(receipt).toHaveTextContent("验收尚未通过");
  fireEvent.click(within(receipt).getByRole("button", { name: "处理" }));
  expect(onPackage).toHaveBeenCalledWith("WP-200");

  workspace.stale = true;
  expect(screen.getByRole("button", { name: /东翼风管安装/ })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
});

it("uses donor controls for search and bounded paging", async () => {
  vi.spyOn(api, "baselines").mockResolvedValue([]);
  vi.spyOn(api, "documents").mockResolvedValue([]);
  vi.spyOn(api, "engineeringFindings").mockResolvedValue([]);
  const workspace = structuredClone(fixture.waiting) as unknown as Workspace;
  renderList(workspace);
  fireEvent.click(screen.getByRole("button", { name: /东翼风管安装/ }));
  expect(screen.getByRole("region", { name: "所选工作事项" })).toBeVisible();

  const search = screen.getByRole("textbox", { name: "搜索工作" });
  expect(search).toBeInstanceOf(HTMLInputElement);
  fireEvent.change(search, { target: { value: "结构交接" } });
  await waitFor(() => {
    expect(screen.getByRole("button", { name: /结构交接/ })).toBeVisible();
    expect(
      screen.queryByRole("button", { name: /东翼风管安装/ }),
    ).not.toBeInTheDocument();
  });
  expect(screen.getByText(/项匹配/)).toHaveTextContent(
    "显示 1 项 · 共 1 项匹配",
  );
  expect(screen.queryByRole("region", { name: "所选工作事项" })).toBeNull();
  fireEvent.change(search, { target: { value: "" } });
  await waitFor(() => {
    expect(
      screen.getByRole("region", { name: "所选工作事项" }),
    ).toHaveTextContent("东翼风管安装");
    expect(
      screen.getByRole("button", { name: /东翼风管安装/ }),
    ).toHaveAttribute("aria-pressed", "true");
  });
});

it("retries failed Findings reads without replacing the project queue", async () => {
  vi.spyOn(api, "baselines").mockResolvedValue([]);
  vi.spyOn(api, "documents").mockResolvedValue([]);
  const read = vi
    .spyOn(api, "engineeringFindings")
    .mockRejectedValueOnce(new Error("Findings service unavailable"))
    .mockResolvedValueOnce([finding("recovered")]);
  renderList();

  expect(await screen.findByRole("alert")).toHaveTextContent(
    "Findings service unavailable",
  );
  const retry = screen.getByRole("button", { name: "重试读取 Findings" });
  expect(retry).toBeInstanceOf(HTMLButtonElement);
  expect(retry).toBeEnabled();
  expect(screen.getByRole("button", { name: /东翼风管安装/ })).toBeVisible();
  fireEvent.click(retry);

  expect(
    await screen.findByRole("button", { name: /Finding recovered/ }),
  ).toBeVisible();
  expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  expect(read).toHaveBeenCalledTimes(2);
  expect(read).toHaveBeenLastCalledWith("harbor-east");
});

it("keeps confirmed but unresolved Findings in pending work, never the handled filter", async () => {
  vi.spyOn(api, "baselines").mockResolvedValue([]);
  vi.spyOn(api, "documents").mockResolvedValue([]);
  vi.spyOn(api, "engineeringFindings").mockResolvedValue([
    finding("unresolved-confirmed", "CONFIRMED"),
    finding("human-closed", "CLOSED"),
  ]);
  renderList();
  await screen.findByRole("button", { name: /Finding unresolved-confirmed/ });
  fireEvent.click(screen.getByRole("button", { name: "已处理" }));
  expect(
    screen.queryByRole("button", { name: /Finding unresolved-confirmed/ }),
  ).not.toBeInTheDocument();
  expect(
    screen.getByRole("button", { name: /Finding human-closed/ }),
  ).toBeVisible();
  fireEvent.click(screen.getByRole("button", { name: /^待处理/ }));
  expect(
    screen.getByRole("button", { name: /Finding unresolved-confirmed/ }),
  ).toBeVisible();
  expect(
    screen.queryByRole("button", { name: /Finding human-closed/ }),
  ).not.toBeInTheDocument();
});
