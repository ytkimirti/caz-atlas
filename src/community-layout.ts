import {
  forceCenter,
  forceCollide,
  forceLink,
  forceManyBody,
  forceSimulation,
  forceX,
  forceY,
} from "d3-force";
import type { SimulationLinkDatum } from "d3-force";
import { packEnclose, packSiblings } from "d3-hierarchy";
import { UndirectedGraph } from "graphology";
import louvain from "graphology-communities-louvain";
import { layoutLinks } from "./layout-links";
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
      forceSimulation(group.members)
        .force(
          "links",
          forceLink<Member, Edge>(layoutLinks(group.members, group.edges))
            .id((n) => n.id)
            .distance(45 * spacing),
        )
        .force("charge", forceManyBody<Member>().strength(-45 * spacing))
        .force("x", forceX(0).strength(0.035))
        .force("y", forceY(0).strength(0.035))
        .force("collision", forceCollide<Member>(clearance).iterations(3))
        .stop()
        .tick(220);
      forceSimulation(group.members)
        .velocityDecay(0.6)
        .force("collision", forceCollide<Member>(clearance).iterations(4))
        .stop()
        .tick(60);
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
  // Unrelated components have no meaningful relative direction. Pack their
  // enclosing circles without altering relationships inside each component.
  islands.sort((a, b) => b.r - a.r || a.groups[0].id - b.groups[0].id);
  packSiblings(islands);
  for (const island of islands) {
    for (const g of island.groups) {
      g.x += island.x;
      g.y += island.y;
    }
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
