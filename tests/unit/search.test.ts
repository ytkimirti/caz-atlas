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
