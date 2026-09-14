import { expect, test } from "bun:test";
import {
  concertWindow,
  concertHistogram,
  concertEnsembles,
  createConcertWindow,
  monthIndex,
  monthValue,
  readRange,
  parseMonth,
} from "../../src/chronology";
import type { ConcertIndex, DatedConcert } from "../../src/types";

const events: DatedConcert[] = [
  { date: "2020-01-01", venue: "A", musicians: [1, 2] },
  { date: "2020-01-31", venue: "A", musicians: [2, 3] },
  { date: "2020-02-01", venue: "B", musicians: [1, 2] },
  { date: "2020-03-01", venue: "A", musicians: [4] },
];
const jan = monthIndex("2020-01"),
  mar = monthIndex("2020-03");
test("month boundaries are inclusive and isolated performers stay visible", () => {
  const result = concertWindow(events, jan, jan);
  expect(result.concerts).toBe(2);
  expect(result.counts).toEqual({ 1: 1, 2: 2, 3: 1 });
  expect(result.edges).toHaveLength(2);
  expect(concertWindow(events, mar, mar)).toEqual({
    counts: { 4: 1 },
    edges: [],
    concerts: 1,
  });
});

test("month inputs accept only complete months with valid bounds", () => {
  for (const value of [
    null,
    "",
    "2",
    "2020",
    "2020-",
    "2020-1",
    "2020-00",
    "2020-13",
    "2020-99",
    "2020-01-01",
    " 2020-01",
    "NaN-NaN",
  ])
    expect(parseMonth(value)).toBeNull();
  expect(parseMonth("2020-01")).toBe(jan);
  expect(parseMonth("2020-12")).toBe(jan + 11);
});

test("indexed windows match direct aggregation across arbitrary seeks and venues", () => {
  // Unsorted dates, repeated pairs, solo and unmatched concerts, and quiet months.
  const sample: DatedConcert[] = [...events];
  for (let i = 0; i < 180; i++) {
    sample.push({
      date: `${monthValue(jan + ((i * 7) % 36))}-15`,
      venue: i % 3 ? "A" : "B",
      musicians:
        i % 7 === 0 ? [] : i % 5 === 0 ? [4] : [(i % 4) + 1, (i % 4) + 5, 10],
    });
  }
  const canonical = (result: ReturnType<typeof concertWindow>) => ({
    ...result,
    edges: [...result.edges].sort(
      (a, b) => a.source - b.source || a.target - b.target,
    ),
  });
  for (const venue of ["", "A", "B", "missing"]) {
    const query = createConcertWindow(sample, venue);
    for (let start = jan - 1; start <= jan + 37; start++) {
      for (let end = jan + 37; end >= start; end--) {
        expect(canonical(query(start, end))).toEqual(
          canonical(concertWindow(sample, start, end, venue)),
        );
      }
    }
    const previous = query(jan, jan + 35);
    const saved = structuredClone(previous);
    query(jan + 8, jan + 12);
    query(jan - 20, jan - 1);
    expect(previous).toEqual(saved);
    // Consumers cannot mutate the index through an earlier React snapshot.
    previous.counts[1] = 999;
    if (previous.edges[0]) previous.edges[0].weight = 999;
    expect(canonical(query(jan, jan + 35))).toEqual(canonical(saved));
    expect(query(jan + 1, jan)).toEqual({ counts: {}, edges: [], concerts: 0 });
    expect(query(NaN, jan)).toEqual({ counts: {}, edges: [], concerts: 0 });
  }
  expect(createConcertWindow([])(jan, mar)).toEqual({
    counts: {},
    edges: [],
    concerts: 0,
  });
});
test("time and venue intersect without introducing collaborations", () => {
  const result = concertWindow(events, jan, mar, "A");
  expect(result.concerts).toBe(3);
  expect(result.edges).toEqual([
    { source: 1, target: 2, weight: 1 },
    { source: 2, target: 3, weight: 1 },
  ]);
  expect(concertWindow(events, jan, mar).edges[0].weight).toBe(2);
  expect(concertWindow(events, jan + 1, jan + 1, "A").counts).toEqual({});
});
test("histogram preserves quiet months and filters venues", () => {
  expect(concertHistogram(events, [jan, mar])).toEqual([2, 1, 1]);
  expect(concertHistogram(events, [jan, mar], "A")).toEqual([2, 0, 1]);
});
test("indexed full history preserves every shipped concert count and pair weight", async () => {
  const data: ConcertIndex = await Bun.file(
    new URL("../../public/data/concerts.json", import.meta.url),
  ).json();
  const result = createConcertWindow(data.timeline)(
    monthIndex(data.timeline[0].date),
    monthIndex(data.timeline.at(-1)!.date),
  );
  expect(result.counts).toEqual(data.counts);
  expect(result.concerts).toBe(data.meta.concerts);
  const byPair = (edges: ConcertIndex["edges"]) =>
    new Map(
      edges.map((edge) => [`${edge.source}:${edge.target}`, edge.weight]),
    );
  expect(byPair(result.edges)).toEqual(byPair(data.edges));
});
test("shared URLs clamp out-of-bounds dates and reject invalid or reversed ranges", () => {
  expect(readRange("2010-01", "2030-01", [jan, mar])).toEqual([jan, mar]);
  expect(readRange("2020-03", "2020-01", [jan, mar])).toEqual([jan, mar]);
  expect(readRange("oops", "2020-99", [jan, mar])).toEqual([jan, mar]);
  expect(readRange("2020-02", "2020-02", [jan, mar])).toEqual([
    jan + 1,
    jan + 1,
  ]);
  expect(monthValue(monthIndex("1956-04-23"))).toBe("1956-04");
});

test("project rosters follow time and venue without leaking future appearances", () => {
  const history: DatedConcert[] = [
    { date: "2020-01-01", venue: "A", ensemble: "band", musicians: [1, 2] },
    { date: "2020-02-01", venue: "A", ensemble: "band", musicians: [2, 3] },
    { date: "2020-01-01", venue: "B", ensemble: "band", musicians: [4, 5] },
  ];
  const known = [{ id: "band", name: "Band", concerts: 3, musicians: {} }];
  expect(concertEnsembles(history, known, jan, jan, "A")).toEqual([
    { id: "band", name: "Band", concerts: 1, musicians: { 1: 1, 2: 1 } },
  ]);
  expect(concertEnsembles(history, known, mar, mar)).toEqual([]);
  expect(concertEnsembles(history, known, jan, mar)[0].concerts).toBe(3);
});
