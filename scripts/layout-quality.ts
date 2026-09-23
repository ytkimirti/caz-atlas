// Read-only layout feedback: timing, readability metrics and a rendered PNG.
// Usage: bun run scripts/layout-quality.ts [--min=N]
//   [--resolution=1.5] [--spacing=1] [--png=.cache/quality.png] [--no-png]
import { mkdir } from "node:fs/promises";
import { computeLayout } from "../src/layout";
import type { Position } from "../src/layout";
import { filterGraph, topCollaboratorEdges } from "../src/graph";
import { groupInfo } from "../src/types";
import type { Atlas, ConcertIndex } from "../src/types";

const arg = (name: string) =>
  process.argv.find((a) => a.startsWith(`--${name}=`))?.split("=")[1];
const atlas: Atlas = await Bun.file(
  new URL("../public/data/atlas.json", import.meta.url),
).json();
const concerts: ConcertIndex = await Bun.file(
  new URL("../public/data/concerts.json", import.meta.url),
).json();
const min = arg("min") ? Number(arg("min")) : null;
const graph = filterGraph(
  { nodes: atlas.nodes, edges: concerts.edges },
  concerts.counts,
  min,
  concerts.counts,
);
const nodes = graph.nodes.map((n) => ({
  id: n.id,
  count: concerts.counts[n.id] ?? 0,
}));
const started = performance.now();
const positions = computeLayout({
  nodes,
  edges: graph.edges,
  spacing: Number(arg("spacing") ?? 1),
  resolution: Number(arg("resolution") ?? 3),
});
const ms = Math.round(performance.now() - started);

function layoutMetrics(
  positions: Position[],
  edges: { source: number; target: number; weight: number }[],
  counts: Record<string, number>,
  viewport = { width: 1392, height: 822 },
) {
  const n = positions.length;
  const index = new Map(positions.map((p, i) => [p.id, i]));
  const xs = new Float64Array(n),
    ys = new Float64Array(n);
  positions.forEach((p, i) => {
    xs[i] = p.x;
    ys[i] = p.y;
  });
  let minX = Infinity,
    minY = Infinity,
    maxX = -Infinity,
    maxY = -Infinity;
  for (let i = 0; i < n; i++) {
    minX = Math.min(minX, xs[i]);
    maxX = Math.max(maxX, xs[i]);
    minY = Math.min(minY, ys[i]);
    maxY = Math.max(maxY, ys[i]);
  }
  const zoom = Math.min(
    viewport.width / (maxX - minX || 1),
    viewport.height / (maxY - minY || 1),
  );
  // Same marker formula as Network.tsx at the fitted zoom.
  const radius = (id: number) =>
    Math.max(
      0.75,
      Math.min(
        9,
        (2 + Math.log2(1 + (counts[id] || 1)) * 0.5) * Math.sqrt(zoom),
      ),
    );
  const cell = 20;
  const grid = new Map<string, number[]>();
  const sx = (i: number) => (xs[i] - minX) * zoom,
    sy = (i: number) => (ys[i] - minY) * zoom;
  for (let i = 0; i < n; i++) {
    const key = `${Math.floor(sx(i) / cell)},${Math.floor(sy(i) / cell)}`;
    const items = grid.get(key) ?? [];
    items.push(i);
    grid.set(key, items);
  }
  let overlaps = 0;
  let inked = 0;
  for (let i = 0; i < n; i++) {
    const r = radius(positions[i].id);
    inked += Math.PI * r * r;
    const cx = Math.floor(sx(i) / cell),
      cy = Math.floor(sy(i) / cell);
    for (let dx = -1; dx <= 1; dx++)
      for (let dy = -1; dy <= 1; dy++)
        for (const j of grid.get(`${cx + dx},${cy + dy}`) ?? []) {
          if (j <= i) continue;
          const d = Math.hypot(sx(i) - sx(j), sy(i) - sy(j));
          if (d < r + radius(positions[j].id)) overlaps++;
        }
  }
  // Neighbourhood preservation: of each musician's k nearest markers, how
  // many are actual collaborators (k = min(degree, 10)). 1 is ideal.
  const adjacency = new Map<number, Set<number>>();
  for (const e of edges) {
    const a = index.get(e.source),
      b = index.get(e.target);
    if (a === undefined || b === undefined) continue;
    (adjacency.get(a) ?? adjacency.set(a, new Set()).get(a)!).add(b);
    (adjacency.get(b) ?? adjacency.set(b, new Set()).get(b)!).add(a);
  }
  let precision = 0,
    measured = 0;
  const nearest: number[] = [];
  const distances = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++)
      distances[j] = (xs[i] - xs[j]) ** 2 + (ys[i] - ys[j]) ** 2;
    distances[i] = Infinity;
    let first = Infinity;
    for (let j = 0; j < n; j++) first = Math.min(first, distances[j]);
    nearest.push(Math.sqrt(first));
    const ties = adjacency.get(i);
    if (!ties) continue;
    const k = Math.min(ties.size, 10);
    // Partial selection of the k nearest.
    const best: number[] = [];
    for (let j = 0; j < n; j++) {
      if (best.length < k) {
        best.push(j);
        best.sort((a, b) => distances[a] - distances[b]);
      } else if (distances[j] < distances[best[k - 1]]) {
        best[k - 1] = j;
        best.sort((a, b) => distances[a] - distances[b]);
      }
    }
    precision += best.filter((j) => ties.has(j)).length / k;
    measured++;
  }
  const median = (values: number[]) =>
    [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)] ?? 0;
  const spacing = median(nearest) || 1;
  const lengths = edges.flatMap((e) => {
    const a = index.get(e.source),
      b = index.get(e.target);
    return a === undefined || b === undefined
      ? []
      : [Math.hypot(xs[a] - xs[b], ys[a] - ys[b]) / spacing];
  });
  const strong = edges
    .filter((e) => e.weight >= 5)
    .flatMap((e) => {
      const a = index.get(e.source),
        b = index.get(e.target);
      return a === undefined || b === undefined
        ? []
        : [Math.hypot(xs[a] - xs[b], ys[a] - ys[b]) / spacing];
    });
  return {
    nodes: n,
    zoom: +zoom.toFixed(4),
    // Share of the fitted viewport covered by markers; higher uses space better.
    fill: +(inked / (viewport.width * viewport.height)).toFixed(4),
    overlapPairs: overlaps,
    knnPrecision: +(precision / (measured || 1)).toFixed(4),
    edgeLength: +median(lengths).toFixed(2),
    strongEdgeLength: +median(strong).toFixed(2),
  };
}

