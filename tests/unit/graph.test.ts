import { describe, expect, test } from "bun:test";
import {
  adjacency,
  shortestPath,
  mergeEdge,
  filterGraph,
  edgesBySharedConcerts,
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
  test("shared concert threshold includes the boundary and all qualifying hub ties", () => {
    const edges = [2, 3, 4, 5].map((id) => ({
      source: 1,
      target: id,
      weight: 10 - id,
    }));
    // A musician's other, stronger ties must not hide this five-concert tie.
    expect(edgesBySharedConcerts(edges, 5)).toEqual(edges);
    expect(edgesBySharedConcerts(edges, 6)).toEqual(edges.slice(0, 3));
    expect(edgesBySharedConcerts(edges, 9)).toEqual([]);
    expect(edgesBySharedConcerts([], 1)).toEqual([]);
    expect(edgesBySharedConcerts(fixture.edges, 1)).toEqual(fixture.edges);
  });
  test("hidden single-concert ties remain available for hover and shortest paths", () => {
    expect(edgesBySharedConcerts(fixture.edges, 2)).not.toContainEqual({
      source: 1,
      target: 4,
      weight: 1,
    });
    const full = adjacency(fixture);
    expect(full.get(1)).toContainEqual({ id: 4, weight: 1 });
    expect(shortestPath(full, 1, 4)).toEqual([1, 4]);
  });
  test("shared concert threshold uses the selected venue's counts", () => {
    const venueGraph = filterGraph(
      { ...fixture, edges: [{ source: 1, target: 2, weight: 1 }] },
      { 1: 20, 2: 20 },
      10,
      "",
      { 1: 20, 2: 20 },
    );
    expect(edgesBySharedConcerts(fixture.edges, 3)).toContainEqual({
      source: 1,
      target: 2,
      weight: 3,
    });
    expect(edgesBySharedConcerts(venueGraph.edges, 3)).toEqual([]);
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
