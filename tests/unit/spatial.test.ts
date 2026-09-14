import { expect, test } from "bun:test";
import { computeLayout } from "../../src/layout";
import { parseViewMode } from "../../src/layout-options";
import { project3D, sceneBounds } from "../../src/projection";

const request = {
  nodes: Array.from({ length: 20 }, (_, id) => ({ id, count: 20 - id })),
  edges: Array.from({ length: 16 }, (_, id) => ({
    source: id,
    target: (id + 1) % 16,
    weight: 2,
  })),
  engine: "communities" as const,
  mode: "3d" as const,
  spacing: 1,
};

test("3D layouts are repeatable, preserve input and include disconnected musicians", () => {
  const before = structuredClone(request);
  const positions = computeLayout(request);
  expect(request).toEqual(before);
  expect(positions).toEqual(computeLayout(request));
  expect(new Set(positions.map((p) => p.id)).size).toBe(20);
  for (const p of positions) {
    expect([p.x, p.y, p.z].every(Number.isFinite)).toBe(true);
  }
  // A nonzero scalar triple product proves this is a volume, not a tilted plane.
  const [a, b, c, d] = positions;
  const u = [b.x - a.x, b.y - a.y, b.z! - a.z!];
  const v = [c.x - a.x, c.y - a.y, c.z! - a.z!];
  const w = [d.x - a.x, d.y - a.y, d.z! - a.z!];
  const volume =
    u[0] * (v[1] * w[2] - v[2] * w[1]) -
    u[1] * (v[0] * w[2] - v[2] * w[0]) +
    u[2] * (v[0] * w[1] - v[1] * w[0]);
  expect(Math.abs(volume)).toBeGreaterThan(1);
});

test("3D handles empty, single and isolated graphs", () => {
  expect(computeLayout({ ...request, nodes: [], edges: [] })).toEqual([]);
  for (const nodes of [request.nodes.slice(0, 1), request.nodes]) {
    const positions = computeLayout({ ...request, nodes, edges: [] });
    expect(positions.length).toBe(nodes.length);
    expect(new Set(positions.map((p) => `${p.x},${p.y},${p.z}`)).size).toBe(
      nodes.length,
    );
    expect(positions.every((p) => [p.x, p.y, p.z].every(Number.isFinite))).toBe(
      true,
    );
  }
});

test("spacing expands the 3D graph and switching back retains the 2D engine", () => {
  const tight = sceneBounds(computeLayout({ ...request, spacing: 0.7 }));
  const loose = sceneBounds(computeLayout({ ...request, spacing: 1.6 }));
  expect(loose.radius).toBeGreaterThan(tight.radius);
  const flat = computeLayout({ ...request, mode: "2d" });
  expect(flat).toEqual(computeLayout({ ...request, mode: undefined }));
  expect(flat.every((p) => p.z === undefined)).toBe(true);
});

test("perspective makes nearer points larger and rotation reveals depth", () => {
  const center = { x: 0, y: 0, z: 0 };
  const near = project3D({ x: 10, y: 0, z: 50 }, center, 100, 0, 0);
  const far = project3D({ x: 10, y: 0, z: -50 }, center, 100, 0, 0);
  expect(near.scale).toBeGreaterThan(far.scale);
  expect(near.x).toBeGreaterThan(far.x);
  const rotated = project3D({ x: 0, y: 0, z: 50 }, center, 100, Math.PI / 2, 0);
  expect(rotated.x).toBeCloseTo(50);
  expect(rotated.depth).toBeCloseTo(0);
});

test("all orbit angles keep projection finite and in front of the camera", () => {
  const positions = computeLayout(request);
  const { center, radius } = sceneBounds(positions);
  for (let yaw = -Math.PI; yaw <= Math.PI; yaw += 0.4) {
    for (const pitch of [-Math.PI / 2, 0, Math.PI / 2]) {
      for (const p of positions) {
        const projected = project3D(p, center, radius, yaw, pitch);
        expect(Object.values(projected).every(Number.isFinite)).toBe(true);
        expect(projected.scale).toBeGreaterThanOrEqual(0.75 - 1e-10);
        expect(projected.scale).toBeLessThanOrEqual(1.5 + 1e-10);
      }
    }
  }
  expect(sceneBounds([])).toEqual({ center: { x: 0, y: 0, z: 0 }, radius: 1 });
  expect(parseViewMode("3d")).toBe("3d");
  for (const value of [null, "2d", "invalid"])
    expect(parseViewMode(value)).toBe("2d");
});
