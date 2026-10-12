import { expect, test } from "bun:test";
import { monthIndex } from "../../src/chronology";
import {
  bridges,
  career,
  concertsByMusician,
  discover,
  pickConcerts,
  scopeTest,
  sharedConcerts,
} from "../../src/scope";
import type { DatedConcert } from "../../src/types";

const crowd = Array.from({ length: 10 }, (_, i) => 10 + i);
const timeline: DatedConcert[] = [
  { date: "2020-01-05", venue: "A", musicians: [1, 2] },
  { date: "2020-02-05", venue: "B", musicians: [1, 3], jam: true },
  { date: "2021-03-05", venue: "C", musicians: [2, 3] },
  { date: "2021-04-05", venue: "A", musicians: [1, 2, 4] },
  { date: "2021-05-05", venue: "A", musicians: [1, ...crowd] },
];
const cityOf = new Map([
  ["A", "İstanbul"],
  ["B", "İstanbul"],
  ["C", "Ankara"],
]);
const all = { venue: "", city: "", jams: true, crowds: true };

test("scope filters city, venue, jam sessions and large lineups", () => {
  expect(scopeTest(all, cityOf)).toBeNull();
  const keep = (scope: Partial<typeof all>) =>
    timeline
      .map((concert, i) => [concert, i] as const)
      .filter(([concert]) => scopeTest({ ...all, ...scope }, cityOf)!(concert))
      .map(([, i]) => i);
  expect(keep({ city: "Ankara" })).toEqual([2]);
  expect(keep({ city: "İstanbul", jams: false })).toEqual([0, 3, 4]);
  expect(keep({ venue: "A", crowds: false })).toEqual([0, 3]);
});

test("concert lists are newest first and share only common concerts", () => {
  const index = concertsByMusician(timeline);
  expect(index.get(1)).toEqual([0, 1, 3, 4]);
  const range: [number, number] = [
    monthIndex("2020-01"),
    monthIndex("2021-04"),
  ];
  const first = pickConcerts(index.get(1)!, timeline, null, range);
  expect(first).toEqual([3, 1, 0]);
  const jamless = scopeTest({ ...all, jams: false }, cityOf);
  expect(pickConcerts(index.get(1)!, timeline, jamless, range)).toEqual([3, 0]);
  expect(sharedConcerts(index.get(1)!, index.get(2)!)).toEqual([0, 3]);
});

test("career spans years, including quiet ones, and ranks venues", () => {
  const summary = career([4, 3, 1, 0], timeline)!;
  expect(summary.first).toBe("2020-01-05");
  expect(summary.last).toBe("2021-05-05");
  expect(summary.years).toEqual([2, 2]);
  expect(summary.venues).toEqual([
    { id: "A", count: 3 },
    { id: "B", count: 1 },
  ]);
  expect(career([], timeline)).toBeNull();
});

test("starting points rank the past year and recent first concerts", () => {
  const { active, newcomers } = discover(timeline, 0, monthIndex("2022-03"));
  expect(active[0]).toEqual({ id: 1, count: 2 });
  // Musician 4 and the crowd first played within two years; 1 to 3 did not.
  expect(newcomers.map((n) => n.id)).toContain(4);
  expect(newcomers.map((n) => n.id)).not.toContain(3);
});

test("bridges join groups through repeated ties", () => {
  const nodes = [1, 2, 3, 4, 5, 6, 7].map((id) => ({ id }));
  const tie = (source: number, target: number, weight = 2) => ({
    source,
    target,
    weight,
  });
  const edges = [
    tie(1, 2),
    tie(2, 3),
    tie(1, 3),
    tie(3, 4),
    tie(4, 5),
    tie(5, 6),
    tie(6, 7),
    tie(5, 7),
    // A single shared bill is not a path.
    tie(1, 7, 1),
  ];
  const ranked = bridges(nodes, edges, 3);
  expect(ranked.map((r) => r.id)).toEqual([4, 3, 5]);
});
