import { expect, test } from "bun:test";
import {
  concertWindow,
  concertHistogram,
  monthIndex,
  monthValue,
  readRange,
} from "../../src/chronology";
import type { DatedConcert } from "../../src/types";

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
