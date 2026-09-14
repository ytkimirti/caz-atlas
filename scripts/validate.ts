import { createHash } from "node:crypto";
import { adjacency, edgeKey, mergeEdge } from "../src/graph";
import type { Atlas, Edge } from "../src/types";
const root = new URL("../", import.meta.url).pathname;
const data: Atlas = await Bun.file(root + "public/data/atlas.json").json();
const manifest = await Bun.file(root + "data/manifest.json").json();
const packed = new Uint8Array(
  await Bun.file(root + "data/source-networks.ndjson.gz").arrayBuffer(),
);
const digest = createHash("sha256").update(packed).digest("hex");
function assert(value: unknown, message: string): asserts value {
  if (!value) throw new Error(message);
}
assert(digest === manifest.sha256, "Raw archive checksum mismatch");
const rows = Buffer.from(Bun.gunzipSync(packed))
  .toString()
  .trim()
  .split("\n")
  .map((line) => JSON.parse(line));
const keys = new Set<string>(
  await Bun.file(root + "data/musician-keys.json").json(),
);
const nodesByKey = new Map(data.nodes.map((n) => [n.key, n]));
const ids = new Set(data.nodes.map((n) => n.id));
assert(
  rows.length === keys.size && rows.length === manifest.totalMusicians,
  "Raw archive coverage mismatch",
);
assert(
  nodesByKey.size === data.nodes.length && ids.size === data.nodes.length,
  "Duplicate musician profile or numeric ID",
);
assert(
  [...keys].every((key) => nodesByKey.has(key)),
  "An archived musician is missing from the graph",
);
assert(
  data.meta.complete && data.meta.pendingCount === 0,
  "Collection incomplete",
);
assert(
  data.nodes.every((n) => n.coverage !== "pending"),
  "A musician network was not requested",
);
const expectedEdges = new Map<string, Edge>();
let available = 0,
  unavailable = 0;
for (const { key, response } of rows) {
  assert(keys.has(key), "Unexpected source profile");
  if (response.unavailable) {
    unavailable++;
    assert(response.info?.name, `Missing fallback profile: ${key}`);
    continue;
  }
  available++;
  assert(
    response.metadata.cached_period === "all_time",
    `Wrong time window: ${key}`,
  );
  assert(response.metadata.min_weight === 0, `Filtered weights: ${key}`);
  assert(
    response.nodes.length < 20000,
    `Potentially truncated network: ${key}`,
  );
  for (const edge of response.links) {
    const a = response.nodes[edge.source],
      b = response.nodes[edge.target];
    assert(a && b, `Invalid source edge: ${key}`);
    const source = nodesByKey.get(a.compound_key),
      target = nodesByKey.get(b.compound_key);
    assert(source && target, `Missing collaboration endpoint: ${key}`);
    mergeEdge(expectedEdges, {
      source: source.id,
      target: target.id,
      weight: edge.weight,
    });
  }
}
assert(
  available === data.meta.fetchedCount &&
    unavailable === data.meta.unavailableCount,
  "Coverage statistics mismatch",
);
assert(
  expectedEdges.size === data.edges.length,
  "Missing or duplicate normalized edges",
);
for (const edge of data.edges) {
  assert(ids.has(edge.source) && ids.has(edge.target), "Dangling graph edge");
  assert(
    expectedEdges.get(edgeKey(edge.source, edge.target))?.weight ===
      edge.weight,
    "Graph edge does not match the raw source",
  );
}
const neighbors = adjacency(data);
for (const n of data.nodes) {
  assert(n.degree === neighbors.get(n.id)!.length, `Wrong degree: ${n.name}`);
  assert(
    [n.x, n.y, n.islandX, n.islandY, n.recordX, n.recordY].every(
      Number.isFinite,
    ),
    `Invalid layout position: ${n.name}`,
  );
}
console.log(
  `Verified: ${data.nodes.length} unique musicians, ${data.edges.length} unique source-backed edges, ${rows.length} archived responses, ${data.meta.mergedAliases} merged historical IDs, zero pending records.`,
);
