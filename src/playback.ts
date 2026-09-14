import { monthIndex } from "./chronology";
import type { DateRange } from "./chronology";
import type { DatedConcert } from "./types";

export interface ArrivalSchedule {
  start: number;
  months: number[];
}

export function playbackArrivals(
  timeline: DatedConcert[],
  range: DateRange,
  minimum: number | null,
  venue = "",
): ArrivalSchedule {
  const months = Array<number>(range[1] - range[0] + 1).fill(0);
  const counts = new Map<number, number>();
  const threshold = minimum ?? 0;
  for (const concert of timeline) {
    const month = monthIndex(concert.date);
    if (month > range[1]) break;
    if (month < range[0] || (venue && concert.venue !== venue)) continue;
    for (const id of new Set(concert.musicians)) {
      const count = (counts.get(id) ?? 0) + 1;
      counts.set(id, count);
      if (count === threshold + 1) months[month - range[0]]++;
    }
  }
  return { start: range[0], months };
}

export function playbackStep(
  cursor: number,
  end: number,
  arrivals: ArrivalSchedule,
  speed: number,
) {
  let next = cursor;
  let incoming = 0;
  const countAt = (month: number) =>
    arrivals.months[month - arrivals.start] ?? 0;
  const horizon = Math.min(end, cursor + 12);
  // Quiet years can pass quickly. Busy months get their own physical interval.
  while (next < horizon) {
    const count = countAt(next + 1);
    if (next > cursor && incoming + count > 8) break;
    incoming += count;
    next++;
    if (incoming >= 8) break;
  }
  const population = Math.max(countAt(cursor), incoming);
  return {
    cursor: next,
    incoming,
    // Leave time after a large arrival as well as before the following batch.
    delay: Math.min(4500, 650 + population * 90) / speed,
  };
}
