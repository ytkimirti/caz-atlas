/** Build a local artifact only. No network or database access. */
import { rename } from "node:fs/promises";
import { indexConcerts } from "../src/concerts";
import type { Concert } from "../src/concerts";
import type { Atlas, ConcertIndex } from "../src/types";

if (!Bun.argv.includes("--build")) {
  console.log(
    "Usage: bun run scripts/prepare-concerts.ts --build\nBuilds public/data/concerts.json from the local concert snapshot. No database access.",
  );
  process.exit(0);
}
const atlas: Atlas = await Bun.file(
  new URL("../public/data/atlas.json", import.meta.url),
).json();
const source: {
  source: string;
  fetchedAt: string;
  complete: boolean;
  concerts: Concert[];
} = JSON.parse(
  new TextDecoder().decode(
    Bun.gunzipSync(
      new Uint8Array(
        await Bun.file(
          new URL("../data/concerts.json.gz", import.meta.url),
        ).arrayBuffer(),
      ),
    ),
  ),
);
if (!source.complete) throw new Error("Concert snapshot is incomplete");
const through = source.fetchedAt.slice(0, 10);
const { stats, ...index } = indexConcerts(
  atlas.nodes,
  source.concerts,
  through,
);
const result: ConcertIndex = {
  ...index,
  meta: {
    source: source.source,
    fetchedAt: source.fetchedAt,
    through,
    ...stats,
  },
};
const output = new URL("../public/data/concerts.json", import.meta.url)
  .pathname;
await Bun.write(output + ".tmp", JSON.stringify(result));
await rename(output + ".tmp", output);
console.log(
  JSON.stringify(
    {
      ...result.meta,
      venues: result.venues.length,
      edges: result.edges.length,
    },
    null,
    2,
  ),
);
