// Read-only benchmark of the checked-in concert dataset. No collection or writes.
import {
  forceCollide,
  forceLink,
  forceManyBody,
  forceSimulation,
  forceX,
  forceY,
} from "d3-force";
import { computeLayout } from "../src/layout";
import type { Position } from "../src/layout";
import { layoutEngines } from "../src/layout-options";
import { filterGraph } from "../src/graph";
import type { Atlas, ConcertIndex, Edge } from "../src/types";
const atlas: Atlas = await Bun.file(
  new URL("../public/data/atlas.json", import.meta.url),
).json();
const concerts: ConcertIndex = await Bun.file(
  new URL("../public/data/concerts.json", import.meta.url),
).json();
const graph = filterGraph(
  { nodes: atlas.nodes, edges: concerts.edges },
  concerts.counts,
  process.argv.includes("--all") ? null : 10,
);
const nodes = graph.nodes.map((n) => ({
  id: n.id,
  count: concerts.counts[n.id] ?? 0,
}));
function baseline(): Position[] {
  const particles = [...nodes]
    .sort((a, b) => b.count - a.count || a.id - b.id)
    .map((n, i) => ({
      ...n,
      x: Math.cos(i * 2.3999632297) * Math.sqrt(i) * 19,
      y: Math.sin(i * 2.3999632297) * Math.sqrt(i) * 19,
    }));
  const degree = new Map<number, number>();
  const links = [...graph.edges]
    .sort(
      (a, b) =>
        b.weight - a.weight || a.source - b.source || a.target - b.target,
    )
    .filter((e) => {
      const a = degree.get(e.source) || 0,
        b = degree.get(e.target) || 0;
      degree.set(e.source, a + 1);
      degree.set(e.target, b + 1);
      return a < 3 || b < 3;
    })
    .map((e) => ({ ...e }));
  forceSimulation(particles)
    .force(
      "link",
      forceLink<(typeof particles)[number], Edge>(links)
        .id((n) => n.id)
        .distance(45)
        .strength(0.22),
    )
    .force("charge", forceManyBody().strength(-65).distanceMax(500))
    .force("x", forceX(0).strength(0.012))
    .force("y", forceY(0).strength(0.012))
    .force("collision", forceCollide(11).iterations(2))
    .stop()
    .tick(nodes.length > 5000 ? 160 : 240);
  return particles;
}
function metrics(positions: Position[], aspect = 1) {
  const xs = positions.map((n) => n.x * aspect),
    ys = positions.map((n) => n.y);
  const minX = Math.min(...xs),
    minY = Math.min(...ys),
    maxX = Math.max(...xs),
    maxY = Math.max(...ys);
  const zoom = Math.max(
    0.025,
    Math.min(2, 1392 / (maxX - minX || 1), 822 / (maxY - minY || 1)),
  );
  const points = positions.map((n) => ({
    x: n.x * aspect * zoom,
    y: n.y * zoom,
    radius: Math.max(
      aspect === 1.35 ? 2 : 0.75,
      Math.min(
        9,
        (2 + Math.log2(1 + (concerts.counts[n.id] || 1)) * 0.5) *
          Math.sqrt(zoom),
      ),
    ),
  }));
  const cells = new Map<string, number>();
  for (const p of points) {
    const key = `${Math.floor((p.x - minX * zoom) / 100)},${Math.floor((p.y - minY * zoom) / 100)}`;
    cells.set(key, (cells.get(key) ?? 0) + 1);
  }
  let overlaps = 0;
  const crowded = new Set<number>();
  for (let i = 0; i < points.length; i++) {
    for (let j = i + 1; j < points.length; j++) {
      if (
        Math.hypot(points[i].x - points[j].x, points[i].y - points[j].y) <
        points[i].radius + points[j].radius
      ) {
        overlaps++;
        crowded.add(i);
        crowded.add(j);
      }
    }
  }
  const centralNodes = points.filter(
    (p) =>
      Math.abs(p.x - ((minX + maxX) / 2) * zoom) < 1512 * 0.2 &&
      Math.abs(p.y - ((minY + maxY) / 2) * zoom) < 982 * 0.2,
  ).length;
  return {
    overlaps,
    crowded: crowded.size,
    centralNodes,
    densest100px: Math.max(...cells.values()),
    zoom: +zoom.toFixed(3),
  };
}
for (const engine of ["original", ...layoutEngines.map((e) => e.id)] as const) {
  const only = process.argv
    .find((arg) => arg.startsWith("--engine="))
    ?.split("=")[1];
  if (only && engine !== "original" && engine !== only) continue;
  const started = performance.now();
  const positions =
    engine === "original"
      ? baseline()
      : computeLayout({ nodes, edges: graph.edges, engine, spacing: 1 });
  const ms = Math.round(performance.now() - started);
  console.log(
    JSON.stringify({
      engine,
      nodes: nodes.length,
      ms,
      ...metrics(positions, engine === "original" ? 1.35 : 1),
    }),
  );
}
