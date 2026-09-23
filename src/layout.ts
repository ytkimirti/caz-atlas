import { UndirectedGraph } from "graphology";
import { computeCommunityLayout } from "./community-layout";
import { layoutLinks } from "./layout-links";
import { separate, simulateLocal } from "./local-force";
const D3_GRAVITY = 0.02;
// Final clearance pass; stops early once no markers intersect.
const COLLISION_PASSES = 400;
// Large components start FA2 and ngraph from a short d3-style layout, so a
// few hundred milliseconds of Barnes-Hut replace most of their iterations.
const SEED_ABOVE = 400;
const SEED_TICKS = 80;
const FORCEATLAS2_ITERATIONS = 60;
const NGRAPH_STEPS = 0.5;
export { layoutLinks } from "./layout-links";
import forceAtlas2 from "graphology-layout-forceatlas2";
import createGraph from "ngraph.graph";
import createLayout from "ngraph.forcelayout";
import type { Edge } from "./types";
import type { LayoutEngine, ViewMode } from "./layout-options";

export interface LayoutNode {
  id: number;
  count: number;
}
export interface Position {
  id: number;
  x: number;
  y: number;
  z?: number;
}
export interface LayoutRequest {
  nodes: LayoutNode[];
  edges: Edge[];
  engine: LayoutEngine;
  spacing: number;
  resolution?: number;
  mode?: ViewMode;
}
export type LayoutResponse =
  { status: "ready"; positions: Position[] } | { status: "fallback" };
type Particle = LayoutNode & Position & { vx?: number; vy?: number };

function simulate(
  nodes: Particle[],
  edges: Edge[],
  engine: LayoutEngine,
  spacing: number,
  spatial: boolean,
) {
  if (nodes.length < 2) return;
  const iterations = nodes.length > 5000 ? 200 : 320;
  // d3-force semantics (link, many-body, weak centering) on typed arrays.
  const d3Layout = (ticks: number) => {
    const index = new Map(nodes.map((n, i) => [n.id, i]));
    const xs = Float64Array.from(nodes, (n) => n.x),
      ys = Float64Array.from(nodes, (n) => n.y);
    simulateLocal(
      xs,
      ys,
      edges.map((e) => [index.get(e.source)!, index.get(e.target)!, e.weight]),
      {
        distance: () => 65,
        charge: -180 * spacing,
        gravity: D3_GRAVITY,
        ticks,
      },
    );
    separate(xs, ys, new Float64Array(nodes.length).fill(12 * spacing), 20);
    nodes.forEach((n, i) => {
      n.x = xs[i];
      n.y = ys[i];
    });
  };
  const seeded = !spatial && nodes.length > SEED_ABOVE;
  if (seeded && engine !== "d3") d3Layout(SEED_TICKS);
  if (!spatial && engine === "d3") {
    d3Layout(iterations);
  } else if (!spatial && engine === "forceatlas2") {
    const graph = new UndirectedGraph();
    for (const n of nodes) graph.addNode(n.id, { x: n.x, y: n.y, size: 3 });
    for (const e of edges)
      graph.mergeEdge(e.source, e.target, { weight: Math.log2(1 + e.weight) });
    const positions = forceAtlas2(graph, {
      iterations: seeded ? FORCEATLAS2_ITERATIONS : iterations,
      settings: {
        ...forceAtlas2.inferSettings(graph),
        linLogMode: true,
        outboundAttractionDistribution: true,
        scalingRatio: 8 * spacing,
        gravity: 0.6,
        strongGravityMode: false,
        barnesHutOptimize: nodes.length > 300,
        // Gephi's default; graphology's 0.5 is several times slower.
        barnesHutTheta: 1.2,
        slowDown: 5,
        edgeWeightInfluence: 0.5,
      },
    });
    for (const n of nodes) Object.assign(n, positions[n.id]);
  } else {
    const graph = createGraph();
    for (const n of nodes) graph.addNode(n.id);
    for (const e of edges) graph.addLink(e.source, e.target);
    const layout = createLayout(graph, {
      dimensions: spatial ? 3 : 2,
      springLength: 65,
      springCoefficient: 0.0006,
      gravity: -12 * spacing,
      dragCoefficient: 0.9,
      timeStep: 20,
      theta: 0.8,
    });
    try {
      for (const n of nodes) layout.setNodePosition(n.id, n.x, n.y, n.z ?? 0);
      for (let i = 0; i < iterations * (seeded ? NGRAPH_STEPS : 2); i++)
        if (layout.step()) break;
      for (const n of nodes) {
        const p = layout.getNodePosition(n.id);
        n.x = p.x;
        n.y = p.y;
        if (spatial) n.z = p.z ?? 0;
      }
    } finally {
      layout.dispose();
    }
  }

  // Normalize each component by its population, not its edge lengths. A few
  // very long springs must not shrink a dense community into a tiny dot.
  const median = (values: number[]) =>
    values.sort((a, b) => a - b)[Math.floor(values.length / 2)];
  const centerX = median(nodes.map((n) => n.x));
  const centerY = median(nodes.map((n) => n.y));
  const centerZ = spatial ? median(nodes.map((n) => n.z ?? 0)) : 0;
  const typicalRadius =
    median(
      nodes.map((n) =>
        Math.hypot(
          n.x - centerX,
          n.y - centerY,
          spatial ? (n.z ?? 0) - centerZ : 0,
        ),
      ),
    ) || 1;
  const scale =
    (spatial
      ? 32 * Math.cbrt(nodes.length) * spacing
      : 14 * Math.sqrt(nodes.length)) / typicalRadius;
  for (const n of nodes) {
    const dx = n.x - centerX,
      dy = n.y - centerY,
      dz = spatial ? (n.z ?? 0) - centerZ : 0;
    const radius = Math.hypot(dx, dy, dz);
    // Compress only long tails, retaining directions and local communities.
    const limit = typicalRadius * 2;
    const compressed =
      radius > limit
        ? limit + limit * Math.log1p((radius - limit) / limit)
        : radius;
    const factor = radius ? (scale * compressed) / radius : scale;
    n.x = dx * factor;
    n.y = dy * factor;
    if (spatial) n.z = dz * factor;
    n.vx = 0;
    n.vy = 0;
  }
  if (spatial) return;
  const xs = Float64Array.from(nodes, (n) => n.x),
    ys = Float64Array.from(nodes, (n) => n.y);
  separate(
    xs,
    ys,
    Float64Array.from(nodes, (n) => (8 + Math.log2(1 + n.count) * 2) * spacing),
    COLLISION_PASSES,
    1,
  );
  nodes.forEach((n, i) => {
    n.x = xs[i];
    n.y = ys[i];
  });
}

