import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import DocumentSurface from "./DocumentSurface";
import type {
  DocumentController,
  DocumentTarget,
  ExtractedDocument,
} from "./documentTypes";
const source: ExtractedDocument = {
  sourceRevisionId: "R2",
  sourceHash: "a".repeat(64),
  filename: "coordination.xlsx",
  chunks: [
    {
      id: "cell",
      text: "Verify clearance",
      page: 1,
      location:
        "#/tables/0; Coordination/row:4/cell:C4; row-span=1; col-span=1; column-header=False; row-header=False; offset=0",
      source_hash: "a".repeat(64),
      parser: "docling-local-no-ocr",
    },
  ],
};
const target: DocumentTarget = {
  kind: "document",
  source_revision_id: "R2",
  structural_path: ["Coordination", "row:4", "cell:C4"],
};
afterEach(cleanup);
it("consumes generated targets and exposes canonical user selections", async () => {
  const onSelection = vi.fn();
  let controller!: DocumentController;
  render(
    <DocumentSurface
      source={source}
      target={target}
      onSelection={onSelection}
      onReady={(value) => {
        controller = value;
      }}
    />,
  );
  const cell = screen.getByRole("row", { name: "Cell C4, excerpt cell" });
  expect(cell).toHaveAttribute("data-selected", "true");
  expect(cell).toHaveFocus();
  const reference = { ...target, page: 1, location: source.chunks[0].location };
  expect(onSelection).toHaveBeenLastCalledWith(reference);
  fireEvent.keyDown(cell, { key: "Enter" });
  expect(onSelection).toHaveBeenLastCalledWith(reference);
  await act(async () => {
    expect(await controller.navigate(target)).toEqual(reference);
  });
});
it("clears prior highlights and reports failed controller navigation, then recovers", async () => {
  let controller!: DocumentController;
  render(
    <DocumentSurface
      source={source}
      target={target}
      onReady={(value) => {
        controller = value;
      }}
    />,
  );
  await act(async () => {
    await expect(
      controller.navigate({ ...target, source_revision_id: "R1" }),
    ).rejects.toThrow("not loaded");
  });
  expect(screen.getByRole("alert")).toHaveTextContent(
    "source revision is not loaded",
  );
  expect(
    screen.getByRole("row", { name: "Cell C4, excerpt cell" }),
  ).not.toHaveAttribute("data-selected");
  await act(async () => {
    await controller.navigate(target);
  });
  expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  expect(
    screen.getByRole("row", { name: "Cell C4, excerpt cell" }),
  ).toHaveAttribute("data-selected", "true");
});
it("keeps the controller live across target changes and fences it across source replacement/unmount", async () => {
  let controller!: DocumentController;
  const onReady = (value: DocumentController) => {
    controller = value;
  };
  const view = render(<DocumentSurface source={source} onReady={onReady} />);
  const old = controller;
  view.rerender(
    <DocumentSurface source={source} target={target} onReady={onReady} />,
  );
  expect(controller).toBe(old);
  view.rerender(
    <DocumentSurface
      source={{ ...source, sourceRevisionId: "R3" }}
      target={target}
      onReady={onReady}
    />,
  );
  await expect(old.navigate(target)).rejects.toThrow("closed");
  expect(screen.getByRole("alert")).toHaveTextContent("not loaded");
  const current = controller;
  view.unmount();
  await expect(
    current.navigate({ ...target, source_revision_id: "R3" }),
  ).rejects.toThrow("closed");
});
it("rejects corrupted extraction and refuses exact selection without source provenance", () => {
  const onReady = vi.fn();
  const view = render(
    <DocumentSurface
      source={{ ...source, sourceHash: "b".repeat(64) }}
      onReady={onReady}
    />,
  );
  expect(screen.getByRole("alert")).toHaveTextContent("source hash");
  expect(onReady).not.toHaveBeenCalled();
  view.rerender(
    <DocumentSurface
      source={{ ...source, chunks: [{ ...source.chunks[0], location: null }] }}
    />,
  );
  fireEvent.click(screen.getByRole("article"));
  expect(screen.getByRole("alert")).toHaveTextContent(
    "no stable source location",
  );
});

it("reports target failure and recovery to the Evidence host", async () => {
  const report = vi.fn();
  const view = render(
    <DocumentSurface
      source={source}
      target={{ ...target, source_revision_id: "missing" }}
      onError={report}
    />,
  );
  await act(async () => {});
  expect(report).toHaveBeenLastCalledWith(
    "Document target source revision is not loaded",
  );
  view.rerender(
    <DocumentSurface source={source} target={target} onError={report} />,
  );
  await act(async () => {});
  expect(report).toHaveBeenLastCalledWith(null);
});
