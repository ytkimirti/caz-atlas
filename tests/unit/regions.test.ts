import { expect, test } from "bun:test";
import { findRegions, shortName, wrapName } from "../../src/regions";
import type { Edge, Ensemble } from "../../src/types";

const ensemble = (id: string, members: number[], concerts = 10): Ensemble => ({
  id,
  name: id,
  concerts,
  musicians: Object.fromEntries(members.map((id) => [id, concerts])),
});
const clique = (members: number[], weight = 1): Edge[] =>
  members.flatMap((a, i) =>
    members.slice(i + 1).map((b) => ({ source: a, target: b, weight })),
  );
// A ring of `count` markers around (x, y), plus a sparse background grid.
const ring = (first: number, count: number, x: number, y: number, r: number) =>
  Array.from({ length: count }, (_, i) => ({
    id: first + i,
    x: x + r * Math.cos((i / count) * Math.PI * 2),
    y: y + r * Math.sin((i / count) * Math.PI * 2),
  }));
const background = Array.from({ length: 100 }, (_, i) => ({
  id: 1000 + i,
  x: (i % 10) * 100,
  y: Math.floor(i / 10) * 100,
}));

test("names a tight band whatever its size", () => {
  const band = ring(1, 40, 450, 450, 30);
  const trio = ring(100, 3, 150, 750, 8);
  const ids = (points: { id: number }[]) => points.map((p) => p.id);
  const regions = findRegions(
    [...background, ...band, ...trio],
    [ensemble("big band", ids(band), 1), ensemble("trio", ids(trio))],
    [...clique(ids(band)), ...clique(ids(trio))],
  );
  expect(regions.map((r) => r.name)).toEqual(["big band", "trio"]);
  expect(regions[0].members).toHaveLength(40);
});

test("a scattered roster or one lost among other markers is not a shape", () => {
  const scattered = [1, 2, 3].map((id) => ({ id, x: id * 300, y: 500 }));
  const crowded = ring(10, 3, 450, 450, 8);
  const crowd = ring(20, 30, 450, 450, 6);
  expect(
    findRegions(
      [...background, ...scattered, ...crowded, ...crowd],
      [ensemble("scattered", [1, 2, 3]), ensemble("crowded", [10, 11, 12])],
      [...clique([1, 2, 3]), ...clique([10, 11, 12])],
    ),
  ).toEqual([]);
});

test("sidemen who mostly play elsewhere do not name a spot", () => {
  const trio = ring(1, 3, 450, 450, 8);
  const edges = [
    ...clique([1, 2, 3]),
    ...[1, 2, 3].map((id) => ({ source: id, target: 1000, weight: 20 })),
  ];
  expect(
    findRegions(
      [...background, ...trio],
      [ensemble("sidemen", [1, 2, 3])],
      edges,
    ),
  ).toEqual([]);
});

test("keeps a guest far from the band out of its shape", () => {
  const band = ring(1, 5, 450, 450, 10);
  const guest = { id: 6, x: 950, y: 50 };
  const [region] = findRegions(
    [...background, ...band, guest],
    [ensemble("band", [1, 2, 3, 4, 5, 6])],
    clique([1, 2, 3, 4, 5, 6]),
  );
  expect(region.members.sort()).toEqual([1, 2, 3, 4, 5]);
});

test("one name per shape when editions share their roster", () => {
  const band = ring(1, 5, 450, 450, 10);
  const regions = findRegions(
    [...background, ...band],
    [
      ensemble("Quartet", [1, 2, 3, 4], 5),
      ensemble("Quintet", [1, 2, 3, 4, 5], 50),
    ],
    clique([1, 2, 3, 4, 5]),
  );
  expect(regions.map((r) => r.name)).toEqual(["Quintet"]);
});

test("map names drop programme subtitles and wrap to two lines", () => {
  expect(shortName("Hezarfen Ensemble - Yok Mu, Var")).toBe(
    "Hezarfen Ensemble",
  );
  expect(shortName("KU Orkestra (Şef: Duru Atmış)")).toBe("KU Orkestra");
  expect(shortName("(Şef)")).toBe("(Şef)");
  const measure = (text: string) => text.length;
  expect(wrapName("a bb ccc dddd", 6, measure)).toEqual(["a bb", "ccc…"]);
  expect(wrapName("BİFOCaz", 20, measure)).toEqual(["BİFOCaz"]);
  expect(
    wrapName("Supercalifragilistic", 8, measure)[0].length,
  ).toBeLessThanOrEqual(8);
});
