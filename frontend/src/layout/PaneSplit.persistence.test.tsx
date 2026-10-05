import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { beforeEach, afterEach, expect, it, vi } from "vitest";
import {
  Pane,
  PaneDivider,
  PaneSplit,
  type GroupImperativeHandle,
  type PanelImperativeHandle,
} from "./PaneSplit";
import { createRef } from "react";

// A Lit viewport has no measurable slotted children until its first update. Keep
// the actual layout library and expose that zero → measurable transition in jsdom.
let width = 0;
const observers = new Set<{
  callback: ResizeObserverCallback;
  targets: Set<Element>;
}>();
const storageKey = "react-resizable-panels:delayed-persist";
const savedLayout = { main: 60, inspector: 40 };
const saved = JSON.stringify(savedLayout);

beforeEach(() => {
  width = 0;
  localStorage.setItem(storageKey, saved);
  vi.spyOn(HTMLElement.prototype, "offsetWidth", "get").mockImplementation(
    function (this: HTMLElement) {
      if (this.hasAttribute("data-panel"))
        return (width * Number(this.style.flexGrow)) / 100;
      return this.hasAttribute("data-group") ? width : 0;
    },
  );
  vi.stubGlobal(
    "ResizeObserver",
    class {
      readonly targets = new Set<Element>();
      constructor(readonly callback: ResizeObserverCallback) {
        observers.add(this);
      }
      observe(target: Element) {
        this.targets.add(target);
      }
      unobserve(target: Element) {
        this.targets.delete(target);
      }
      disconnect() {
        observers.delete(this);
      }
    },
  );
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  localStorage.removeItem(storageKey);
  observers.clear();
});

function measure(nextWidth: number) {
  act(() => {
    width = nextWidth;
    for (const observer of Array.from(observers)) {
      observer.callback(
        Array.from(
          observer.targets,
          (target) =>
            ({
              target,
              borderBoxSize: [{ inlineSize: width, blockSize: 600 }],
            }) as unknown as ResizeObserverEntry,
        ),
        observer as unknown as ResizeObserver,
      );
    }
  });
}

function mount(persist = true) {
  const group = createRef<GroupImperativeHandle>();
  const inspector = createRef<PanelImperativeHandle>();
  const view = render(
    <PaneSplit id="delayed-persist" persist={persist} groupRef={group}>
      <Pane id="main" minSize="320px">
        Model
      </Pane>
      <PaneDivider label="Resize inspector" />
      <Pane
        id="inspector"
        panelRef={inspector}
        defaultSize="320px"
        minSize="270px"
        maxSize="460px"
      >
        Inspector
      </Pane>
    </PaneSplit>,
  );
  return { ...view, group, inspector };
}

it("restores the saved 400px width after a zero-sized mount, without overwriting user preference", async () => {
  const { group, inspector, unmount } = mount();
  expect(localStorage.getItem(storageKey)).toBe(saved);
  measure(1000);
  await waitFor(() =>
    expect(inspector.current!.getSize().inPixels).toBeCloseTo(400, 6),
  );
  expect(group.current!.getLayout()).toEqual(savedLayout);
  expect(localStorage.getItem(storageKey)).toBe(saved);

  // Later non-user layout changes are not undone by another restoration/save.
  act(() => group.current!.setLayout({ main: 64, inspector: 36 }));
  expect(inspector.current!.getSize().inPixels).toBeCloseTo(360, 6);
  expect(localStorage.getItem(storageKey)).toBe(saved);
  measure(1200);
  expect(inspector.current!.getSize().inPixels).toBeCloseTo(360, 6);
  expect(localStorage.getItem(storageKey)).toBe(saved);

  // Actual keyboard interaction persists the resulting layout, not a stale seed.
  fireEvent.keyDown(
    screen.getByRole("separator", { name: "Resize inspector" }),
    { key: "ArrowLeft" },
  );
  await waitFor(() =>
    expect(JSON.parse(localStorage.getItem(storageKey)!)).toEqual(
      group.current!.getLayout(),
    ),
  );
  expect(localStorage.getItem(storageKey)).not.toBe(saved);
  const chosen = inspector.current!.getSize().inPixels;
  const stored = localStorage.getItem(storageKey);
  unmount();
  width = 0;
  const reopened = mount();
  measure(1200);
  await waitFor(() =>
    expect(reopened.inspector.current!.getSize().inPixels).toBeCloseTo(
      chosen,
      6,
    ),
  );
  expect(localStorage.getItem(storageKey)).toBe(stored);
});

it("constrains a narrow restoration without replacing the saved wider intent", async () => {
  const view = mount();
  measure(600);
  await waitFor(() =>
    expect(view.inspector.current!.getSize().inPixels).toBeCloseTo(270, 6),
  );
  expect(localStorage.getItem(storageKey)).toBe(saved);
  view.unmount();
  width = 0;
  const reopened = mount();
  measure(1000);
  await waitFor(() =>
    expect(reopened.inspector.current!.getSize().inPixels).toBeCloseTo(400, 6),
  );
  expect(localStorage.getItem(storageKey)).toBe(saved);
});

it("leaves non-persisted splits at their declared default", async () => {
  const view = mount(false);
  measure(1000);
  await waitFor(() =>
    expect(view.inspector.current!.getSize().inPixels).toBeCloseTo(320, 6),
  );
  expect(localStorage.getItem(storageKey)).toBe(saved);
});
