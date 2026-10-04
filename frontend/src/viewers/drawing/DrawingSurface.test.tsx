import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import DrawingSurface from "./DrawingSurface";
import type { DrawingTarget } from "./drawingContract";

vi.mock("./useDrawingDocument", () => ({
  useDrawingDocument: (_source: unknown, page: number) => ({
    canvas: { current: null },
    pages: 2,
    dimensions:
      page === 2 ? { width: 800, height: 600 } : { width: 600, height: 800 },
    status: "",
    error: "",
    readText: vi.fn(),
  }),
}));
vi.mock("./useDrawingAnnotations", () => ({
  useDrawingAnnotations: () => ({}),
}));
vi.mock("./DrawingMarkupLayer", () => ({ DrawingMarkupLayer: () => null }));
afterEach(cleanup);
const source = {
  revisionId: "r2",
  sourceHash: "a".repeat(64),
  data: new ArrayBuffer(1),
};
const target: DrawingTarget = {
  source_revision_id: "r2",
  page: 2,
  normalized_bbox: [0.1, 0.2, 0.5, 0.8],
};

it("opens the requested sheet and maps its normalized region after page navigation", () => {
  const view = render(<DrawingSurface source={source} target={target} />);
  expect(screen.getByRole("spinbutton", { name: "Sheet" })).toHaveValue(2);
  const region = screen.getByLabelText("Requested source region");
  expect(region).toHaveAttribute("viewBox", "0 0 800 600");
  expect(region.querySelector("rect")).toHaveAttribute("x", "80");
  expect(region.querySelector("rect")).toHaveAttribute("y", "120");
  expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  view.rerender(
    <DrawingSurface
      source={source}
      target={{ ...target, source_revision_id: "missing" }}
    />,
  );
  expect(screen.getByRole("alert")).toHaveTextContent(
    "different source revision",
  );
  expect(
    screen.queryByLabelText("Requested source region"),
  ).not.toBeInTheDocument();
});
it("reports an absent source page and malformed region without a success highlight", () => {
  const view = render(
    <DrawingSurface source={source} target={{ ...target, page: 3 }} />,
  );
  expect(screen.getByRole("alert")).toHaveTextContent("page is unavailable");
  expect(screen.getByRole("spinbutton", { name: "Sheet" })).toHaveValue(1);
  expect(
    screen.queryByLabelText("Requested source region"),
  ).not.toBeInTheDocument();
  view.rerender(
    <DrawingSurface
      source={source}
      target={{ ...target, normalized_bbox: [0, 0, 2, 1] }}
    />,
  );
  expect(screen.getByRole("alert")).toHaveTextContent(
    "normalized drawing target region",
  );
});

it("reports target failure and recovery to the Evidence host", () => {
  const report = vi.fn();
  const view = render(
    <DrawingSurface
      source={source}
      target={{ ...target, page: 3 }}
      onError={report}
    />,
  );
  expect(report).toHaveBeenLastCalledWith(
    "Requested drawing page is unavailable",
  );
  view.rerender(
    <DrawingSurface source={source} target={target} onError={report} />,
  );
  expect(report).toHaveBeenLastCalledWith(null);
});
