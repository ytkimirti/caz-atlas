import { expect, test } from "bun:test";
import { frameNeighborhood, orbitRadius } from "../../src/camera";
import { project3D, sceneBounds } from "../../src/projection";

const points = [
  { x: 0, y: 0, z: 0 },
  { x: 500, y: 90, z: 140 },
  { x: -100, y: -350, z: -200 },
];
const viewport = { left: 290, top: 150, right: 1140, bottom: 800 };

test("focus frames asymmetric collaborators around the selected musician outside panels", () => {
  const pivot = points[0];
  const radius = orbitRadius(sceneBounds(points), pivot);
  const view = frameNeighborhood(points, pivot, radius, 0.6, -0.2, viewport);
  for (const point of points) {
    const p = project3D(point, pivot, radius, 0.6, -0.2);
    expect(p.x * view.zoom + view.x).toBeGreaterThanOrEqual(viewport.left + 20);
    expect(p.x * view.zoom + view.x).toBeLessThanOrEqual(viewport.right - 20);
    expect(p.y * view.zoom + view.y).toBeGreaterThanOrEqual(viewport.top + 20);
    expect(p.y * view.zoom + view.y).toBeLessThanOrEqual(viewport.bottom - 20);
  }
  expect(view.x).toBe((viewport.left + viewport.right) / 2);
  expect(view.y).toBe((viewport.top + viewport.bottom) / 2);
});

test("focus ignores distant unrelated musicians when choosing zoom", () => {
  const distant = { x: 10000, y: 20000, z: -5000 };
  const radius = orbitRadius(sceneBounds([...points, distant]), points[0]);
  const focused = frameNeighborhood(points, points[0], radius, 0, 0, viewport);
  const overview = frameNeighborhood(
    [...points, distant],
    points[0],
    radius,
    0,
    0,
    viewport,
  );
  expect(focused.zoom).toBeGreaterThan(overview.zoom * 5);
});

test("moving the pivot to an edge musician keeps every node in front of the camera", () => {
  const scene = sceneBounds(points);
  for (const pivot of points) {
    const radius = orbitRadius(scene, pivot);
    for (const point of points) {
      for (let yaw = 0; yaw < Math.PI * 2; yaw += 0.3) {
        const p = project3D(point, pivot, radius, yaw, 0.9);
        expect(p.scale).toBeGreaterThanOrEqual(0.75);
        expect(p.scale).toBeLessThanOrEqual(1.5);
      }
    }
  }
});

test("isolated musicians and small phone viewports use finite bounded zoom", () => {
  for (const subset of [[], [points[0]]]) {
    const view = frameNeighborhood(subset, points[0], 1, 0, 0, {
      left: 20,
      top: 215,
      right: 370,
      bottom: 335,
    });
    expect(view.zoom).toBeGreaterThan(0);
    expect(view.zoom).toBeLessThanOrEqual(4);
    expect(Number.isFinite(view.x) && Number.isFinite(view.y)).toBe(true);
  }
});
