import type { Box3 } from "three";

/** Await native selection/framing; never acknowledge a fire-and-forget camera command. */
export async function navigateNativeElements(
  ids: readonly number[],
  native: {
    current(): boolean;
    bounds(ids: number[]): Promise<Box3>;
    select(ids: number[]): Promise<void>;
    fit(box: Box3): Promise<unknown>;
    finish(): Promise<void>;
  },
): Promise<void> {
  const requested = [...ids];
  if (
    !requested.length ||
    requested.length > 1000 ||
    new Set(requested).size !== requested.length ||
    requested.some((id) => !Number.isSafeInteger(id) || id <= 0)
  )
    throw new Error("Invalid IFC element selection");
  const checkpoint = () => {
    if (!native.current())
      throw new Error("IFC navigation model was removed or viewer was closed");
  };
  checkpoint();
  const box = await native.bounds(requested);
  checkpoint();
  if (
    box.isEmpty() ||
    ![...box.min.toArray(), ...box.max.toArray()].every(Number.isFinite)
  )
    throw new Error("IFC target has no finite geometry bounds to fit");
  await native.select(requested);
  checkpoint();
  await native.fit(box);
  checkpoint();
  await native.finish();
  checkpoint();
}
