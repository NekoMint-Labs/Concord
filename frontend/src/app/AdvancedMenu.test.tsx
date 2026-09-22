import { fireEvent, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { expect, it, vi } from "vitest";
import type { DTO } from "../api/client";
import { AdvancedMenu } from "./AdvancedMenu";
import type { WorkspaceTab } from "./WorkspaceTabs";

/* The profile gate is our contract; Radix popup behavior is browser-covered. */
vi.mock("../components/ui/AppMenu", () => ({
  AppMenu: ({ children }: { children: ReactNode }) => (
    <div role="menu">{children}</div>
  ),
  AppMenuLabel: ({ children }: { children: ReactNode }) => (
    <div>{children}</div>
  ),
  AppMenuSeparator: () => <hr />,
  AppMenuItem: ({
    children,
    onSelect,
    disabled,
    active = false,
  }: {
    children: ReactNode;
    onSelect: () => void;
    disabled?: boolean;
    active?: boolean;
  }) => (
    <button
      aria-current={active ? "page" : undefined}
      disabled={disabled}
      onClick={onSelect}
      role="menuitem"
    >
      {children}
    </button>
  ),
}));

function menu(
  profile: DTO<"ProfileResponse"> | undefined,
  onTab: (tab: WorkspaceTab) => void = () => {},
) {
  return (
    <AdvancedMenu
      tab="coordination"
      onTab={onTab}
      project="harbor-east"
      busy={false}
      profile={profile}
      createEvent={() => {}}
      onReset={() => {}}
    />
  );
}

function answer(name: string): DTO<"ProfileResponse"> {
  return {
    profile: name,
    runtime: "",
    reasoning: "",
    storage: "",
    database: "",
    simulation: false,
    authentication: "",
  };
}

/**
 * The regression: the tools were gated on `profile.data === undefined ||
 * profile.profile === "local"`, so the window before the response arrived - and
 * every failed request with it - was read as local. A packaged desktop build
 * starts its sidecar asynchronously, which is exactly a profile query in flight,
 * and the shipped application therefore opened by offering 演示工具.
 */
it("hides the demo tools while the profile query is still loading", () => {
  const onTab = vi.fn();
  render(menu(undefined, onTab));

  expect(screen.queryByText("演示工具")).not.toBeInTheDocument();
  expect(screen.queryByText("重置演示")).not.toBeInTheDocument();

  // A missing answer hides the fixtures and leaves diagnostics available.
  fireEvent.click(screen.getByRole("menuitem", { name: "能力诊断" }));
  expect(onTab).toHaveBeenCalledWith("capabilities");
});

it("shows the demo tools only when the profile positively reports local", () => {
  const view = render(menu(answer("local")));

  expect(screen.getByText("演示工具")).toBeVisible();
  expect(screen.getByText("重置演示")).toBeVisible();
  // Capability diagnostics remain available beside them.
  expect(screen.getByRole("menuitem", { name: "能力诊断" })).toBeVisible();

  for (const name of ["desktop", "server", "full"]) {
    view.rerender(menu(answer(name)));
    expect(screen.queryByText("演示工具")).not.toBeInTheDocument();
    expect(screen.queryByText("重置演示")).not.toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: "能力诊断" })).toBeVisible();
  }

  // A profile request that failed leaves no answer at all, which is not `local`.
  view.rerender(menu(undefined));
  expect(screen.queryByText("演示工具")).not.toBeInTheDocument();
});
