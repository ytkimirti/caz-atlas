import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { searchAtlas } from "../src/search";
import type { Atlas, ConcertIndex } from "../src/types";

const args = Bun.argv.slice(2);
if (args.length !== 2 || args[0] !== "--baseline") {
  console.log("Usage: bun scripts/search-benchmark.ts --baseline <git-commit>");
  process.exit(args.length ? 1 : 0);
}

const root = fileURLToPath(new URL("..", import.meta.url));
const temporary = await mkdtemp(join(tmpdir(), "cazgraf-search-benchmark-"));
try {
  // Load the actual earlier implementation without maintaining a copied fixture.
  for (const name of ["search", "types"]) {
    const command = Bun.spawn(["git", "show", `${args[1]}:src/${name}.ts`], {
      cwd: root,
      stdout: "pipe",
      stderr: "pipe",
    });
    const [source, error, status] = await Promise.all([
      new Response(command.stdout).text(),
      new Response(command.stderr).text(),
      command.exited,
    ]);
    if (status !== 0) throw new Error(error);
    await Bun.write(join(temporary, `${name}.ts`), source);
  }
  const before: typeof searchAtlas = (
    await import(pathToFileURL(join(temporary, "search.ts")).href)
  ).searchAtlas;
  const atlas: Atlas = await Bun.file(
    join(root, "public/data/atlas.json"),
  ).json();
  const concerts: ConcertIndex = await Bun.file(
    join(root, "public/data/concerts.json"),
  ).json();
  const queries = [
    "",
    "a",
    "al",
    "ali",
    "ö",
    "ön",
    "önder",
    "trio",
    "jazz",
    "zzzz",
  ];
  for (const kind of ["all", "musician", "ensemble"] as const) {
    for (const query of queries) {
      const ids = (search: typeof searchAtlas) =>
        search(atlas.nodes, concerts.ensembles, query, kind).map((r) => r.id);
      if (JSON.stringify(ids(before)) !== JSON.stringify(ids(searchAtlas)))
        throw new Error(
          `Result order changed for ${kind}: ${JSON.stringify(query)}`,
        );
    }
  }
  const run = (search: typeof searchAtlas) => {
    const start = performance.now();
    for (let i = 0; i < 10; i++)
      for (const query of queries)
        search(atlas.nodes, concerts.ensembles, query, "all");
    return performance.now() - start;
  };
  run(before);
  run(searchAtlas);
  const baseline: number[] = [],
    current: number[] = [];
  for (let i = 0; i < 5; i++) {
    baseline.push(run(before));
    current.push(run(searchAtlas));
  }
  const median = (times: number[]) => [...times].sort((a, b) => a - b)[2];
  console.log(
    JSON.stringify(
      {
        baseline: args[1],
        musicians: atlas.nodes.length,
        ensembles: concerts.ensembles.length,
        searchesPerSample: 100,
        samples: 5,
        warmCache: true,
        baselineMs: median(baseline),
        currentMs: median(current),
        speedup: median(baseline) / median(current),
      },
      null,
      2,
    ),
  );
} finally {
  await rm(temporary, { recursive: true, force: true });
}
