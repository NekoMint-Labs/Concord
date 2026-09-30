import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { App } from "./App";
import { api, type Workspace } from "./api/client";
import fixture from "../tests/fixtures/inspector.json";
import type { ComponentProps } from "react";
import type { WorkspaceViews } from "./app/WorkspaceViews";

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
    </section>
  ),
}));

vi.mock("./features/ConcordAgent", () => ({ ConcordAgent: () => null }));
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
