import { afterEach, expect, it, vi } from "vitest";
import { paintDrawingSheet } from "./paintDrawingSheet";
import type { DrawingSheetArtifact } from "./drawingArtifactTypes";
afterEach(() => vi.unstubAllGlobals());
function scene() {
  const drawImage = vi.fn(),
    close = vi.fn();
  const canvas = {
    width: 0,
    height: 0,
    getContext: () => ({ drawImage }),
  } as unknown as HTMLCanvasElement;
  const bitmap = { close };
  const sheet: DrawingSheetArtifact = {
    page: 1,
    width: 600,
    height: 420,
    pixelWidth: 2400,
    pixelHeight: 1680,
    image: new Blob(),
    textRuns: [],
  };
  return { canvas, bitmap, sheet, drawImage, close };
}
it("repaints cached rasters at donor-bounded zoom and closes decoded pixels", async () => {
  const { canvas, bitmap, sheet, drawImage, close } = scene();
  vi.stubGlobal("createImageBitmap", vi.fn().mockResolvedValue(bitmap));
  await paintDrawingSheet(canvas, sheet, 1.25, new AbortController().signal);
  expect(canvas.width).toBe(1125);
  expect(canvas.height).toBe(787);
  expect(drawImage).toHaveBeenCalledWith(bitmap, 0, 0, 1125, 787);
  expect(close).toHaveBeenCalledTimes(1);
});
it("closes a decode that completes after exit without painting a stale sheet", async () => {
  const { canvas, bitmap, sheet, drawImage, close } = scene();
  let complete: ((value: unknown) => void) | undefined;
  vi.stubGlobal(
    "createImageBitmap",
    vi.fn(
      () =>
        new Promise((resolve) => {
          complete = resolve;
        }),
    ),
  );
  const abort = new AbortController();
  const painting = paintDrawingSheet(canvas, sheet, 1, abort.signal);
  const rejected = expect(painting).rejects.toMatchObject({
    name: "AbortError",
  });
  abort.abort();
  complete!(bitmap);
  await rejected;
  expect(drawImage).not.toHaveBeenCalled();
  expect(close).toHaveBeenCalledTimes(1);
  expect(canvas.width).toBe(0);
});
it("surfaces unavailable canvas/decoder state and frees decoded pixels on failure", async () => {
  const { canvas, bitmap, sheet, close } = scene();
  vi.stubGlobal("createImageBitmap", undefined);
  await expect(
    paintDrawingSheet(canvas, sheet, 1, new AbortController().signal),
  ).rejects.toThrow("decoding is unavailable");
  vi.stubGlobal("createImageBitmap", vi.fn().mockResolvedValue(bitmap));
  canvas.getContext = vi.fn().mockReturnValue(null);
  await expect(
    paintDrawingSheet(canvas, sheet, 1, new AbortController().signal),
  ).rejects.toThrow("canvas is unavailable");
  expect(close).toHaveBeenCalledTimes(1);
});
