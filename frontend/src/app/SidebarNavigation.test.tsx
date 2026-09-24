import type { ReactNode } from "react";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { expect, it, vi } from "vitest";
import fixture from "../../tests/fixtures/inspector.json";
import type { DTO, Workspace } from "../api/client";
import { ProjectSidebar } from "./ProjectSidebar";
import { WorkspaceHeader } from "./WorkspaceHeader";

vi.mock("../components/ui/AppMenu", () => ({
  AppMenu: ({
    label,
    trigger,
    children,
  }: {
    label: string;
    trigger: ReactNode;
    children: ReactNode;
  }) => (
    <div>
      <button aria-label={label}>{trigger}</button>
      <div role="menu">{children}</div>
    </div>
  ),
  AppMenuLabel: ({ children }: { children: ReactNode }) => (
    <div>{children}</div>
  ),
  AppMenuSeparator: () => <hr />,
  AppMenuItem: ({
    children,
    onSelect,
    active,
  }: {
    children: ReactNode;
    onSelect: () => void;
    active?: boolean;
  }) => (
    <button
      role="menuitem"
      aria-current={active ? "page" : undefined}
      onClick={onSelect}
    >
      {children}
    </button>
  ),
}));

/**
 * The navigation chrome of the desktop pass.
 *
 * Almost everything this pass changed is composition, and composition is judged
 * in a browser rather than here. What is asserted is the part a screenshot cannot
 * check: that a collapsed column is genuinely out of reach, that exactly one
 * sidebar control is on screen at a time, and that the project switcher is still
 * the picker it was - the pass restyled it and must not have changed what it does.
 */
const data = structuredClone(fixture.waiting) as unknown as Workspace;
const wp = data.state.work_packages.find((item) => item.id === "WP-200")!;
const projects = [
  { id: "harbor-east", name: "Harbor East / Building A" },
  { id: "campus-west", name: "Campus West" },
] as unknown as DTO<"Project">[];

function sidebar({ collapsed = false, onCollapse = vi.fn() } = {}) {
  render(
    <ProjectSidebar
      data={data}
      project="harbor-east"
      projects={projects}
      selected="WP-200"
      collapsed={collapsed}
      onCollapse={onCollapse}
      onProject={() => {}}
      onSelect={() => {}}
    />,
  );
  return onCollapse;
}

it("carries the collapse control and the current project in its own header", () => {
  const onCollapse = sidebar();
  const current = screen.getByRole("button", { name: "项目" });
  expect(within(current).getByText("A 栋项目")).toBeVisible();
  expect(document.querySelector(".sidebar")).not.toHaveAttribute("inert");

  fireEvent.click(screen.getByRole("button", { name: "收起侧栏" }));
  expect(onCollapse).toHaveBeenCalledTimes(1);
});

it("takes a collapsed column out of reach instead of unmounting it", () => {
  sidebar({ collapsed: true });
  /* Off the window's edge is not the same as gone: the column keeps its layout so
     the slide has something to move, and `inert` is what stops Tab reaching a
     region that is not on screen. */
  expect(document.querySelector(".sidebar")).toHaveAttribute("inert");
});

it("offers the way back only while the column is gone", () => {
  const onToggleNav = vi.fn();
  const view = render(
    <QueryClientProvider
      client={
        new QueryClient({ defaultOptions: { queries: { retry: false } } })
      }
    >
      <WorkspaceHeader data={data} wp={wp} onToggleNav={onToggleNav} />
    </QueryClientProvider>,
  );
  expect(screen.queryByRole("button", { name: "展开侧栏" })).toBeNull();

  view.rerender(
    <QueryClientProvider
      client={
        new QueryClient({ defaultOptions: { queries: { retry: false } } })
      }
    >
      <WorkspaceHeader
        data={data}
        wp={wp}
        navCollapsed
        onToggleNav={onToggleNav}
      />
    </QueryClientProvider>,
  );
  fireEvent.click(screen.getByRole("button", { name: "展开侧栏" }));
  expect(onToggleNav).toHaveBeenCalledTimes(1);
});

it("keeps fixture/debug wording out of the project picker", () => {
  render(
    <ProjectSidebar
      data={data}
      project="harbor-east"
      projects={projects}
      recent={[]}
      selected="WP-200"
      onCollapse={() => {}}
      onProject={() => {}}
      onSelect={() => {}}
    />,
  );

  const trigger = screen.getByRole("button", { name: "项目" });
  expect(within(trigger).getByText("A 栋项目")).toBeVisible();
  expect(within(trigger).queryByText("演示 / 示例")).toBeNull();
});

it("keeps project actions and switching discoverable in the project switcher", async () => {
  const onProject = vi.fn();
  const onNewProject = vi.fn();
  const onOpenProject = vi.fn();
  const onProjectSettings = vi.fn();
  render(
    <ProjectSidebar
      data={data}
      project="harbor-east"
      projects={projects}
      selected="WP-200"
      onCollapse={() => {}}
      onProject={onProject}
      onNewProject={onNewProject}
      onOpenProject={onOpenProject}
      onProjectSettings={onProjectSettings}
      onSelect={() => {}}
    />,
  );

  expect(
    await screen.findByRole("menuitem", { name: /新建项目/ }),
  ).toBeVisible();
  expect(screen.getByRole("menuitem", { name: /打开项目/ })).toBeVisible();
  expect(screen.getByRole("menuitem", { name: /项目设置/ })).toBeVisible();

  fireEvent.click(screen.getByRole("menuitem", { name: /新建项目/ }));
  expect(onNewProject).toHaveBeenCalledOnce();
  fireEvent.click(screen.getByRole("menuitem", { name: "Campus West" }));
  expect(onProject).toHaveBeenCalledWith("campus-west");
});

it("labels work-package creation as an explicit sidebar action", () => {
  const onStructure = vi.fn();
  render(
    <ProjectSidebar
      data={data}
      project="harbor-east"
      projects={projects}
      selected="WP-200"
      onCollapse={() => {}}
      onProject={() => {}}
      onStructure={onStructure}
      onSelect={() => {}}
    />,
  );

  fireEvent.click(screen.getByRole("button", { name: "新建工作包" }));
  expect(onStructure).toHaveBeenCalledOnce();
});
