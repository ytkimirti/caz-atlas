/** Restore the bundled source snapshot locally without accessing the network. */
import { mkdir, utimes } from "node:fs/promises";
import { createHash } from "node:crypto";
if (!Bun.argv.includes("--restore")) {
  console.log(
    "Usage: bun run scripts/restore.ts --restore\nRestores the bundled archive into the local cache. Existing cache files are preserved. No network or database access.",
  );
  process.exit(0);
}
const root = new URL("../", import.meta.url).pathname;
const manifest = await Bun.file(root + "data/manifest.json").json();
const bytes = new Uint8Array(
  await Bun.file(root + "data/source-networks.ndjson.gz").arrayBuffer(),
);
if (createHash("sha256").update(bytes).digest("hex") !== manifest.sha256)
  throw new Error("Archive checksum mismatch");
await mkdir(root + ".cache/networks", { recursive: true });
let restored = 0;
for (const line of Buffer.from(Bun.gunzipSync(bytes))
  .toString()
  .trim()
  .split("\n")) {
  const { key, response, downloadedAt } = JSON.parse(line);
  const file = Bun.file(
    root + ".cache/networks/" + encodeURIComponent(key) + ".json",
  );
  if (await file.exists()) continue;
  await Bun.write(file, JSON.stringify(response));
  await utimes(file.name!, new Date(downloadedAt), new Date(downloadedAt));
  restored++;
}
for (const [source, target] of [
  ["musician-keys.json", "keys.json"],
  ["directory.json", "directory.json"],
]) {
  const file = Bun.file(root + ".cache/" + target);
  if (!(await file.exists()))
    await Bun.write(file, await Bun.file(root + "data/" + source).text());
}
console.log(`Restored ${restored} source records; existing files preserved.`);
