import { fireEvent, render, screen } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import type { DTO } from "../api/client";
import { AdvancedMenu } from "./AdvancedMenu";
import type { WorkspaceTab } from "./WorkspaceTabs";

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

/**
 * Opens 高级 the way a keyboard user does. jsdom has no real pointer stack, and
 * `fireEvent.keyDown` is the door `frontend/src/app/WorkspaceTabs.test.tsx`
 * already uses for this menu.
 *
 * The tests below keep one menu open and change only the profile, so that what
 * is asserted is the gate itself - including the transition from a local answer
 * to a desktop one - rather than five independent page loads.
 */
function open(
  profile: DTO<"ProfileResponse"> | undefined,
  onTab: (tab: WorkspaceTab) => void = () => {},
) {
  const view = render(menu(profile, onTab));
  fireEvent.keyDown(screen.getByRole("button", { name: "高级" }), {
    key: "ArrowDown",
  });
  return view;
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
  const view = open(undefined, onTab);

  expect(screen.queryByText("演示工具")).not.toBeInTheDocument();
  expect(screen.queryByText("重置演示")).not.toBeInTheDocument();

  // A missing answer hides the fixtures and nothing else: the diagnostics are
  // not demo tools and keep their place in the menu.
  fireEvent.click(screen.getByRole("menuitem", { name: "运行记录" }));
  expect(onTab).toHaveBeenCalledWith("operations");
  view.unmount();
});

it("shows the demo tools only when the profile positively reports local", () => {
  const view = open(answer("local"));

  expect(screen.getByText("演示工具")).toBeVisible();
  expect(screen.getByText("重置演示")).toBeVisible();
  // The diagnostics are still there beside them.
  expect(screen.getByRole("menuitem", { name: "运行记录" })).toBeVisible();
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
