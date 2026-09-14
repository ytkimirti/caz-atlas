/** Builds a local, reproducible artifact from the cached public responses. */
import { readdir, rename } from "node:fs/promises";
import {
  forceSimulation,
  forceLink,
  forceManyBody,
  forceX,
  forceY,
  forceCollide,
} from "d3-force";
import { mergeEdge, adjacency } from "../src/graph";
import { groups } from "../src/types";
import type { Atlas, Musician, Edge } from "../src/types";
const cache = new URL("../.cache/", import.meta.url).pathname;
const keys: string[] = await Bun.file(cache + "keys.json").json();
const directory = await Bun.file(cache + "directory.json").json();
const nodes = new Map<number, Musician>(),
  edges = new Map<string, Edge>();
const covered = new Set<string>(),
  unavailable = new Set<string>();
const profiles = new Map<string, Musician>();
const sourceIds = new Map<string, Set<number>>();
const authoritative = new Set<string>();
const sourceEdges = new Map<
  string,
  { source: string; target: string; weight: number }
>();
type RawNode = {
  id: number;
  name: string;
  compound_key: string;
  instrument_group?: string;
  city?: string;
  status?: string;
};
function add(n: RawNode, ownProfile = false) {
  const ids = sourceIds.get(n.compound_key) || new Set<number>();
  ids.add(n.id);
  sourceIds.set(n.compound_key, ids);
  const existing = profiles.get(n.compound_key);
  if (authoritative.has(n.compound_key) && !ownProfile) return;
  profiles.set(n.compound_key, {
    id: 0,
    key: n.compound_key,
    name: n.name,
    group: n.instrument_group || existing?.group || "Others",
    city: n.city || existing?.city || "",
    status: n.status || existing?.status || "",
    degree: 0,
    x: 0,
    y: 0,
    islandX: 0,
    islandY: 0,
    recordX: 0,
    recordY: 0,
    coverage: "pending",
  });
  if (ownProfile) authoritative.add(n.compound_key);
}
for (const file of (await readdir(cache + "networks"))
  .filter((f) => f.endsWith(".json"))
  .sort()) {
  const data = await Bun.file(cache + "networks/" + file).json();
  const key = decodeURIComponent(file.slice(0, -5));
  if (data.unavailable) {
    unavailable.add(key);
    if (data.info) add(data.info, true);
    continue;
  }
  covered.add(key);
  for (const node of data.nodes) add(node, node.compound_key === key);
  for (const link of data.links) {
    const a = data.nodes[link.source],
      b = data.nodes[link.target];
    if (!a || !b || !Number.isFinite(link.weight))
      throw new Error(`Invalid edge in ${file}`);
    // Profile keys, not cached numeric IDs, identify the collaboration endpoints.
    const pair = [a.compound_key, b.compound_key].sort();
    if (pair[0] === pair[1]) continue;
    const edgeKey = JSON.stringify(pair),
      previous = sourceEdges.get(edgeKey);
    if (!previous || previous.weight < link.weight)
      sourceEdges.set(edgeKey, {
        source: pair[0],
        target: pair[1],
        weight: link.weight,
      });
  }
}
// Source caches reuse some numeric IDs for different people, and assign multiple
// IDs to others. Stable internal IDs are derived from unique public profile keys.
let internalId = 1;
for (const key of [...profiles.keys()].sort()) {
  const node = profiles.get(key)!;
  node.id = internalId++;
  nodes.set(node.id, node);
}
for (const edge of sourceEdges.values())
  mergeEdge(edges, {
    source: profiles.get(edge.source)!.id,
    target: profiles.get(edge.target)!.id,
    weight: edge.weight,
  });
const mergedAliases = [...sourceIds.values()].reduce(
  (total, ids) => total + ids.size - 1,
  0,
);
const byKey = profiles;
const names = new Map<string, string>(
  directory.musicians.map((m: any) => [m.compound_key, m.name]),
);
let temporaryId = -1;
for (const key of keys)
  if (!byKey.has(key)) {
    const node = {
      id: temporaryId--,
      key,
      name: names.get(key) || key,
      group: "Others",
      city: "",
      status: "",
      degree: 0,
      x: 0,
      y: 0,
      islandX: 0,
      islandY: 0,
      recordX: 0,
      recordY: 0,
      coverage: "pending" as const,
    };
    nodes.set(node.id, node);
  }
for (const node of nodes.values())
  node.coverage = covered.has(node.key)
    ? "available"
    : unavailable.has(node.key)
      ? "unavailable"
      : "pending";
const nodeList = [...nodes.values()].sort((a, b) => a.id - b.id),
  edgeList = [...edges.values()];
