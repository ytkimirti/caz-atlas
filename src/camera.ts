import { project3D } from "./projection";
import type { Point3D } from "./projection";

export interface Viewport {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

export function orbitRadius(
  scene: { center: Point3D; radius: number },
  pivot: Point3D,
) {
  return (
    scene.radius +
    Math.hypot(
      pivot.x - scene.center.x,
      pivot.y - scene.center.y,
      (pivot.z ?? 0) - (scene.center.z ?? 0),
    )
  );
}

// Symmetric bounds keep the selected musician at the center while fitting
// their entire neighborhood, including collaborators on the far side.
export function frameNeighborhood(
  points: Iterable<Point3D>,
  pivot: Point3D,
  radius: number,
  yaw: number,
  pitch: number,
  viewport: Viewport,
) {
  let extentX = 20,
    extentY = 20;
  for (const point of points) {
    const p = project3D(point, pivot, radius, yaw, pitch);
    extentX = Math.max(extentX, Math.abs(p.x));
    extentY = Math.max(extentY, Math.abs(p.y));
  }
  const width = Math.max(60, viewport.right - viewport.left);
  const height = Math.max(60, viewport.bottom - viewport.top);
  return {
    zoom: Math.max(
      0.025,
      Math.min(4, (width - 40) / (2 * extentX), (height - 40) / (2 * extentY)),
    ),
    x: (viewport.left + viewport.right) / 2,
    y: (viewport.top + viewport.bottom) / 2,
    pivot,
  };
}
