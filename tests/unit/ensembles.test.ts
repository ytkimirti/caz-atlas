import { expect, test } from "bun:test";
import { clusterBounds, ensembleClusters } from "../../src/ensembles";
import type { Edge, Ensemble } from "../../src/types";

const trio = [1, 2, 3];
const triangle: Edge[] = [
  { source: 1, target: 2, weight: 10 },
  { source: 2, target: 3, weight: 10 },
  { source: 1, target: 3, weight: 10 },
];
const ensemble = (id: string, members = trio, concerts = 10): Ensemble => ({
  id,
  name: id,
  concerts,
  musicians: Object.fromEntries(members.map((id) => [id, concerts])),
});

test("ranks tight small groups by concert count", () => {
  const results = ensembleClusters(
    [ensemble("occasional", trio, 2), ensemble("regular", trio, 20)],
    triangle,
    new Set(trio),
  );
  expect(results.map((item) => item.ensemble.id)).toEqual([
    "regular",
    "occasional",
  ]);
});

test("rejects sprawling projects, pairs and rosters hidden by filters", () => {
  const results = ensembleClusters(
    [
      ensemble("large", [1, 2, 3, 4, 5, 6, 7]),
      ensemble("pair", [1, 2]),
      ensemble("partly filtered", [1, 2, 3, 4]),
    ],
    triangle,
    new Set(trio),
  );
  expect(results).toEqual([]);
});

test("a star or a musician's wider collaboration network is not a group hint", () => {
  expect(
    ensembleClusters([ensemble("star")], triangle.slice(0, 2), new Set(trio)),
  ).toEqual([]);
  expect(
    ensembleClusters(
      [ensemble("hub")],
      [...triangle, { source: 1, target: 99, weight: 30 }],
      new Set(trio),
    ),
  ).toEqual([]);
});

test("allows occasional collaborations outside an otherwise tight group", () => {
  expect(
    ensembleClusters(
      [ensemble("trio")],
      [...triangle, { source: 1, target: 99, weight: 1 }],
      new Set(trio),
    ),
  ).toHaveLength(1);
});

test("requires a compact, fully visible cluster at the current zoom", () => {
  const points = [
    { x: 100, y: 140 },
    { x: 160, y: 140 },
    { x: 130, y: 200 },
  ];
  expect(clusterBounds([0, 1, 2], (id) => points[id], 500, 500)).toEqual({
    left: 100,
    right: 160,
    top: 140,
    bottom: 200,
  });
  expect(
    clusterBounds(
      [0, 1, 2],
      (id) => ({ ...points[id], x: points[id].x - 120 }),
      500,
      500,
    ),
  ).toBeNull();
  expect(
    clusterBounds(
      [0, 1, 2],
      (id) => ({ ...points[id], x: points[id].x * 3 }),
      1000,
      500,
    ),
  ).toBeNull();
  expect(
    clusterBounds([0, 1, 2], () => ({ x: 100, y: 140 }), 500, 500),
  ).toBeNull();
});
