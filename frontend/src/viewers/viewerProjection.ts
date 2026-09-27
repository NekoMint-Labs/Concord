import * as THREE from "three";
import type * as OBC from "@thatopen/components";

type Camera = OBC.OrthoPerspectiveCamera;

/** Switch the actual SDK camera and navigation, retaining the last useful orbit. */
export function viewerProjection(
  camera: Camera,
  box: THREE.Box3,
  useCamera: () => void,
) {
  const position = new THREE.Vector3();
  const target = new THREE.Vector3();
  return async (mode: "2d" | "3d") => {
    if (mode === "2d") {
      if (camera.projection.current === "Orthographic") return;
      camera.controls.getPosition(position);
      camera.controls.getTarget(target);
      await camera.projection.set("Orthographic");
      camera.set("Plan");
      const size = box.getSize(new THREE.Vector3());
      const distance = Math.max(size.x, size.y, size.z) * 1.8 || 20;
      await camera.controls.setLookAt(
        target.x,
        target.y + distance,
        target.z,
        target.x,
        target.y,
        target.z,
        true,
      );
    } else {
      if (camera.projection.current === "Perspective") return;
      await camera.projection.set("Perspective");
      camera.set("Orbit");
      await camera.controls.setLookAt(
        position.x,
        position.y,
        position.z,
        target.x,
        target.y,
        target.z,
        true,
      );
    }
    useCamera();
  };
}
