import { fireEvent, render, screen } from "@testing-library/react";
import { beforeAll, expect, it, vi } from "vitest";
import { AppSelect } from "./AppSelect";

/*
 * jsdom has no layout, so Radix cannot scroll a focused item into view there.
 * The shim is the environment rather than the assertion: everything the tests
 * read - the open/closed state, which option the arrow keys reach, the value
 * Enter submits, and where focus lands on close - is Radix's real behaviour.
 */
beforeAll(() => {
  Element.prototype.scrollIntoView = () => {};
});

/*
 * Radix moves the arrow-key highlight and finishes a dismissal on a
 * `setTimeout(..., 0)`. Awaiting a real macrotask while the list is open parks
 * the test, so that one deferred timer is run inline at the point the gesture
 * schedules it.
 */
function flushTimers(run: () => void) {
  const real = globalThis.setTimeout;
  globalThis.setTimeout = ((callback: TimerHandler) => {
    if (typeof callback === "function") callback();
    return 0;
  }) as typeof setTimeout;
  try {
    run();
  } finally {
    globalThis.setTimeout = real;
  }
}

const options = [
  { value: "design_revision", label: "设计修订" },
  { value: "workforce", label: "班组人员不足" },
  { value: "material", label: "材料不可用" },
];

function mount(onChange: (value: string) => void = () => {}) {
  render(
    <AppSelect
      label="变更类型"
      value="design_revision"
      onChange={onChange}
      options={options}
    />,
  );
  return screen.getByRole("combobox", { name: "变更类型" });
}

it("shows the selected value on the closed trigger", () => {
  expect(mount()).toHaveTextContent("设计修订");
});

it("opens with the keyboard, walks the options with the arrow keys, and selects with Enter", () => {
  const onChange = vi.fn();
  const trigger = mount(onChange);
  fireEvent.keyDown(trigger, { key: "ArrowDown" });
  expect(screen.getByRole("listbox")).toBeInTheDocument();
  const selected = screen.getByRole("option", { name: "设计修订" });
  flushTimers(() => fireEvent.keyDown(selected, { key: "ArrowDown" }));
  const next = screen.getByRole("option", { name: "班组人员不足" });
  expect(next).toHaveFocus();
  fireEvent.keyDown(next, { key: "Enter" });
  expect(onChange).toHaveBeenCalledWith("workforce");
  expect(screen.queryByRole("listbox")).toBeNull();
});

it("closes on Escape and returns focus to the trigger", () => {
  const trigger = mount();
  fireEvent.keyDown(trigger, { key: "ArrowDown" });
  expect(screen.getByRole("listbox")).toBeInTheDocument();
  flushTimers(() => fireEvent.keyDown(document, { key: "Escape" }));
  expect(screen.queryByRole("listbox")).toBeNull();
  expect(trigger).toHaveFocus();
});
