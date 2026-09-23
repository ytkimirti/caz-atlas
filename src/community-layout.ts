import {
  forceCenter,
  forceCollide,
  forceLink,
  forceManyBody,
  forceSimulation,
} from "d3-force";
import type { SimulationLinkDatum } from "d3-force";
import { packEnclose, packSiblings } from "d3-hierarchy";
import { UndirectedGraph } from "graphology";
import louvain from "graphology-communities-louvain";
import { layoutLinks } from "./layout-links";
import { separate, simulateLocal } from "./local-force";
import type { LayoutNode, LayoutRequest, Position } from "./layout";
import type { Edge } from "./types";

type Member = LayoutNode & Position;
interface Community {
  id: number;
  members: Member[];
  edges: Edge[];
  x: number;
  y: number;
  r: number;
}
type CommunityLink = SimulationLinkDatum<Community> & { weight: number };
export interface CommunityResult {
  positions: Position[];
  communities: {
    id: number;
    members: number[];
    x: number;
    y: number;
    r: number;
  }[];
}

// Typical desktop viewport, used to shape the packing of disconnected parts.
const ASPECT = 1.6;

export function computeCommunityLayout(
  request: LayoutRequest,
): CommunityResult {
  const { spacing } = request;
  const nodes = [...request.nodes].sort((a, b) => a.id - b.id);
  if (!nodes.length) return { positions: [], communities: [] };
  const ids = new Set(nodes.map((n) => n.id));
  const edges = request.edges
    .filter(
      (e) => ids.has(e.source) && ids.has(e.target) && e.source !== e.target,
    )
    .map((e) => ({
      source: Math.min(e.source, e.target),
      target: Math.max(e.source, e.target),
      weight: e.weight,
    }))
    .sort(
      (a, b) =>
        a.source - b.source || a.target - b.target || b.weight - a.weight,
    );
  const graph = new UndirectedGraph();
  const neighbors = new Map(nodes.map((n) => [n.id, [] as number[]]));
  const byId = new Map(nodes.map((n) => [n.id, n]));
  for (const n of nodes) graph.addNode(n.id);
  for (const e of edges) {
    graph.mergeEdge(e.source, e.target, { weight: Math.log2(1 + e.weight) });
    neighbors.get(e.source)!.push(e.target);
    neighbors.get(e.target)!.push(e.source);
  }
  const labels = louvain(graph, {
    randomWalk: false,
    resolution: request.resolution ?? 1.5,
  });
  const membership = new Map<number, Community>();
  const groups: Community[] = [];
  // Split disconnected pieces using the full induced graph, before sparsifying.
  for (const n of nodes) {
    if (membership.has(n.id)) continue;
    const group: Community = {
      id: n.id,
      members: [],
      edges: [],
      x: 0,
      y: 0,
      r: 0,
    };
    const queue = [n.id];
    membership.set(n.id, group);
    for (let i = 0; i < queue.length; i++) {
      const id = queue[i];
      group.members.push({ ...byId.get(id)!, x: 0, y: 0 });
      for (const next of neighbors.get(id)!) {
        if (membership.has(next) || labels[next] !== labels[id]) continue;
        membership.set(next, group);
        queue.push(next);
      }
    }
    groups.push(group);
  }
  const ties = new Map<
    string,
    { source: number; target: number; weight: number }
  >();
  for (const e of edges) {
    const a = membership.get(e.source)!,
      b = membership.get(e.target)!;
    if (a === b) {
      a.edges.push(e);
      continue;
    }
    const source = Math.min(a.id, b.id),
      target = Math.max(a.id, b.id);
    const key = `${source}:${target}`;
    const tie = ties.get(key) ?? { source, target, weight: 0 };
    tie.weight += Math.log2(1 + e.weight);
    ties.set(key, tie);
  }
  const clearance = (n: LayoutNode) =>
    (8 + Math.log2(1 + n.count) * 2) * spacing;
  const gap = 32 * spacing;
  for (const group of groups) {
    group.members.sort((a, b) => b.count - a.count || a.id - b.id);
    group.members.forEach((n, i) => {
      const radius = Math.sqrt(i) * 25 * spacing;
      n.x = Math.cos(i * 2.3999632297) * radius;
      n.y = Math.sin(i * 2.3999632297) * radius;
    });
    if (group.members.length > 1) {
      // Attraction is local to a community. Different groups never share this origin.
      const index = new Map(group.members.map((n, i) => [n.id, i]));
      const xs = Float64Array.from(group.members, (n) => n.x),
        ys = Float64Array.from(group.members, (n) => n.y);
      simulateLocal(
        xs,
        ys,
        layoutLinks(group.members, group.edges).map((e) => [
          index.get(e.source)!,
          index.get(e.target)!,
          e.weight,
        ]),
        {
          // Frequent partners sit closer; the collision pass keeps clearance.
          distance: (w) => (45 * spacing) / Math.sqrt(1 + Math.log2(w)),
          charge: -45 * spacing,
          gravity: 0.035,
          ticks: 220,
        },
      );
      separate(
        xs,
        ys,
        Float64Array.from(group.members, (n) => clearance(n)),
      );
      group.members.forEach((n, i) => {
        n.x = xs[i];
        n.y = ys[i];
      });
    }
    const circle = packEnclose(
      group.members.map((n) => ({ x: n.x, y: n.y, r: clearance(n) })),
    )!;
    for (const n of group.members) {
      n.x -= circle.x;
      n.y -= circle.y;
    }
    group.r = circle.r + gap / 2;
  }
  // Lay out each connected set of communities using ALL cross-community ties.
  const groupById = new Map(groups.map((g) => [g.id, g]));
  const groupNeighbors = new Map(groups.map((g) => [g.id, [] as number[]]));
  for (const e of ties.values()) {
    groupNeighbors.get(e.source)!.push(e.target);
    groupNeighbors.get(e.target)!.push(e.source);
  }
  const visited = new Set<number>();
  const islands: { groups: Community[]; x: number; y: number; r: number }[] =
    [];
  const islandByGroup = new Map<number, number>();
  for (const g of groups) {
    if (visited.has(g.id)) continue;
    const queue = [g.id];
    visited.add(g.id);
    for (let i = 0; i < queue.length; i++) {
      for (const next of groupNeighbors.get(queue[i])!) {
        if (visited.has(next)) continue;
        visited.add(next);
        queue.push(next);
      }
    }
    const index = islands.length;
    for (const id of queue) islandByGroup.set(id, index);
    islands.push({
      groups: queue.map((id) => groupById.get(id)!),
      x: 0,
      y: 0,
      r: 0,
    });
  }
  const islandLinks: CommunityLink[][] = islands.map(() => []);
  for (const e of ties.values())
    islandLinks[islandByGroup.get(e.source)!].push({ ...e });
  islands.forEach((island, index) => {
    const circles = island.groups.sort((a, b) => b.r - a.r || a.id - b.id);
    packSiblings(circles);
    if (circles.length > 1) {
      const links = islandLinks[index];
      const maxWeight = Math.max(...links.map((e) => e.weight), 1);
      forceSimulation(circles)
        .force(
          "links",
          forceLink<Community, CommunityLink>(links)
            .id((g) => g.id)
            .distance(
              (e) =>
                (e.source as Community).r + (e.target as Community).r + gap * 2,
            )
            .strength((e) => 0.08 + 0.45 * Math.sqrt(e.weight / maxWeight)),
        )
        .force(
          "charge",
          forceManyBody<Community>()
            .strength((g) => -g.r * 5)
            .theta(0.9),
        )
        .force("center", forceCenter(0, 0))
        .force("collision", forceCollide<Community>((g) => g.r).iterations(4))
        .stop()
        .tick(360);
      // Preserve clearance after springs stop, without distorting final coordinates.
      forceSimulation(circles)
        .velocityDecay(0.6)
        .force("collision", forceCollide<Community>((g) => g.r).iterations(6))
        .stop()
        .tick(100);
    }
    // Bounded relaxation can leave tiny intersections in very large networks.
    // Uniformly expand centers by the worst overlap ratio, preserving all
    // directions and relative center distances while enforcing circle clearance.
    let expansion = 1;
    for (let i = 0; i < circles.length; i++) {
      for (let j = i + 1; j < circles.length; j++) {
        const a = circles[i],
          b = circles[j];
        const distance = Math.hypot(a.x - b.x, a.y - b.y);
        if (distance === 0) throw new Error("Coincident community centers");
        expansion = Math.max(expansion, (a.r + b.r + 0.000001) / distance);
      }
    }
    if (expansion > 1)
      for (const g of circles) {
        g.x *= expansion;
        g.y *= expansion;
      }
    const bounds = packEnclose(circles)!;
    for (const g of circles) {
      g.x -= bounds.x;
      g.y -= bounds.y;
    }
    island.r = bounds.r + gap;
  });
  // Unrelated components have no meaningful relative direction. Keep the
  // largest on the left and shelf-pack the rest beside it, filling a
  // screen-shaped rectangle instead of a ring around the main network.
  islands.sort((a, b) => b.r - a.r || a.groups[0].id - b.groups[0].id);
  const [main, ...rest] = islands;
  main.x = main.r;
  main.y = 0;
  if (rest.length) {
    const area = islands.reduce((sum, i) => sum + 4 * i.r * i.r, 0);
    const height = Math.max(2 * main.r, Math.sqrt(area / ASPECT));
    // A narrow column when little remains, never wider than the screen shape.
    const restArea = area - 4 * main.r * main.r;
    const width = Math.max(
      2 * rest[0].r,
      Math.min(ASPECT * height - 2 * main.r, (restArea / height) * 1.15),
    );
    let x = 0,
      y = 0,
      row = 0;
    for (const island of rest) {
      const size = 2 * island.r;
      if (x > 0 && x + size > width) {
        x = 0;
        y += row;
        row = 0;
      }
      island.x = 2 * main.r + x + island.r;
      island.y = y + island.r;
      x += size;
      row = Math.max(row, size);
    }
    // Center the strip vertically beside the main network.
    const shift = (Math.max(y + row, 2 * main.r) - 2 * main.r) / 2;
    const offset = -Math.max(y + row, 2 * main.r) / 2;
    main.y = offset + main.r + shift;
    for (const island of rest) island.y += offset;
  }
  for (const island of islands)
    for (const g of island.groups) {
      g.x += island.x;
      g.y += island.y;
    }
  const positions = groups.flatMap((g) =>
    g.members.map((n) => ({ id: n.id, x: n.x + g.x, y: n.y + g.y })),
  );
  for (const p of positions)
    if (!Number.isFinite(p.x) || !Number.isFinite(p.y))
      throw new Error("Non-finite community position");
  return {
    positions,
    communities: groups.map((g) => ({
      id: g.id,
      members: g.members.map((n) => n.id),
      x: g.x,
      y: g.y,
      r: g.r,
    })),
  };
}
