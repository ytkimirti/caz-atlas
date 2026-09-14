import { describe, expect, test } from "bun:test";
import {
  adjacency,
  shortestPath,
  mergeEdge,
  filterGraph,
  topCollaboratorEdges,
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
  test("keeps each musician's strongest partners even with few shared concerts", () => {
    const edges = [
      { source: 1, target: 2, weight: 100 },
      { source: 1, target: 3, weight: 2 },
      { source: 2, target: 3, weight: 1 },
      { source: 4, target: 5, weight: 1 },
    ];
    expect(topCollaboratorEdges(edges, 1)).toEqual([
      edges[0],
      edges[1],
      edges[3],
    ]);
    expect(topCollaboratorEdges(edges, 2)).toEqual(edges);
    expect(topCollaboratorEdges(edges, null)).toEqual(edges);
    expect(topCollaboratorEdges([], 5)).toEqual([]);
    expect(topCollaboratorEdges(edges, 0)).toEqual([]);
  });
  test("one endpoint's choice is sufficient, so hubs can exceed the limit", () => {
    const edges = [2, 3, 4, 5].map((id) => ({
      source: 1,
      target: id,
      weight: 10 - id,
    }));
    expect(topCollaboratorEdges(edges, 1)).toEqual(edges);
  });
  test("equal weights are deterministic across edge order and direction", () => {
    const edges = [
      { source: 1, target: 2, weight: 1 },
      { source: 1, target: 3, weight: 1 },
      { source: 2, target: 3, weight: 1 },
    ];
    expect(topCollaboratorEdges(edges, 1)).toEqual(edges.slice(0, 2));
    expect(topCollaboratorEdges([...edges].reverse(), 1)).toEqual([
      edges[1],
      edges[0],
    ]);
    const reversed = edges.map((e) => ({
      ...e,
      source: e.target,
      target: e.source,
    }));
    expect(topCollaboratorEdges(reversed, 1)).toEqual(reversed.slice(0, 2));
  });
  test("hidden ties remain available for hover and shortest paths", () => {
    expect(topCollaboratorEdges(fixture.edges, 1)).not.toContainEqual({
      source: 1,
      target: 4,
      weight: 1,
    });
    const full = adjacency(fixture);
    expect(full.get(1)).toContainEqual({ id: 4, weight: 1 });
    expect(shortestPath(full, 1, 4)).toEqual([1, 4]);
  });
  test("ranks eligible partners using the selected venue's counts", () => {
    const venueGraph = filterGraph(
      {
        ...fixture,
        edges: [
          { source: 1, target: 2, weight: 1 },
          { source: 2, target: 3, weight: 2 },
          { source: 1, target: 3, weight: 3 },
          { source: 1, target: 4, weight: 100 },
        ],
      },
      { 1: 20, 2: 20, 3: 20, 4: 1 },
      10,
      "",
      { 1: 20, 2: 20, 3: 20, 4: 1 },
    );
    expect(topCollaboratorEdges(fixture.edges, 1)).toContainEqual({
      source: 1,
      target: 2,
      weight: 3,
    });
    expect(topCollaboratorEdges(venueGraph.edges, 1)).toEqual([
      { source: 2, target: 3, weight: 2 },
      { source: 1, target: 3, weight: 3 },
    ]);
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
