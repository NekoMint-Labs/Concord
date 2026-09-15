import { render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { ViewerBoundary } from "./ViewerBoundary";

afterEach(() => vi.restoreAllMocks());

it("isolates a failed viewer without removing the project controls", () => {
  vi.spyOn(console, "error").mockImplementation(() => {});
  function Broken(): never {
    throw new Error("WebGL fixture failure");
  }
  render(
    <div>
      <button>Approve outside the viewer</button>
      <ViewerBoundary>
        <Broken />
      </ViewerBoundary>
    </div>,
  );
  expect(screen.getByRole("alert")).toHaveTextContent("无法加载");
  expect(
    screen.getByRole("button", { name: "Approve outside the viewer" }),
  ).toBeEnabled();
});

it("loads another view when the selected workspace key changes", () => {
  vi.spyOn(console, "error").mockImplementation(() => {});
  function Broken(): never {
    throw new Error("Chunk fixture failure");
  }
  const { rerender } = render(
    <ViewerBoundary key="bim">
      <Broken />
    </ViewerBoundary>,
  );
  rerender(
    <ViewerBoundary key="documents">
      <p>Document evidence</p>
    </ViewerBoundary>,
  );
  expect(screen.queryByRole("alert")).toBeNull();
  expect(screen.getByText("Document evidence")).toBeVisible();
});
