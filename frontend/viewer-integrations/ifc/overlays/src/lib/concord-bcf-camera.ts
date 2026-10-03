/** Narrow native camera optics adapter. BCF vectors remain in donor scene axes. */
import * as THREE from "three";
import type { OrthoPerspectiveCamera } from "@thatopen/components";
import type { BcfViewpoint } from "../types";

export function validateBcfViewpoint(vp: BcfViewpoint) {
  const vectors = [vp.cameraPosition, vp.cameraDirection, vp.cameraUp];
  if (vectors.some((v) => !v || ![v.x, v.y, v.z].every(Number.isFinite)))
    throw new Error("BCF camera requires finite position, direction and up");
  const direction = new THREE.Vector3().copy(vp.cameraDirection!);
  const up = new THREE.Vector3().copy(vp.cameraUp!);
  if (
    direction.lengthSq() < 1e-12 ||
    up.lengthSq() < 1e-12 ||
    direction.clone().cross(up).lengthSq() < 1e-12
  )
    throw new Error("Invalid BCF camera basis");
  const optical =
    vp.cameraKind === "orthogonal" ? vp.viewToWorldScale : vp.fieldOfView;
  if (
    !optical ||
    !Number.isFinite(optical) ||
    optical <= 0 ||
    (vp.cameraKind !== "orthogonal" && optical >= 180)
  )
    throw new Error("Invalid BCF camera optics");
  if (
    vp.aspectRatio !== undefined &&
    (!Number.isFinite(vp.aspectRatio) || vp.aspectRatio <= 0)
  )
    throw new Error("Invalid BCF camera aspect ratio");
  if (
    (vp.componentGuids?.length ?? 0) > 10000 ||
    (vp.clippingPlanes?.length ?? 0) > 32
  )
    throw new Error("BCF selection/clipping limit exceeded");
  if (vp.componentGuids?.some((g) => !/^[0-3][0-9A-Za-z_$]{21}$/.test(g)))
    throw new Error("Invalid BCF selected GlobalId");
  for (const plane of vp.clippingPlanes ?? []) {
    if (
      ![
        plane.location.x,
        plane.location.y,
        plane.location.z,
        plane.direction.x,
        plane.direction.y,
        plane.direction.z,
      ].every(Number.isFinite) ||
      Math.hypot(plane.direction.x, plane.direction.y, plane.direction.z) < 1e-9
    )
      throw new Error("Invalid BCF clipping plane");
  }
}

export async function applyBcfCamera(
  camera: OrthoPerspectiveCamera,
  vp: BcfViewpoint,
  aspect: number,
) {
  validateBcfViewpoint(vp);
  await camera.projection.set(
    vp.cameraKind === "orthogonal" ? "Orthographic" : "Perspective",
  );
  const active = camera.three;
  active.up.copy(new THREE.Vector3().copy(vp.cameraUp!).normalize());
  camera.controls.updateCameraUp();
  const p = vp.cameraPosition!,
    d = new THREE.Vector3().copy(vp.cameraDirection!).normalize();
  await camera.controls.setLookAt(
    p.x,
    p.y,
    p.z,
    p.x + d.x,
    p.y + d.y,
    p.z + d.z,
    false,
  );
  camera.controls.update(0);
  // buildingSMART BCF 3.0: preserve all original content on a narrower viewport.
  const adjustment = Math.max(1, (vp.aspectRatio ?? 1) / aspect);
  if (vp.cameraKind === "orthogonal") {
    const ortho = camera.threeOrtho;
    const height = vp.viewToWorldScale! * adjustment;
    ortho.zoom = (ortho.top - ortho.bottom) / height;
    await camera.controls.zoomTo(ortho.zoom, false);
    ortho.updateProjectionMatrix();
  } else {
    const persp = camera.threePersp;
    persp.zoom = 1;
    persp.fov = THREE.MathUtils.radToDeg(
      2 *
        Math.atan(
          Math.tan(THREE.MathUtils.degToRad(vp.fieldOfView! / 2)) * adjustment,
        ),
    );
    persp.updateProjectionMatrix();
  }
  active.updateMatrixWorld();
}
