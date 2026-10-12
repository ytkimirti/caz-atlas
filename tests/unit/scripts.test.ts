import { afterEach, beforeEach, expect, test } from "bun:test";
import { copyFile, mkdir, mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";

let root: string;
const project = new URL("../../", import.meta.url).pathname;

beforeEach(async () => {
  await mkdir(join(project, ".cache"), { recursive: true });
  root = await mkdtemp(join(project, ".cache/script-test-"));
  for (const dir of [
    "scripts",
    "src",
    ".cache/networks",
    "public/data",
    "data",
  ])
    await mkdir(join(root, dir), { recursive: true });
  for (const file of [
    "scripts/prepare.ts",
    "scripts/archive.ts",
    "scripts/prepare-runtime.ts",
    "src/runtime-data.ts",
    "src/chronology.ts",
    "src/graph.ts",
    "src/types.ts",
    "src/layout.ts",
    "src/layout-cache.ts",
    "src/layout-links.ts",
    "src/layout-options.ts",
    "src/community-layout.ts",
    "src/local-force.ts",
  ])
    await copyFile(join(project, file), join(root, file));
  await Bun.write(join(root, ".cache/keys.json"), JSON.stringify(["Alice"]));
  await Bun.write(
    join(root, ".cache/directory.json"),
    JSON.stringify({
      musicians: [{ compound_key: "Alice", name: "Alice" }],
    }),
  );
  await Bun.write(
    join(root, ".cache/networks/Alice.json"),
    JSON.stringify({
      nodes: [{ id: 1, name: "Alice", compound_key: "Alice" }],
      links: [],
    }),
  );
  await Bun.write(join(root, "public/data/atlas.json"), "original atlas");
  await Bun.write(join(root, "public/data/runtime.json"), "original runtime");
  await Bun.write(join(root, "public/data/projects.json"), "original projects");
  await Bun.write(
    join(root, "data/source-networks.ndjson.gz"),
    "original archive",
  );
});

afterEach(async () => {
  if (root) await rm(root, { recursive: true, force: true });
});

async function run(script: string, ...args: string[]) {
  const child = Bun.spawn(
    [process.execPath, join(root, "scripts", script), ...args],
    {
      cwd: root,
      stdout: "pipe",
      stderr: "pipe",
    },
  );
  const [code, stdout, stderr] = await Promise.all([
    child.exited,
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
  ]);
  return { code, stdout, stderr };
}

test("snapshot writers require explicit flags even with a usable cache", async () => {
  for (const [script, flag] of [
    ["prepare.ts", "--build"],
    ["archive.ts", "--archive"],
    ["prepare-runtime.ts", "--build"],
  ]) {
    const result = await run(script);
    expect(result.code).toBe(0);
    expect(result.stdout).toContain(`Usage: bun run scripts/${script} ${flag}`);
  }
  expect(await Bun.file(join(root, "public/data/atlas.json")).text()).toBe(
    "original atlas",
  );
  expect(await Bun.file(join(root, "public/data/runtime.json")).text()).toBe(
    "original runtime",
  );
  expect(await Bun.file(join(root, "public/data/projects.json")).text()).toBe(
    "original projects",
  );
  expect(
    await Bun.file(join(root, "data/source-networks.ndjson.gz")).text(),
  ).toBe("original archive");
});

test("incomplete and empty caches preserve the existing atlas", async () => {
  for (const keys of [["Alice", "Missing"], []]) {
    await Bun.write(join(root, ".cache/keys.json"), JSON.stringify(keys));
    const result = await run("prepare.ts", "--build");
    expect(result.code).not.toBe(0);
    expect(result.stderr).toContain("Cannot build");
    expect(await Bun.file(join(root, "public/data/atlas.json")).text()).toBe(
      "original atlas",
    );
  }
});

test("an explicit rebuild includes only networks listed in the collection", async () => {
  await Bun.write(
    join(root, ".cache/networks/Stale.json"),
    "invalid stale cache",
  );
  const result = await run("prepare.ts", "--build");
  expect(result.code).toBe(0);
  const atlas = await Bun.file(join(root, "public/data/atlas.json")).json();
  expect(atlas.nodes.map((node: { key: string }) => node.key)).toEqual([
    "Alice",
  ]);
  expect(atlas.meta.complete).toBe(true);
  expect(atlas.meta.pendingCount).toBe(0);
});

test("missing archive metadata preserves the existing snapshot", async () => {
  await rm(join(root, ".cache/directory.json"));
  const result = await run("archive.ts", "--archive");
  expect(result.code).not.toBe(0);
  expect(
    await Bun.file(join(root, "data/source-networks.ndjson.gz")).text(),
  ).toBe("original archive");
});

test("explicit archiving produces a readable snapshot", async () => {
  const result = await run("archive.ts", "--archive");
  expect(result.code).toBe(0);
  const bytes = await Bun.file(
    join(root, "data/source-networks.ndjson.gz"),
  ).bytes();
  const row = JSON.parse(new TextDecoder().decode(Bun.gunzipSync(bytes)));
  expect(row.key).toBe("Alice");
  const manifest = await Bun.file(join(root, "data/manifest.json")).json();
  expect(manifest.totalMusicians).toBe(1);
});
