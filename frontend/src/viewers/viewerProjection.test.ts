import * as THREE from "three";
import { expect, it, vi } from "vitest";
import type * as OBC from "@thatopen/components";
import { viewerProjection } from "./viewerProjection";

it("switches the SDK projection and navigation to a top plan, then restores the orbit and camera", async () => {
  const camera = {
    projection: {
      current: "Perspective",
      set: vi.fn(async function (
        this: { current: string },
        projection: string,
      ) {
        this.current = projection;
      }),
    },
    controls: {
      getPosition: (point: THREE.Vector3) => point.set(15, 12, 10),
      getTarget: (point: THREE.Vector3) => point.set(1, 2, 3),
      setLookAt: vi.fn().mockResolvedValue(undefined),
    },
    set: vi.fn(),
  } as unknown as OBC.OrthoPerspectiveCamera;
  const useCamera = vi.fn();
  const switchMode = viewerProjection(
    camera,
    new THREE.Box3(new THREE.Vector3(-5, 0, -5), new THREE.Vector3(5, 8, 5)),
    useCamera,
  );
  await switchMode("2d");
  expect(camera.projection.set).toHaveBeenCalledWith("Orthographic");
  expect(camera.set).toHaveBeenCalledWith("Plan");
  expect(camera.controls.setLookAt).toHaveBeenCalledWith(
    1,
    20,
    3,
    1,
    2,
    3,
    true,
  );
  expect(useCamera).toHaveBeenCalledTimes(1);

  await switchMode("3d");
  expect(camera.projection.set).toHaveBeenCalledWith("Perspective");
  expect(camera.set).toHaveBeenCalledWith("Orbit");
  expect(camera.controls.setLookAt).toHaveBeenLastCalledWith(
    15,
    12,
    10,
    1,
    2,
    3,
    true,
  );
  expect(useCamera).toHaveBeenCalledTimes(2);
});
