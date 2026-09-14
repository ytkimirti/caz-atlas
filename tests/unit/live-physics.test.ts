import { describe, expect, test } from "bun:test";
import { LivePhysics } from "../../src/live-physics";
import type { Point3D } from "../../src/projection";

const anchors = () =>
  new Map<number, Point3D>([
    [1, { x: -150, y: 0, z: -80 }],
    [2, { x: 150, y: 0, z: 80 }],
    [3, { x: 900, y: 200, z: 300 }],
  ]);
const nodes = [{ id: 1 }, { id: 2 }];
const edges = [{ source: 1, target: 2, weight: 1 }];

describe("live playback physics", () => {
  for (const spatial of [false, true]) {
    test(`${spatial ? "3D" : "2D"} springs move bodies and keep finite coordinates`, () => {
      const positions = anchors();
      const world = new LivePhysics(anchors(), spatial);
      try {
        world.sync(nodes, edges, positions, false);
        const before = { ...positions.get(1)! };
        for (let i = 0; i < 120; i++) world.advance(1000 / 60, positions);
        expect(positions.get(1)!.x).toBeGreaterThan(before.x);
        if (spatial) expect(positions.get(1)!.z).not.toBe(before.z);
        for (const { x, y, z = 0 } of positions.values())
          expect([x, y, z].every(Number.isFinite)).toBe(true);
      } finally {
        world.dispose();
      }
    });
  }

  test("graph updates preserve momentum and spawn near existing collaborators", () => {
    const positions = anchors();
    const control = anchors();
    const world = new LivePhysics(anchors(), false);
    const reference = new LivePhysics(anchors(), false);
    try {
      world.sync(nodes, edges, positions, false);
      reference.sync(nodes, edges, control, false);
      for (let i = 0; i < 10; i++) {
        world.advance(1000 / 60, positions);
        reference.advance(1000 / 60, control);
      }
      world.sync(nodes, edges, positions);
      world.advance(1000 / 60, positions);
      reference.advance(1000 / 60, control);
      expect(positions.get(1)).toEqual(control.get(1));
      const before = { ...positions.get(1)! };
      world.sync(
        [...nodes, { id: 3 }],
        [...edges, { source: 1, target: 3, weight: 3 }],
        positions,
      );
      expect(positions.get(1)).toEqual(before);
      expect(
        Math.hypot(
          positions.get(3)!.x - before.x,
          positions.get(3)!.y - before.y,
        ),
      ).toBeCloseTo(22);
      world.sync([{ id: 1 }], [], positions);
      const removed = { ...positions.get(2)! };
      world.advance(1000 / 60, positions);
      expect(positions.get(2)).toEqual(removed);
      world.sync([], [], positions);
      expect(world.advance(1000, positions)).toBe(false);
    } finally {
      world.dispose();
      reference.dispose();
    }
  });

  test("fixed timestep is independent of display refresh rate and bounds catch-up", () => {
    const a = anchors(),
      b = anchors();
    const sixty = new LivePhysics(anchors(), false);
    const highRefresh = new LivePhysics(anchors(), false);
    try {
      sixty.sync(nodes, edges, a, false);
      highRefresh.sync(nodes, edges, b, false);
      for (let i = 0; i < 60; i++) sixty.advance(1000 / 60, a);
      for (let i = 0; i < 144; i++) highRefresh.advance(1000 / 144, b);
      expect(sixty.ticks).toBe(highRefresh.ticks);
      expect(a).toEqual(b);
      const before = sixty.ticks;
      sixty.pause();
      sixty.advance(60000, a);
      expect(sixty.ticks - before).toBe(3);
      sixty.dispose();
      expect(sixty.advance(1000, a)).toBe(false);
    } finally {
      sixty.dispose();
      highRefresh.dispose();
    }
  });
});
