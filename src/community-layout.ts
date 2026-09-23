import {
  forceCenter,
  forceCollide,
  forceLink,
  forceManyBody,
  forceSimulation,
  forceY,
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
// Fragments of at most this many musicians join a neighbouring community.
const MERGE_BELOW = 2;
// Vertical pulls tried for the main network's community-level layout.
const SQUASH = [0, 0.02, 0.04];
// Small networks keep their natural shape; chains must not fold.
const SQUASH_ABOVE = 12;

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
  // Fold tiny fragments into the community they play with most, so a duo
  // sits beside its collaborators instead of floating as its own circle.
  const weights = new Map<number, number>();
  for (const e of edges) weights.set(e.source * 1e6 + e.target, e.weight);
  const tie = (a: number, b: number) =>
    weights.get(Math.min(a, b) * 1e6 + Math.max(a, b)) ?? 0;
  const smallest = [...groups].sort(
    (a, b) => a.members.length - b.members.length || a.id - b.id,
  );
  for (const group of smallest) {
    if (group.members.length > MERGE_BELOW) break;
    const pull = new Map<Community, number>();
    for (const n of group.members)
      for (const next of neighbors.get(n.id)!) {
        const other = membership.get(next)!;
        if (other === group) continue;
        pull.set(
          other,
          (pull.get(other) ?? 0) + Math.log2(1 + tie(n.id, next)),
        );
      }
    let target: Community | null = null;
    for (const [other, weight] of pull)
      if (
        other.members.length >= group.members.length &&
        (!target ||
          weight > pull.get(target)! ||
          (weight === pull.get(target)! && other.id < target.id))
      )
        target = other;
    if (!target) continue;
    for (const n of group.members) {
      target.members.push(n);
      membership.set(n.id, target);
    }
    group.members = [];
  }
  for (let i = groups.length - 1; i >= 0; i--)
    if (!groups[i].members.length) groups.splice(i, 1);
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
  const arrange = (index: number, squash: number) => {
    const island = islands[index];
    const circles = island.groups.sort((a, b) => b.r - a.r || a.id - b.id);
    for (const g of circles) {
      delete (g as { vx?: number }).vx;
      delete (g as { vy?: number }).vy;
    }
    packSiblings(circles);
    if (circles.length > 1) {
      const links = islandLinks[index];
      const maxWeight = Math.max(...links.map((e) => e.weight), 1);
      const simulation = forceSimulation(circles)
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
        .stop();
      // Vertical pull flattens the network toward the screen's shape.
      if (squash)
        simulation.force("squash", forceY<Community>(0).strength(squash));
      simulation.tick(360);
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
  };
  // Bounding box of an island's community circles, padded by 1.5 gaps so
  // neighbouring components stay as distinct as with enclosing circles.
  type Box = {
    island: (typeof islands)[number];
    x0: number;
    y0: number;
    w: number;
    h: number;
  };
  const box = (island: (typeof islands)[number]): Box => {
    let x0 = Infinity,
      y0 = Infinity,
      x1 = -Infinity,
      y1 = -Infinity;
    for (const g of island.groups) {
      x0 = Math.min(x0, g.x - g.r);
      y0 = Math.min(y0, g.y - g.r);
      x1 = Math.max(x1, g.x + g.r);
      y1 = Math.max(y1, g.y + g.r);
    }
    return {
      island,
      x0: x0 - (gap * 1.5) / 2,
      y0: y0 - (gap * 1.5) / 2,
      w: x1 - x0 + gap * 1.5,
      h: y1 - y0 + gap * 1.5,
    };
  };
  // Unrelated components have no meaningful relative direction. Keep the
  // largest on the left and shelf-pack the rest beside it, filling a
  // screen-shaped rectangle instead of a ring around the main network.
  // Packing uses bounding boxes, which are tighter than enclosing circles.
  const size = (island: (typeof islands)[number]) =>
    island.groups.reduce((sum, g) => sum + g.r * g.r, 0);
  let mainIndex = 0;
  islands.forEach((island, index) => {
    if (
      size(island) > size(islands[mainIndex]) ||
      (size(island) === size(islands[mainIndex]) &&
        island.groups[0].id < islands[mainIndex].groups[0].id)
    )
      mainIndex = index;
  });
  islands.forEach((_, index) => {
    if (index !== mainIndex) arrange(index, 0);
  });
  const rest = islands
    .filter((_, index) => index !== mainIndex)
    .map(box)
    .sort(
      (a, b) =>
        b.h - a.h || b.w - a.w || a.island.groups[0].id - b.island.groups[0].id,
    );
  const restArea = rest.reduce((sum, b) => sum + b.w * b.h, 0);
  const narrowest = Math.max(0, ...rest.map((b) => b.w));
  const shelf = (width: number) => {
    let x = 0,
      y = 0,
      row = 0,
      used = 0;
    const spots: [Box, number, number][] = [];
    for (const b of rest) {
      if (x > 0 && x + b.w > width) {
        x = 0;
        y += row;
        row = 0;
      }
      spots.push([b, x, y]);
      x += b.w;
      used = Math.max(used, x);
      row = Math.max(row, b.h);
    }
    return { spots, used, total: y + row };
  };
  // Column widths to try, from one component wide to a broad block.
  const shelves = rest.length
    ? Array.from({ length: 49 }, (_, step) =>
        shelf(Math.max(narrowest, Math.sqrt(restArea) * 0.08 * 1.1 ** step)),
      )
    : [{ spots: [], used: 0, total: 0 }];
  // Extent in viewport heights; smaller means a larger fitted zoom.
  const fit = (main: Box) => {
    let best = shelves[0],
      bestScale = Infinity;
    for (const packed of shelves) {
      const scale = Math.max(
        (main.w + packed.used) / ASPECT,
        main.h,
        packed.total,
      );
      if (scale < bestScale) {
        bestScale = scale;
        best = packed;
      }
    }
    return { scale: bestScale, packed: best };
  };
  // The main network is laid out with a few vertical pulls; keep the one
  // whose packed result fills the screen best.
  let chosen: { scale: number; positions: [number, number][] } | null = null;
  const pulls = islands[mainIndex].groups.length >= SQUASH_ABOVE ? SQUASH : [0];
  for (const squash of pulls) {
    arrange(mainIndex, squash);
    const { scale } = fit(box(islands[mainIndex]));
    if (!chosen || scale < chosen.scale - 1e-9)
      chosen = {
        scale,
        positions: islands[mainIndex].groups.map((g) => [g.x, g.y]),
      };
  }
  islands[mainIndex].groups.forEach((g, i) => {
    [g.x, g.y] = chosen!.positions[i];
  });
  const main = box(islands[mainIndex]);
  const place = (b: Box, left: number, top: number) => {
    b.island.x = left - b.x0;
    b.island.y = top - b.y0;
  };
  place(main, 0, -main.h / 2);
  const { packed } = fit(main);
  // Center the strip vertically beside the main network.
  for (const [b, bx, by] of packed.spots)
    place(b, main.w + bx, by - packed.total / 2);
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
