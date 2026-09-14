/** Derive browser assets from local snapshots. No network or database access. */
import { rename } from "node:fs/promises";
import { packRuntime, projectData } from "../src/runtime-data";
import type { Atlas, ConcertIndex } from "../src/types";

if (!Bun.argv.includes("--build")) {
  console.log(
    "Usage: bun run scripts/prepare-runtime.ts --build\nBuilds local browser assets from the preserved archive snapshots.",
  );
  process.exit(0);
}
const directory = new URL("../public/data/", import.meta.url);
const atlas: Atlas = await Bun.file(new URL("atlas.json", directory)).json();
const concerts: ConcertIndex = await Bun.file(
  new URL("concerts.json", directory),
).json();
for (const [name, data] of [
  ["runtime.json", packRuntime(atlas, concerts)],
  ["projects.json", projectData(concerts)],
] as const) {
  const output = new URL(name, directory).pathname;
  const json = JSON.stringify(data);
  await Bun.write(output + ".tmp", json);
  await rename(output + ".tmp", output);
  console.log(
    `${name}: ${new TextEncoder().encode(json).length.toLocaleString()} bytes`,
  );
}