const metrics = layoutMetrics(positions, graph.edges, concerts.counts);
console.log(JSON.stringify({ min, ms, ...metrics }));

if (!process.argv.includes("--no-png")) {
  const { chromium } = await import("@playwright/test");
  const path = arg("png") ?? `.cache/quality-${min ?? "all"}.png`;
  await mkdir(new URL("../.cache", import.meta.url), { recursive: true });
  const byPosition = new Map(positions.map((p) => [p.id, p]));
  const group = new Map(atlas.nodes.map((n) => [n.id, n.group]));
  const payload = {
    nodes: positions.map((p) => [
      p.x,
      p.y,
      concerts.counts[p.id] ?? 0,
      groupInfo(group.get(p.id) ?? "").color,
    ]),
    edges: topCollaboratorEdges(graph.edges, 3).map((e) => {
      const a = byPosition.get(e.source)!,
        b = byPosition.get(e.target)!;
      return [a.x, a.y, b.x, b.y];
    }),
  };
  const browser = await chromium.launch({ channel: "chrome", headless: true });
  try {
    const page = await browser.newPage({
      viewport: { width: 1400, height: 1000 },
      deviceScaleFactor: 2,
    });
    await page.setContent(
      `<body style="margin:0;background:#f7f6f1"><canvas width=2800 height=2000 style="width:1400px;height:1000px"></canvas></body>`,
    );
    await page.evaluate((data) => {
      const canvas = document.querySelector("canvas")!;
      const ctx = canvas.getContext("2d")!;
      ctx.scale(2, 2);
      const xs = data.nodes.map((n) => n[0] as number),
        ys = data.nodes.map((n) => n[1] as number);
      const minX = Math.min(...xs),
        minY = Math.min(...ys);
      const zoom = Math.min(
        1360 / (Math.max(...xs) - minX || 1),
        960 / (Math.max(...ys) - minY || 1),
      );
      const px = (x: number) => 20 + (x - minX) * zoom,
        py = (y: number) => 20 + (y - minY) * zoom;
      ctx.strokeStyle = "#b8b9b060";
      ctx.lineWidth = 0.5;
      ctx.beginPath();
      for (const [x1, y1, x2, y2] of data.edges) {
        ctx.moveTo(px(x1), py(y1));
        ctx.lineTo(px(x2), py(y2));
      }
      ctx.stroke();
      for (const [x, y, count, color] of data.nodes) {
        const r = Math.max(
          0.75,
          Math.min(
            9,
            (2 + Math.log2(1 + ((count as number) || 1)) * 0.5) *
              Math.sqrt(zoom),
          ),
        );
        ctx.fillStyle = color as string;
        ctx.beginPath();
        ctx.arc(px(x as number), py(y as number), r, 0, Math.PI * 2);
        ctx.fill();
      }
    }, payload);
    await page.screenshot({ path });
    console.log(path);
  } finally {
    await browser.close();
  }
}
