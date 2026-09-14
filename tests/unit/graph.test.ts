import { describe, expect, test } from "bun:test";
import { adjacency, shortestPath, mergeEdge } from "../../src/graph";
import type { Atlas, Edge } from "../../src/types";
import { normalize } from "../../src/types";
const fixture = {
  nodes: [1, 2, 3, 4, 5].map((id) => ({ id })),
  edges: [
    { source: 1, target: 2, weight: 3 },
    { source: 2, target: 3, weight: 4 },
    { source: 3, target: 4, weight: 2 },
    { source: 1, target: 4, weight: 1 },
  ],
} as Atlas;
describe("Musician graph", () => {
  const map = adjacency(fixture);
  test("finds the fewest collaborations, regardless of edge strength", () => {
    expect(shortestPath(map, 1, 4)).toEqual([1, 4]);
    expect(shortestPath(map, 1, 3)).toHaveLength(3);
  });
  test("distinguishes disconnected, unknown and identical musicians", () => {
    expect(shortestPath(map, 1, 5)).toEqual([]);
    expect(shortestPath(map, 99, 1)).toEqual([]);
    expect(shortestPath(map, 1, 1)).toEqual([1]);
  });
  test("merges both directions without doubling source weights", () => {
    const edges = new Map<string, Edge>();
    mergeEdge(edges, { source: 2, target: 1, weight: 5 });
    mergeEdge(edges, { source: 1, target: 2, weight: 5 });
    mergeEdge(edges, { source: 1, target: 2, weight: 3 });
    mergeEdge(edges, { source: 1, target: 1, weight: 2 });
    expect([...edges.values()]).toEqual([{ source: 1, target: 2, weight: 5 }]);
  });
  test("Turkish search accepts unaccented spellings", () => {
    expect(normalize("Asude Şaşmaz")).toBe(normalize("asude sasmaz"));
    expect(normalize("İlhan Şen")).toBe(normalize("ilhan sen"));
    expect(normalize("Önder Focan")).toBe(normalize("onder focan"));
  });
});
