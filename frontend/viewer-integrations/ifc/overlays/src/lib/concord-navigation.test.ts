import { describe, it, expect, vi } from "vitest";
import { Box3, Vector3 } from "three";
import { navigateNativeElements } from "./concord-navigation";
const box = () => new Box3(new Vector3(0, 0, 0), new Vector3(2, 3, 4));
function native() {
  return {
    current: vi.fn(() => true),
    bounds: vi.fn(async () => box()),
    select: vi.fn(async () => {}),
    fit: vi.fn(async () => {}),
    finish: vi.fn(async () => {}),
  };
}
describe("Acknowledged native IFC navigation", () => {
  it("awaits selection, fitting and rendering for the complete requested set", async () => {
    const api = native();
    let release!: () => void;
    api.fit.mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          release = resolve;
        }),
    );
    let settled = false;
    const pending = navigateNativeElements([1, 2], api).then(() => {
      settled = true;
    });
    await vi.waitFor(() => expect(api.fit).toHaveBeenCalled());
    expect(api.select).toHaveBeenCalledWith([1, 2]);
    expect(api.finish).not.toHaveBeenCalled();
    expect(settled).toBe(false);
    release();
    await pending;
    expect(api.finish).toHaveBeenCalledOnce();
  });
  it.each(
    [[], [1, 1], [0], [-1], [1.5], [NaN], Array(1001).fill(1)].map((ids) => ({
      ids,
    })),
  )("rejects invalid IDs before native effects: %j", async ({ ids }) => {
    const api = native();
    await expect(navigateNativeElements(ids, api)).rejects.toThrow("Invalid");
    expect(api.bounds).not.toHaveBeenCalled();
  });
  it.each([
    new Box3(),
    new Box3(new Vector3(0, 0, 0), new Vector3(Infinity, 1, 1)),
  ])("rejects absent or non-finite geometry", async (bounds) => {
    const api = native();
    api.bounds.mockResolvedValue(bounds);
    await expect(navigateNativeElements([1], api)).rejects.toThrow(
      "geometry bounds",
    );
    expect(api.select).not.toHaveBeenCalled();
  });
  it.each(["bounds", "select", "fit", "finish"] as const)(
    "rejects native %s failures",
    async (stage) => {
      const api = native();
      api[stage].mockRejectedValue(new Error(stage + " failed"));
      await expect(navigateNativeElements([1], api)).rejects.toThrow(
        stage + " failed",
      );
    },
  );
  it.each(["bounds", "select", "fit", "finish"] as const)(
    "fences removal/exit during %s",
    async (stage) => {
      const api = native();
      let current = true;
      api.current.mockImplementation(() => current);
      const original = api[stage].getMockImplementation()!;
      api[stage].mockImplementation((...args: unknown[]) => {
        current = false;
        return (original as (...args: unknown[]) => Promise<never>)(...args);
      });
      await expect(navigateNativeElements([1], api)).rejects.toThrow(
        "removed or viewer was closed",
      );
      if (stage === "bounds") expect(api.select).not.toHaveBeenCalled();
      if (stage === "select") expect(api.fit).not.toHaveBeenCalled();
      if (stage === "fit") expect(api.finish).not.toHaveBeenCalled();
    },
  );
});