export function computeLayout(request: LayoutRequest): Position[] {
  const { engine, spacing } = request;
  const spatial = request.mode === "3d";
  if (!spatial && engine === "communities")
    return computeCommunityLayout(request).positions;
  const nodes: Particle[] = [...request.nodes]
    .sort((a, b) => b.count - a.count || a.id - b.id)
    .map((n, i) => ({
      ...n,
      x: Math.cos(i * 2.3999632297) * Math.sqrt(i) * 19,
      y: Math.sin(i * 2.3999632297) * Math.sqrt(i) * 19,
      ...(spatial ? { z: Math.sin(i * 1.6180339887) * Math.sqrt(i) * 19 } : {}),
    }));
  if (!nodes.length) return [];
  const edges = layoutLinks(nodes, request.edges);
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const neighbors = new Map(nodes.map((n) => [n.id, [] as number[]]));
  for (const e of edges) {
    neighbors.get(e.source)!.push(e.target);
    neighbors.get(e.target)!.push(e.source);
  }
  const componentOf = new Map<number, number>();
  const components: { nodes: Particle[]; edges: Edge[] }[] = [];
  for (const n of nodes) {
    if (componentOf.has(n.id)) continue;
    const index = components.length;
    const ids = [n.id];
    componentOf.set(n.id, index);
    for (let i = 0; i < ids.length; i++) {
      for (const id of neighbors.get(ids[i])!) {
        if (componentOf.has(id)) continue;
        componentOf.set(id, index);
        ids.push(id);
      }
    }
    components.push({ nodes: ids.map((id) => byId.get(id)!), edges: [] });
  }
  for (const e of edges) components[componentOf.get(e.source)!].edges.push(e);
  const boxes = components
    .map((c) => {
      simulate(c.nodes, c.edges, engine, spacing, spatial);
      let minX = Infinity,
        minY = Infinity,
        maxX = -Infinity,
        maxY = -Infinity;
      for (const n of c.nodes) {
        if (
          !Number.isFinite(n.x) ||
          !Number.isFinite(n.y) ||
          (spatial && !Number.isFinite(n.z))
        )
          throw new Error("Non-finite layout position");
        minX = Math.min(minX, n.x);
        minY = Math.min(minY, n.y);
        maxX = Math.max(maxX, n.x);
        maxY = Math.max(maxY, n.y);
      }
      const padding = 28 * spacing;
      return {
        ...c,
        minX,
        minY,
        padding,
        width: maxX - minX + padding * 2,
        height: maxY - minY + padding * 2,
      };
    })
    .sort((a, b) => b.height - a.height || b.width - a.width);
  // Pack disconnected components, including isolates, into separate boxes.
  // They cannot drift to infinity and shrink the connected graph when fitting.
  const rowWidth = Math.max(
    ...boxes.map((b) => b.width),
    Math.sqrt(boxes.reduce((area, b) => area + b.width * b.height, 0) * 1.5),
  );
  let x = 0,
    y = 0,
    rowHeight = 0;
  for (const box of boxes) {
    if (x > 0 && x + box.width > rowWidth) {
      x = 0;
      y += rowHeight;
      rowHeight = 0;
    }
    for (const n of box.nodes) {
      n.x += x - box.minX + box.padding;
      n.y += y - box.minY + box.padding;
    }
    x += box.width;
    rowHeight = Math.max(rowHeight, box.height);
  }
  return nodes.map(({ id, x, y, z }) => ({
    id,
    x,
    y,
    ...(spatial ? { z } : {}),
  }));
}
