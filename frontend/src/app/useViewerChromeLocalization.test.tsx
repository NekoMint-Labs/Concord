import { render, screen, waitFor } from "@testing-library/react";
import { useRef, type ReactNode } from "react";
import { afterEach, expect, it } from "vitest";
import {
  useViewerChromeLocalization,
  viewerChrome,
} from "./useViewerChromeLocalization";

/** A host-owned slot exactly as the evidence surface composes it. */
function Slot({ children }: { children: ReactNode }) {
  const slot = useRef<HTMLDivElement>(null);
  useViewerChromeLocalization(slot);
  return <div ref={slot}>{children}</div>;
}

afterEach(() => {
  document.body.replaceChildren();
});

it("replaces the known donor chrome inside the slot on mount", () => {
  render(
    <Slot>
      <div className="engineering-drawing-toolbar">
        <button>Previous sheet</button>
        <label>
          Sheet <input type="number" />
        </label>
        <span>of {2}</span>
        <button>Next sheet</button>
        <button>Fit sheet</button>
        <label>
          Tool{" "}
          <select aria-label="Drawing tool">
            <option value="navigate">Navigate</option>
            <option value="calibrate">Calibrate</option>
          </select>
        </label>
      </div>
      <div className="annotation-workbench">
        <span className="annotation-caption">Annotate</span>
        <button>Arrow</button>
        <button>Highlighter</button>
        <button>Callout</button>
        <button>Cloud + note</button>
        <button>Sweep</button>
        <button>Select markups</button>
        <button>Favorites</button>
      </div>
      <button>Undo annotation</button>
      <button>Redo annotation</button>
      {/* the viewer paints the note as separate runs, exactly as it does in the product */}
      <p>{"Measurements require calibration for this sheet."} Scroll to pan.</p>
    </Slot>,
  );
  for (const [before, after] of Object.entries(viewerChrome)) {
    expect(screen.queryByText(before)).not.toBeInTheDocument();
    void after;
  }
  expect(screen.getByRole("button", { name: "上一张" })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "下一张" })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "适配图纸" })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "箭头" })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "常用" })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "撤销标注" })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "重做标注" })).toBeInTheDocument();
  expect(screen.getByRole("option", { name: "浏览" })).toBeInTheDocument();
  expect(screen.getByRole("option", { name: "校准" })).toBeInTheDocument();
  expect(screen.getByText(/本图纸需先校准方可测量/)).toBeInTheDocument();
  expect(screen.getByText(/滚动可平移/)).toBeInTheDocument();
});

it("keeps the data: sheet numbers, ids and the option value stay literal", () => {
  render(
    <Slot>
      <label>
        Sheet <input type="number" defaultValue={1} />
      </label>
      <span>of {2}</span>
      <select aria-label="Drawing tool" defaultValue="navigate">
        <option value="navigate">Navigate</option>
      </select>
      <span>R2 · revision-16 · evidence-16</span>
    </Slot>,
  );
  expect(screen.getByLabelText("Drawing tool")).toHaveValue("navigate");
  expect(
    screen.getByText("R2 · revision-16 · evidence-16"),
  ).toBeInTheDocument();
});

it("leaves aria-labels, data attributes and roles untouched", () => {
  render(
    <Slot>
      <button aria-label="Zoom out" data-kind="navigate">
        Navigate
      </button>
      <span data-navigation-state="Navigate">Navigate</span>
    </Slot>,
  );
  const zoom = screen.getByLabelText("Zoom out");
  expect(zoom).toHaveAttribute("data-kind", "navigate");
  expect(zoom).toHaveTextContent("浏览");
});

it("never touches anything outside the slot", () => {
  render(
    <div>
      <span data-testid="outside">Previous sheet</span>
      <Slot>
        <span data-testid="inside">Previous sheet</span>
      </Slot>
    </div>,
  );
  expect(screen.getByTestId("inside")).toHaveTextContent("上一张");
  expect(screen.getByTestId("outside")).toHaveTextContent("Previous sheet");
});

it("is idempotent - a second render does not double the translation", () => {
  const { rerender } = render(
    <Slot>
      <button>Previous sheet</button>
    </Slot>,
  );
  rerender(
    <Slot>
      <button>Previous sheet</button>
    </Slot>,
  );
  expect(screen.getAllByRole("button")).toHaveLength(1);
  expect(screen.getByRole("button")).toHaveTextContent("上一张");
});

it("re-translates chrome that appears after mount (a viewer re-render)", async () => {
  const { rerender } = render(
    <Slot>
      <button>Previous sheet</button>
    </Slot>,
  );
  rerender(
    <Slot>
      <button>Previous sheet</button>
      <label>
        Known length (m) <input type="number" />
      </label>
      <button>Finish</button>
      <button>Cancel</button>
    </Slot>,
  );
  await waitFor(() =>
    expect(screen.getByRole("button", { name: "完成" })).toBeInTheDocument(),
  );
  expect(screen.getByRole("button", { name: "取消" })).toBeInTheDocument();
  expect(screen.getByText(/已知长度/)).toBeInTheDocument();
});

it("localizes the viewer's own load states, keeping their numbers", async () => {
  const { rerender } = render(
    <Slot>
      <p role="status">Opening drawing…</p>
    </Slot>,
  );
  expect(screen.getByRole("status")).toHaveTextContent("正在打开图纸…");
  rerender(
    <Slot>
      <p role="status">{"Preparing sheet 1 of 2…"}</p>
    </Slot>,
  );
  await waitFor(() =>
    expect(screen.getByRole("status")).toHaveTextContent("正在准备图纸 1 / 2…"),
  );
});

it("keeps the map narrow: every key is a real label, not a datum", () => {
  for (const [before, after] of Object.entries(viewerChrome)) {
    expect(before.trim()).toBe(before);
    expect(before).not.toBe(after);
  }
  for (const datum of ["A17", "R2", "revision-16", "evidence-16", "Sheet1"])
    expect(viewerChrome).not.toHaveProperty(datum);
});
