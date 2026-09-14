/** Packages already-downloaded source responses. Local files only, no network. */
import { mkdir, rename, stat } from "node:fs/promises";
import { createHash } from "node:crypto";
if (!Bun.argv.includes("--archive")) {
  console.log(
    "Usage: bun run scripts/archive.ts --archive\nReplaces the bundled network archive from the local cache. No network or database access.",
  );
  process.exit(0);
}
const root = new URL("../", import.meta.url).pathname;
const keys: string[] = await Bun.file(root + ".cache/keys.json").json();
if (!keys.length) throw new Error("Cannot archive an empty collection");
const directory = await Bun.file(root + ".cache/directory.json").text();
JSON.parse(directory);
const rows: string[] = [],
  timestamps: number[] = [];
let available = 0,
  unavailable = 0;
for (const key of keys) {
  const file = root + ".cache/networks/" + encodeURIComponent(key) + ".json";
  if (!(await Bun.file(file).exists()))
    throw new Error(`Cannot archive incomplete collection: ${key}`);
  const response = await Bun.file(file).json();
  const downloadedAt = (await stat(file)).mtime.toISOString();
  timestamps.push(Date.parse(downloadedAt));
  if (response.unavailable) unavailable++;
  else available++;
  rows.push(
    JSON.stringify({
      key,
      downloadedAt,
      source: `https://bizimcaz.com/api/musician-network-cached/${encodeURIComponent(key)}?years_back=150&min_weight=0&max_musicians=20000`,
      response,
    }),
  );
}
const packed = Bun.gzipSync(rows.join("\n") + "\n");
await mkdir(root + "data", { recursive: true });
await Bun.write(root + "data/source-networks.ndjson.gz.tmp", packed);
await rename(
  root + "data/source-networks.ndjson.gz.tmp",
  root + "data/source-networks.ndjson.gz",
);
const manifest = {
  source: "https://bizimcaz.com",
  format: "gzip-compressed newline-delimited JSON",
  file: "source-networks.ndjson.gz",
  sha256: createHash("sha256").update(packed).digest("hex"),
  totalMusicians: keys.length,
  availableNetworks: available,
  unavailableNetworksWithProfile: unavailable,
  failedRequests: 0,
  downloadStartedAt: new Date(Math.min(...timestamps)).toISOString(),
  downloadFinishedAt: new Date(Math.max(...timestamps)).toISOString(),
  networkParameters: { years_back: 150, min_weight: 0, max_musicians: 20000 },
  cachedPeriod: "all_time",
  notes:
    "Every sitemap musician was requested. HTTP 404 network responses are represented by unavailable=true plus the public musician-info profile. Absence of a cached relationship is not proof that a collaboration never occurred. Edge weights are source-defined scores, not concert counts.",
};
await Bun.write(
  root + "data/manifest.json",
  JSON.stringify(manifest, null, 2) + "\n",
);
await Bun.write(root + "data/musician-keys.json", JSON.stringify(keys));
await Bun.write(root + "data/directory.json", directory);
console.log(JSON.stringify(manifest, null, 2));