const neighbors = adjacency({ nodes: nodeList, edges: edgeList });
for (const node of nodeList) node.degree = neighbors.get(node.id)!.length;
let componentCount = 0;
const visited = new Set<number>();
for (const node of nodeList)
  if (!visited.has(node.id)) {
    componentCount++;
    const queue = [node.id];
    visited.add(node.id);
    for (let i = 0; i < queue.length; i++)
      for (const neighbor of neighbors.get(queue[i]) || [])
        if (!visited.has(neighbor.id)) {
          visited.add(neighbor.id);
          queue.push(neighbor.id);
        }
  }
const connected = nodeList.filter((n) => n.degree > 0);
console.log(
  `Layout: ${nodeList.length} musicians, ${edgeList.length} edges, ${connected.length} connected.`,
);
// Deterministic phyllotaxis initialization and a genuine force-directed topology.
const simNodes = connected.map((n, i) => ({
  id: n.id,
  degree: n.degree,
  x: Math.cos(i * 2.399963) * Math.sqrt(i) * 9,
  y: Math.sin(i * 2.399963) * Math.sqrt(i) * 9,
}));
const simulation = forceSimulation(simNodes)
  .force(
    "link",
    forceLink(edgeList.map((e) => ({ ...e })))
      .id((n: any) => n.id)
      .distance(22)
      .strength((e: any) =>
        Math.min(
          0.12,
          0.7 / Math.sqrt(Math.max(e.source.degree, e.target.degree)),
        ),
      ),
  )
  .force("charge", forceManyBody().strength(-13).distanceMax(450))
  .force("x", forceX(0).strength(0.012))
  .force("y", forceY(0).strength(0.012))
  .force("collision", forceCollide(3.8))
  .stop();
for (let tick = 0; tick < 350; tick++) simulation.tick();
const maxRadius = Math.max(1, ...simNodes.map((n) => Math.hypot(n.x, n.y)));
for (const n of simNodes) {
  const target = nodes.get(n.id)!;
  target.x = (n.x / maxRadius) * 980;
  target.y = (n.y / maxRadius) * 980;
}
const isolated = nodeList.filter((n) => !n.degree);
for (let i = 0; i < isolated.length; i++) {
  const a = i * 2.399963,
    r = Math.sqrt(
      1030 ** 2 + (i / Math.max(1, isolated.length)) * (1230 ** 2 - 1030 ** 2),
    );
  isolated[i].x = Math.cos(a) * r;
  isolated[i].y = Math.sin(a) * r;
}
for (let g = 0; g < groups.length; g++) {
  const members = nodeList
    .filter((n) => n.group === groups[g].id)
    .sort((a, b) => b.degree - a.degree);
  const theta = (g / groups.length) * Math.PI * 2 - Math.PI / 2;
  const cx = Math.cos(theta) * 780,
    cy = Math.sin(theta) * 780;
  for (let i = 0; i < members.length; i++) {
    const a = i * 2.399963,
      r = Math.sqrt(i / Math.max(1, members.length)) * 245;
    members[i].islandX = cx + Math.cos(a) * r;
    members[i].islandY = cy + Math.sin(a) * r;
  }
}
const ranked = [...nodeList].sort((a, b) => b.degree - a.degree);
for (let i = 0; i < ranked.length; i++) {
  const a = i * 2.399963,
    r = 160 + Math.sqrt(i / ranked.length) * 990;
  ranked[i].recordX = Math.cos(a) * r;
  ranked[i].recordY = Math.sin(a) * r;
}
for (const n of nodeList)
  for (const key of [
    "x",
    "y",
    "islandX",
    "islandY",
    "recordX",
    "recordY",
  ] as const)
    n[key] = Math.round(n[key] * 100) / 100;
const pendingCount = keys.filter(
  (k) => !covered.has(k) && !unavailable.has(k),
).length;
const result: Atlas = {
  nodes: nodeList,
  edges: edgeList,
  meta: {
    source: "https://bizimcaz.com",
    fetchedAt: new Date().toISOString(),
    directoryCount: directory.musicians.length,
    archiveCount: keys.length,
    fetchedCount: covered.size,
    unavailableCount: unavailable.size,
    pendingCount,
    components: componentCount,
    isolatedCount: isolated.length,
    period: "all_time",
    mergedAliases,
    complete: pendingCount === 0,
  },
};
const output = new URL("../public/data/atlas.json", import.meta.url).pathname;
await Bun.write(output + ".tmp", JSON.stringify(result));
await rename(output + ".tmp", output);
console.log(JSON.stringify(result.meta, null, 2));
