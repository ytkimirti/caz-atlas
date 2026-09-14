import { expect, test } from "bun:test";
import { playbackArrivals, playbackStep } from "../../src/playback";
import { monthIndex } from "../../src/chronology";

test("arrival counts follow the concert threshold, venue, and selected window", () => {
  const jan = monthIndex("2020-01");
  const events = [
    { date: "2019-12-01", venue: "A", musicians: [1, 2] },
    { date: "2020-01-01", venue: "A", musicians: [1, 2] },
    { date: "2020-02-01", venue: "B", musicians: [1, 3] },
    { date: "2020-03-01", venue: "A", musicians: [1, 2] },
    { date: "2020-03-02", venue: "A", musicians: [1, 2] },
  ];
  expect(playbackArrivals(events, [jan, jan + 2], 1).months).toEqual([0, 1, 1]);
  expect(playbackArrivals(events, [jan, jan + 2], 1, "A").months).toEqual([
    0, 0, 2,
  ]);
  expect(playbackArrivals(events, [jan, jan + 2], null).months).toEqual([
    2, 1, 0,
  ]);
});

test("crowded months get smaller date steps and longer physics intervals", () => {
  const sparse = { start: 0, months: [0, 1, 1, 1, 1, 1] };
  const crowded = { start: 0, months: [0, 6, 7, 3, 40, 0] };
  const quietStep = playbackStep(0, 5, sparse, 1);
  const busyStep = playbackStep(0, 5, crowded, 1);
  expect(quietStep.cursor).toBe(5);
  expect(busyStep.cursor).toBe(1);
  expect(busyStep.incoming).toBe(6);
  expect(busyStep.delay).toBeGreaterThan(quietStep.delay);
  expect(playbackStep(3, 5, crowded, 1).cursor).toBe(4);
  expect(playbackStep(4, 5, crowded, 1).delay).toBeGreaterThan(3000);
  expect(playbackStep(0, 5, crowded, 2).delay).toBe(busyStep.delay / 2);
});

test("quiet windows advance, busy windows do not stall, and the cursor stops at the end", () => {
  const empty = { start: 0, months: Array(40).fill(0) };
  expect(playbackStep(0, 39, empty, 1).cursor).toBe(12);
  expect(playbackStep(38, 39, empty, 1).cursor).toBe(39);
  expect(playbackStep(39, 39, empty, 1).cursor).toBe(39);
  const full = { start: 0, months: [0, 1000, 1000] };
  expect(playbackStep(0, 2, full, 1).cursor).toBe(1);
  expect(playbackStep(0, 2, full, 1).delay).toBeLessThanOrEqual(4500);
});
