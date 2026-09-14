export interface Point3D {
  x: number;
  y: number;
  z?: number;
}

export function sceneBounds(points: Iterable<Point3D>) {
  const all = [...points];
  if (!all.length) return { center: { x: 0, y: 0, z: 0 }, radius: 1 };
  const min = { x: Infinity, y: Infinity, z: Infinity };
  const max = { x: -Infinity, y: -Infinity, z: -Infinity };
  for (const p of all) {
    for (const axis of ["x", "y", "z"] as const) {
      min[axis] = Math.min(min[axis], p[axis] ?? 0);
      max[axis] = Math.max(max[axis], p[axis] ?? 0);
    }
  }
  const center = {
    x: (min.x + max.x) / 2,
    y: (min.y + max.y) / 2,
    z: (min.z + max.z) / 2,
  };
  let radius = 1;
  for (const p of all)
    radius = Math.max(
      radius,
      Math.hypot(p.x - center.x, p.y - center.y, (p.z ?? 0) - center.z),
    );
  return { center, radius };
}

// Keep the camera outside the bounding sphere, even while orbiting. Zoom is
// applied to the projected image, so it cannot move points behind the camera.
export function project3D(
  point: Point3D,
  center: Point3D,
  radius: number,
  yaw: number,
  pitch: number,
) {
  const dx = point.x - center.x;
  const dy = point.y - center.y;
  const dz = (point.z ?? 0) - (center.z ?? 0);
  const x = dx * Math.cos(yaw) + dz * Math.sin(yaw);
  const rz = -dx * Math.sin(yaw) + dz * Math.cos(yaw);
  const y = dy * Math.cos(pitch) - rz * Math.sin(pitch);
  const depth = dy * Math.sin(pitch) + rz * Math.cos(pitch);
  const distance = Math.max(1, radius) * 3;
  const scale = distance / (distance - depth);
  return { x: x * scale, y: y * scale, depth, scale };
}
