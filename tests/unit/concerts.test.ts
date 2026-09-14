import { expect, test } from "bun:test";
import { indexConcerts } from "../../src/concerts";
import type { Concert } from "../../src/concerts";
import type { Musician } from "../../src/types";

const nodes = [
  "İlhan Şen",
  "Asude Şaşmaz",
  "Önder Focan",
  "Same Name",
  "Same Name",
].map((name, i) => ({ id: i + 1, name })) as Musician[];
const make = (
  key: string,
  musicians: string[],
  venue = "Nardis",
  date = "2026-09-01",
): Concert => ({
  key,
  musicians,
  venue,
  date,
  venueName: venue,
  city: "İstanbul",
});

test("counts distinct completed concerts, not pair weights or duplicate credits", () => {
  const show = make("a", [
    "ilhan sen",
    "İlhan Şen",
    "Asude Şaşmaz",
    "Önder Focan",
  ]);
  const index = indexConcerts(
    nodes,
    [
      show,
      show,
      make("b", ["İlhan Şen"]),
      make("future", ["İlhan Şen"], "Nardis", "2026-10-01"),
      make("today", ["İlhan Şen"], "Nardis", "2026-09-14"),
    ],
    "2026-09-14",
  );
  expect(index.counts).toEqual({ 1: 2, 2: 1, 3: 1 });
  expect(index.stats.concerts).toBe(2);
  expect(index.edges).toHaveLength(3);
  expect(index.edges.every((e) => e.weight === 1)).toBe(true);
});

test("venue links require the same concert, not just the same venue", () => {
  const index = indexConcerts(
    nodes,
    [
      make("a", ["İlhan Şen", "Asude Şaşmaz"]),
      make("b", ["Önder Focan"]),
      make("c", ["Asude Şaşmaz", "Önder Focan"], "Bova"),
    ],
    "2026-09-14",
  );
  const nardis = index.venues.find((v) => v.id === "Nardis")!;
  expect(nardis.musicians).toEqual({ 1: 1, 2: 1, 3: 1 });
  expect(nardis.edges).toEqual([{ source: 1, target: 2, weight: 1 }]);
  expect(index.venues.find((v) => v.id === "Bova")!.edges).toEqual([
    { source: 2, target: 3, weight: 1 },
  ]);
});

test("ambiguous and absent names are not assigned to a guessed person", () => {
  const index = indexConcerts(
    nodes,
    [make("a", ["Same Name", "Unknown Person", "Asude Şaşmaz"])],
    "2026-09-14",
  );
  expect(index.counts).toEqual({ 2: 1 });
  expect(index.stats.unmatchedNames).toBe(2);
  expect(index.edges).toEqual([]);
});
