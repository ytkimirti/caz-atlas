import { describe, expect, test } from "bun:test";
import {
  adjacency,
  shortestPath,
  mergeEdge,
  filterGraph,
  strongestEdges,
} from "../../src/graph";
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
  test("mutual strongest links never produce a hub above the chosen limit", () => {
    const edges = [2, 3, 4, 5].map((id) => ({
      source: 1,
      target: id,
      weight: 10 - id,
    }));
    expect(strongestEdges(edges, 2)).toEqual(edges.slice(0, 2));
    expect(strongestEdges(edges, 0)).toEqual([]);
    const full = adjacency({ nodes: fixture.nodes, edges });
    expect(shortestPath(full, 4, 5)).toEqual([4, 1, 5]);
  });
  test("ties have stable output independent of input order", () => {
    const edges = fixture.edges.map((e) => ({ ...e, weight: 1 }));
    expect(strongestEdges(edges, 1)).toEqual(
      strongestEdges([...edges].reverse(), 1),
    );
  });
  test("concert threshold is strict and filters remove dangling edges", () => {
    const filtered = filterGraph(
      fixture,
      { 1: 10, 2: 11, 3: 25, 4: 0 },
      10,
      "",
    );
    expect(filtered.nodes.map((n) => n.id)).toEqual([2, 3]);
    expect(filtered.edges).toEqual([{ source: 2, target: 3, weight: 4 }]);
    expect(filterGraph(fixture, {}, null, "").nodes).toHaveLength(5);
    expect(filterGraph(fixture, {}, 0, "").nodes).toHaveLength(0);
  });
  test("venue membership and instrument filters intersect", () => {
    const data = {
      ...fixture,
      nodes: fixture.nodes.map((n) => ({
        ...n,
        group: n.id === 3 ? "Drums" : "Piano",
      })),
    };
    const filtered = filterGraph(data, { 1: 99, 2: 20, 3: 30 }, 10, "Piano", {
      2: 20,
      3: 30,
    });
    expect(filtered.nodes.map((n) => n.id)).toEqual([2]);
    expect(filtered.edges).toEqual([]);
  });
});
