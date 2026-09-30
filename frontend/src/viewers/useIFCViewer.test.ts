import { expect, it, vi } from "vitest";
import { bindGeometrySelection } from "./useIFCViewer";

// SDK construction is outside this event contract; no renderer is created here.
vi.mock("@thatopen/components", () => ({}));
vi.mock("@thatopen/fragments", () => ({}));

function pointer(target: HTMLElement, kind: string, x = 10, y = 10) {
  const event = new MouseEvent(kind, {
    bubbles: true,
    clientX: x,
    clientY: y,
    button: 0,
  });
  Object.defineProperty(event, "pointerId", { value: 1 });
  target.dispatchEvent(event);
}

it("mapping selects on single canvas click, never orbit drag, chrome, cancelled gesture or double-click", () => {
  const element = document.createElement("div");
  const canvas = document.createElement("canvas");
  const chrome = document.createElement("button");
  element.append(canvas, chrome);
  const select = vi.fn();
  const cleanup = bindGeometrySelection(element, canvas, select, () => true);
  pointer(canvas, "pointerdown");
  pointer(canvas, "pointerup");
  expect(select).toHaveBeenCalledTimes(1);
  pointer(canvas, "pointerdown");
  pointer(canvas, "pointermove", 50);
  pointer(canvas, "pointerup");
  pointer(canvas, "pointerdown");
  pointer(canvas, "pointerup", 30);
  pointer(chrome, "pointerdown");
  pointer(chrome, "pointerup");
  pointer(canvas, "pointerdown");
  pointer(canvas, "pointercancel");
  pointer(canvas, "pointerup");
  canvas.dispatchEvent(new MouseEvent("dblclick", { bubbles: true }));
  expect(select).toHaveBeenCalledTimes(1);
  cleanup();
  pointer(canvas, "pointerdown");
  pointer(canvas, "pointerup");
  expect(select).toHaveBeenCalledTimes(1);
});

it("normal Model keeps double-click selection, with mode changes not rebuilding the SDK listener", () => {
  const element = document.createElement("div");
  const canvas = document.createElement("canvas");
  element.append(canvas);
  const select = vi.fn();
  let single = false;
  const cleanup = bindGeometrySelection(element, canvas, select, () => single);
  pointer(canvas, "pointerdown");
  pointer(canvas, "pointerup");
  expect(select).not.toHaveBeenCalled();
  canvas.dispatchEvent(new MouseEvent("dblclick", { bubbles: true }));
  expect(select).toHaveBeenCalledTimes(1);
  single = true;
  pointer(canvas, "pointerdown");
  pointer(canvas, "pointerup");
  expect(select).toHaveBeenCalledTimes(2);
  cleanup();
});
