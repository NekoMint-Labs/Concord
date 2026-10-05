import { afterEach, expect, it, vi } from "vitest";
import { openCadSources, disposeCadViewer } from "../src/cadDonor";

const donor = vi.hoisted(() => ({
  destroy: vi.fn().mockResolvedValue(undefined),
  openDocument: vi.fn().mockResolvedValue(true),
  clearComparisons: vi.fn(),
}));
vi.mock("@mlightcad/cad-simple-viewer", () => ({
  AcApDocManager: {},
  AcEdOpenMode: { Read: "read" },
}));
vi.mock("../vendor/AcApDiffViewer", () => ({
  AcApDiffViewer: class {
    destroy = donor.destroy;
    openDocument = donor.openDocument;
  },
}));
vi.mock("../src/cadCompareClient", () => ({
  disposeCadComparisons: donor.clearComparisons,
  registerCadDatabase: vi.fn(),
}));
vi.mock("../src/cadTypes", () => ({
  validateCadTarget: vi.fn(),
  verifyCadSource: vi.fn().mockResolvedValue(undefined),
}));
const source = {
  name: "source.dxf",
  revisionId: "R1",
  sourceHash: "a".repeat(64),
  data: new ArrayBuffer(8),
};
const open = (container: HTMLElement) =>
  openCadSources(container, source, undefined, vi.fn(), vi.fn(), vi.fn());
const drop = (container: HTMLElement) => {
  const event = new Event("drop", { bubbles: true, cancelable: true });
  container.dispatchEvent(event);
  return event.defaultPrevented;
};
afterEach(async () => {
  await disposeCadViewer();
  vi.restoreAllMocks();
  vi.clearAllMocks();
});
it("removes the revision drop guard when a container is reused after disposal", async () => {
  const container = document.createElement("div");
  const bubbled = vi.fn();
  container.addEventListener("drop", bubbled);
  const add = vi.spyOn(container, "addEventListener");
  const remove = vi.spyOn(container, "removeEventListener");
  for (let lifetime = 0; lifetime < 2; lifetime++) {
    await open(container);
    expect(drop(container)).toBe(true);
    expect(bubbled).toHaveBeenCalledTimes(lifetime);
    await disposeCadViewer();
    expect(drop(container)).toBe(false);
    expect(bubbled).toHaveBeenCalledTimes(lifetime + 1);
    expect(remove.mock.calls.at(-1)).toEqual(add.mock.calls.at(-1));
  }
  expect(donor.destroy).toHaveBeenCalledTimes(2);
});
it("releases the drop guard after an opening failure", async () => {
  const container = document.createElement("div");
  donor.openDocument.mockResolvedValueOnce(false);
  await expect(open(container)).rejects.toThrow("Earlier DXF failed to open");
  expect(drop(container)).toBe(true);
  await disposeCadViewer();
  expect(drop(container)).toBe(false);
  expect(donor.destroy).toHaveBeenCalledOnce();
});
