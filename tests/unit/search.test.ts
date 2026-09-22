import { expect, test } from "bun:test";
import { searchAtlas } from "../../src/search";
import type { Ensemble, GraphMusician } from "../../src/types";

const musician = (name: string, id = 1): GraphMusician => ({
  id,
  name,
  key: name.replaceAll(" ", ""),
  group: "Guitar",
  degree: 10,
  x: 0,
  y: 0,
});
const band = (name: string, concerts = 5): Ensemble => ({
  id: name,
  name,
  concerts,
  musicians: { 1: concerts, 2: concerts },
});

test("search handles Turkish spelling, whitespace and musician keys", () => {
  expect(
    searchAtlas(
      [musician("Önder Focan")],
      [band("Önder Focan Trio")],
      "  onder focan  ",
      "all",
    ).map((r) => r.kind),
  ).toEqual(["musician", "ensemble"]);
  expect(
    searchAtlas([musician("Can Tutuğ")], [], "cantutug", "all"),
  ).toHaveLength(1);
});
test("an exact group name outranks partial musician matches", () => {
  const results = searchAtlas(
    [musician("Trio Guest")],
    [band("Trio")],
    "trio",
    "all",
  );
  expect(results[0].kind).toBe("ensemble");
});
test("groups remain discoverable among many matching musicians", () => {
  const nodes = Array.from({ length: 20 }, (_, i) => musician(`Jazz ${i}`, i));
  const results = searchAtlas(nodes, [band("Jazz Trio")], "jazz", "all");
  expect(results.some((r) => r.kind === "ensemble")).toBe(true);
  expect(
    searchAtlas(nodes, [band("Jazz Trio")], "jazz", "musician").every(
      (r) => r.kind === "musician",
    ),
  ).toBe(true);
  expect(
    searchAtlas(nodes, [band("Jazz Trio")], "jazz", "ensemble"),
  ).toHaveLength(1);
});
test("empty queries rank groups by concert count without mutating input", () => {
  const ensembles = [band("Occasional", 2), band("Regular", 20)];
  expect(searchAtlas([], ensembles, "", "ensemble").map((r) => r.name)).toEqual(
    ["Regular", "Occasional"],
  );
  expect(ensembles[0].name).toBe("Occasional");
  expect(searchAtlas([], ensembles, "missing", "all")).toEqual([]);
});

test("mixed search fills spare slots while keeping both result kinds", () => {
  const nodes = Array.from({ length: 12 }, (_, i) => musician(`Jazz ${i}`, i));
  const ensembles = Array.from({ length: 12 }, (_, i) =>
    band(`Jazz Band ${i}`),
  );
  for (const [people, bands, musicianCount] of [
    [nodes, ensembles.slice(0, 1), 7],
    [nodes.slice(0, 1), ensembles, 1],
    [nodes, ensembles, 4],
  ] as const) {
    const results = searchAtlas(people, bands, "jazz", "all");
    expect(results).toHaveLength(8);
    expect(results.filter((result) => result.kind === "musician")).toHaveLength(
      musicianCount,
    );
    expect(new Set(results.map((result) => result.id)).size).toBe(8);
  }
});

test("ranking keeps exact and prefix matches ahead of popular partial matches", () => {
  const ensembles = [
    band("The Jazz Orchestra", 100),
    band("Jazz Quartet", 20),
    band("Jazz Trio", 20),
    band("Jazz", 1),
    band("Jazz Duo", 5),
  ];
  expect(
    searchAtlas([], ensembles, "jazz", "ensemble").map((result) => result.name),
  ).toEqual([
    "Jazz",
    "Jazz Quartet",
    "Jazz Trio",
    "Jazz Duo",
    "The Jazz Orchestra",
  ]);
  const nodes = Array.from({ length: 20 }, (_, id) =>
    musician(`Jazz Guest ${id}`, id),
  );
  nodes.push(musician("Jazz", 21));
  expect(
    searchAtlas(nodes, [], "jazz", "musician").map((result) => result.id),
  ).toEqual([
    "musician-21",
    "musician-0",
    "musician-1",
    "musician-2",
    "musician-3",
    "musician-4",
    "musician-5",
    "musician-6",
  ]);
});

test("cached labels refresh when names, aliases or concert counts change", () => {
  const node = musician("Önder Focan");
  const ensembles = [band("Old Quartet", 10), band("New Trio", 5)];
  expect(searchAtlas([node], ensembles, "onder", "all")[0].name).toBe(
    "Önder Focan",
  );
  expect(searchAtlas([], ensembles, "", "ensemble")[0].name).toBe(
    "Old Quartet",
  );
  node.name = "Can Tutuğ";
  node.key = "cantutug";
  ensembles[0].name = "New Quartet";
  ensembles[1].concerts = 20;
  expect(searchAtlas([node], ensembles, "onder", "all")).toEqual([]);
  expect(searchAtlas([node], ensembles, "old", "all")).toEqual([]);
  expect(searchAtlas([node], ensembles, "cantutug", "all")[0].name).toBe(
    "Can Tutuğ",
  );
  expect(
    searchAtlas([], ensembles, "new", "ensemble").map((result) => result.name),
  ).toEqual(["New Trio", "New Quartet"]);
  node.key = "newalias";
  expect(searchAtlas([node], [], "cantutug", "all")).toEqual([]);
  expect(searchAtlas([node], [], "newalias", "all")[0].name).toBe("Can Tutuğ");
});

test("repeated searches respect changing subsets and return independent arrays", () => {
  const first = musician("Jazz Guitar", 1);
  const second = musician("Jazz Drums", 2);
  const initial = searchAtlas([first, second], [], "jazz", "musician");
  initial.reverse();
  expect(
    searchAtlas([first, second], [], "jazz", "musician").map(
      (result) => result.id,
    ),
  ).toEqual(["musician-1", "musician-2"]);
  expect(
    searchAtlas([second], [], "jazz", "musician").map((result) => result.id),
  ).toEqual(["musician-2"]);
  expect(searchAtlas([musician("Piano", 1)], [], "jazz", "musician")).toEqual(
    [],
  );
});
