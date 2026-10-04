import { createElement } from "react";
import { findDonorControl } from "../../tests/donor-dom";
import {
  act,
  cleanup,
  fireEvent,
  render,
  renderHook,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import {
  DEFAULT_LAYOUT,
  WORKSPACE_LAYOUT_KEY,
  moveDock,
  normalizeLayout,
  readWorkspacePreferences,
} from "./workspaceLayout";
import {
  DockHandle,
  DockTargets,
  useWorkspaceLayout,
  WorkspaceLayoutDialog,
} from "./WorkspaceLayout";

beforeEach(() => {
  localStorage.clear();
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

it("clamps and rounds the work width, rejecting non-finite values and unknown donor fields", () => {
  expect(normalizeLayout({ workWidth: 20 }).workWidth).toBe(300);
  expect(normalizeLayout({ workWidth: 999 }).workWidth).toBe(480);
  expect(normalizeLayout({ workWidth: 361.6 }).workWidth).toBe(362);
  for (const workWidth of [NaN, Infinity, "400"]) {
    expect(normalizeLayout({ workWidth })).toEqual(DEFAULT_LAYOUT);
  }
  expect(
    normalizeLayout({
      work: "left",
      locked: false,
      tools: "left",
      sheets: "right",
      takeoffs: "left",
      look: "hud",
      sheetWidth: 300,
    }),
  ).toEqual({ work: "left", locked: false, workWidth: 360 });
  expect(normalizeLayout({ work: "bottom", locked: "false" })).toEqual(
    DEFAULT_LAYOUT,
  );
});

it("falls back on invalid preferences and normalizes only eight valid named layouts", () => {
  for (const raw of [
    null,
    "bad json",
    "null",
    "[]",
    "1",
    '{"version":2}',
    "{}",
  ])
    expect(readWorkspacePreferences(raw)).toEqual({
      version: 1,
      enabled: true,
      layout: DEFAULT_LAYOUT,
      saved: [],
    });
  const prefs = readWorkspacePreferences(
    JSON.stringify({
      version: 1,
      enabled: false,
      layout: { workWidth: 900, palette: true },
      saved: [
        null,
        { name: "  " },
        { name: 42 },
        ...Array.from({ length: 10 }, (_, i) => ({
          name: `  ${i}${"x".repeat(50)}  `,
          layout: { work: "left", tools: "right" },
        })),
      ],
      project: "never persist",
    }),
  );
  expect(prefs.enabled).toBe(false);
  expect(prefs.layout).toEqual({ ...DEFAULT_LAYOUT, workWidth: 480 });
  expect(prefs.saved).toHaveLength(8);
  expect(prefs.saved[0].name).toHaveLength(40);
  expect(prefs.saved[0].name.startsWith("0")).toBe(true);
  expect(prefs.saved[0].layout).toEqual({ ...DEFAULT_LAYOUT, work: "left" });
  expect(prefs).not.toHaveProperty("project");
});

it("prevents locked moves and normalizes an unlocked move", () => {
  expect(moveDock(DEFAULT_LAYOUT, "work", "left")).toEqual(DEFAULT_LAYOUT);
  expect(
    moveDock({ locked: false, workWidth: 999, look: "hud" }, "work", "left"),
  ).toEqual({ locked: false, work: "left", workWidth: 480 });
});

it("keeps the newest eight named snapshots, replaces duplicates, and persists browser-only preferences", () => {
  const { result } = renderHook(useWorkspaceLayout);
  act(() => result.current.move("work", "left"));
  expect(result.current.layout.work).toBe("right");
  act(() => {
    result.current.update({ locked: false, workWidth: 350 });
  });
  act(() => {
    result.current.move("work", "left");
  });
  act(() => {
    for (let i = 0; i < 9; i++) result.current.save(`  布局${i}  `);
  });
  expect(result.current.saved.map((s) => s.name)).toEqual(
    Array.from({ length: 8 }, (_, i) => `布局${i + 1}`),
  );
  act(() => {
    result.current.update({ workWidth: 480 });
  });
  expect(result.current.saved[0].layout.workWidth).toBe(350);
  act(() => {
    result.current.save("布局1");
    result.current.save("   ");
  });
  expect(result.current.saved).toHaveLength(8);
  expect(result.current.saved[7]).toEqual({
    name: "布局1",
    layout: { locked: false, work: "left", workWidth: 480 },
  });
  act(() => {
    result.current.remove("布局2");
  });
  expect(result.current.saved).toHaveLength(7);
  act(() => {
    result.current.update(DEFAULT_LAYOUT);
  });
  expect(result.current.saved).toHaveLength(7);
  expect(
    readWorkspacePreferences(localStorage.getItem(WORKSPACE_LAYOUT_KEY)),
  ).toEqual({
    version: 1,
    enabled: true,
    layout: DEFAULT_LAYOUT,
    saved: result.current.saved,
  });
});

it.each([false, true])(
  "retains session preferences across remounts when writes fail (reads fail: %s)",
  async (readsFail) => {
    // Isolate the module's session fallback without exposing a test-only reset.
    vi.resetModules();
    const { useWorkspaceLayout: useSessionLayout } =
      await import("./WorkspaceLayout");
    localStorage.setItem(
      WORKSPACE_LAYOUT_KEY,
      JSON.stringify(readWorkspacePreferences(null)),
    );
    const getItem = readsFail
      ? vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
          throw new Error("unavailable");
        })
      : null;
    const setItem = vi
      .spyOn(Storage.prototype, "setItem")
      .mockImplementation(() => {
        throw new Error("unavailable");
      });
    const first = renderHook(useSessionLayout);
    expect(first.result.current.storageFailed).toBe(true);
    act(() => first.result.current.update({ locked: false, workWidth: 999 }));
    act(() => first.result.current.move("work", "left"));
    act(() => first.result.current.save("会话布局"));
    const layout = { locked: false, work: "left", workWidth: 480 };
    const saved = [{ name: "会话布局", layout }];
    first.unmount();

    const nextProject = renderHook(useSessionLayout);
    expect(nextProject.result.current.storageFailed).toBe(true);
    expect(nextProject.result.current.layout).toEqual(layout);
    expect(nextProject.result.current.saved).toEqual(saved);
    nextProject.unmount();

    getItem?.mockRestore();
    setItem.mockRestore();
    const recovered = renderHook(useSessionLayout);
    expect(recovered.result.current.storageFailed).toBe(false);
    expect(
      readWorkspacePreferences(localStorage.getItem(WORKSPACE_LAYOUT_KEY)),
    ).toMatchObject({ layout, saved });
    recovered.unmount();
  },
);

it("retains dock keyboard moves, cancellation and locked visibility", () => {
  const onMove = vi.fn();
  const onDrag = vi.fn();
  const props = { label: "工作面板", locked: false, onMove, onDrag };
  const { rerender } = render(createElement(DockHandle, props));
  const handle = screen.getByRole("button", { name: "移动工作面板" });
  fireEvent.keyDown(handle, { key: "ArrowLeft" });
  fireEvent.keyDown(handle, { key: "ArrowRight" });
  fireEvent.keyDown(handle, { key: "Escape" });
  expect(onMove.mock.calls).toEqual([
    ["work", "left"],
    ["work", "right"],
  ]);
  expect(onDrag.mock.calls).toEqual([[null], [null], [null]]);
  rerender(createElement(DockHandle, { ...props, locked: true }));
  expect(screen.queryByRole("button")).toBeNull();
  rerender(createElement(DockTargets, { dragging: null }));
  expect(screen.queryByText("停靠左侧")).toBeNull();
  rerender(createElement(DockTargets, { dragging: "work" }));
  expect(screen.getByText("停靠左侧")).toBeInTheDocument();
  expect(screen.getByText("停靠右侧")).toBeInTheDocument();
});

it("uses the Concord dialog with locked position and size controls", async () => {
  const { result } = renderHook(useWorkspaceLayout);
  const onClose = vi.fn();
  const { rerender } = render(
    createElement(WorkspaceLayoutDialog, {
      open: true,
      onClose,
      prefs: result.current,
    }),
  );
  const dialog = screen.getByRole("dialog", { name: "你的工作区" });
  expect(dialog).toHaveClass("calm-layout-dialog");
  expect(
    screen.getByRole("button", { name: "完成" }).closest("footer")
      ?.parentElement,
  ).toBe(dialog);
  expect(
    screen
      .getByRole("checkbox", { name: "锁定面板位置和尺寸" })
      .closest(".calm-layout-scroll"),
  ).not.toBeNull();
  expect(
    await findDonorControl("combobox", "工作与审查面板位置"),
  ).toHaveAttribute("aria-disabled", "true");
  expect(screen.getByRole("slider", { name: "工作面板宽度" })).toBeDisabled();
  fireEvent.click(screen.getByRole("checkbox", { name: "锁定面板位置和尺寸" }));
  rerender(
    createElement(WorkspaceLayoutDialog, {
      open: true,
      onClose,
      prefs: result.current,
    }),
  );
  await waitFor(async () =>
    expect(
      await findDonorControl("combobox", "工作与审查面板位置"),
    ).toHaveAttribute("aria-disabled", "false"),
  );
  fireEvent.click(screen.getByRole("button", { name: "关闭布局设置" }));
  expect(onClose).toHaveBeenCalledOnce();
});

it("broadcasts focus changes, unsubscribes, and really toggles in memory when storage fails", async () => {
  vi.resetModules();
  const focus = await import("./focusMode");
  const listener = vi.fn();
  const unsubscribe = focus.onFocusModeChange(listener);
  focus.setFocusMode(true);
  expect(localStorage.getItem("concord_canvas_focus")).toBe("1");
  expect(focus.getFocusMode()).toBe(true);
  expect(focus.toggleFocusMode()).toBe(false);
  vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
    throw new Error("unavailable");
  });
  // Reads still succeed: a failed write must not let stale storage erase the toggle.
  expect(focus.toggleFocusMode()).toBe(true);
  expect(focus.getFocusMode()).toBe(true);
  vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
    throw new Error("unavailable");
  });
  expect(focus.toggleFocusMode()).toBe(false);
  expect(focus.toggleFocusMode()).toBe(true);
  expect(listener.mock.calls).toEqual([
    [true],
    [false],
    [true],
    [false],
    [true],
  ]);
  unsubscribe();
  focus.setFocusMode(false);
  expect(listener).toHaveBeenCalledTimes(5);
});
