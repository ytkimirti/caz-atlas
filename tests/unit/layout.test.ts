import { describe, expect, test } from "bun:test";
import { computeLayout, layoutLinks } from "../../src/layout";
import { parseSpacing } from "../../src/layout-options";
import { shortestPath } from "../../src/graph";
import type { Edge } from "../../src/types";

const nodes = Array.from({ length: 18 }, (_, id) => ({ id, count: 20 - id }));
const edges: Edge[] = [];
for (let i = 0; i < 8; i++) {
  for (let j = i + 1; j < 8; j++) {
    edges.push({ source: i, target: j, weight: 20 });
    edges.push({ source: i + 8, target: j + 8, weight: 20 });
  }
}
edges.push({ source: 7, target: 8, weight: 1 });

test("sparse layout retains weak bridges between dense communities", () => {
  const links = layoutLinks(nodes, edges);
  expect(links).toContainEqual({ source: 7, target: 8, weight: 1 });
  expect(links.length).toBeLessThan(edges.length);
  const neighbors = new Map(
    nodes.map((n) => [n.id, [] as { id: number; weight: number }[]]),
  );
  for (const e of links) {
    neighbors.get(e.source)!.push({ id: e.target, weight: e.weight });
    neighbors.get(e.target)!.push({ id: e.source, weight: e.weight });
  }
  expect(shortestPath(neighbors, 0, 15).length).toBeGreaterThan(0);
});
test("invalid URL settings recover to defaults", () => {
  for (const value of [null, "NaN", "Infinity", "-1", "0", "99"])
    expect(parseSpacing(value)).toBe(1);
  expect(parseSpacing("1.6")).toBe(1.6);
});
// 3D placement is covered by spatial.test.ts; it has no marker clearance.
for (const mode of ["2d"] as const) {
  describe(mode, () => {
    test("finite, repeatable positions without mutating the graph", () => {
      const request = {
        nodes: structuredClone(nodes),
        edges: structuredClone(edges),
        mode,
        spacing: 1,
      };
      const before = structuredClone(request);
      const positions = computeLayout(request);
      expect(request).toEqual(before);
      expect(positions).toEqual(computeLayout(request));
      expect(new Set(positions.map((p) => p.id)).size).toBe(nodes.length);
      for (const p of positions) {
        expect(Number.isFinite(p.x) && Number.isFinite(p.y)).toBe(true);
        for (const other of positions) {
          if (p.id !== other.id)
            expect(Math.hypot(p.x - other.x, p.y - other.y)).toBeGreaterThan(
              15,
            );
        }
      }
    });
    test("empty, isolated and single-node graphs", () => {
      expect(computeLayout({ nodes: [], edges: [], mode, spacing: 1 })).toEqual(
        [],
      );
      for (const subset of [nodes.slice(0, 1), nodes]) {
        const positions = computeLayout({
          nodes: subset,
          edges: [],
          mode,
          spacing: 1,
        });
        expect(positions.length).toBe(subset.length);
        expect(new Set(positions.map((p) => `${p.x},${p.y}`)).size).toBe(
          subset.length,
        );
      }
    });
    test("more spacing increases clearance", () => {
      const minimum = (spacing: number) => {
        const p = computeLayout({ nodes, edges, mode, spacing });
        return Math.min(
          ...p.flatMap((a, i) =>
            p.slice(i + 1).map((b) => Math.hypot(a.x - b.x, a.y - b.y)),
          ),
        );
      };
      expect(minimum(1.6)).toBeGreaterThan(minimum(0.7));
    });
  });
}
