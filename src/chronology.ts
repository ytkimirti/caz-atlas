import type { DatedConcert, Edge } from "./types";
import { edgeKey } from "./graph";

export const monthIndex = (date: string) => {
  const [year, month] = date.split("-").map(Number);
  return year * 12 + month - 1;
};
export const monthValue = (month: number) =>
  `${Math.floor(month / 12)}-${String((month % 12) + 1).padStart(2, "0")}`;
export const monthLabel = (month: number) =>
  new Date(Math.floor(month / 12), month % 12, 1).toLocaleDateString("tr-TR", {
    month: "short",
    year: "numeric",
  });
export type DateRange = [number, number];

export function readRange(
  from: string | null,
  to: string | null,
  bounds: DateRange,
): DateRange {
  const read = (value: string | null, fallback: number) => {
    if (!value || !/^\d{4}-(0[1-9]|1[0-2])$/.test(value)) return fallback;
    return Math.max(bounds[0], Math.min(bounds[1], monthIndex(value)));
  };
  const start = read(from, bounds[0]),
    end = read(to, bounds[1]);
  return start <= end ? [start, end] : bounds;
}

export function concertWindow(
  events: DatedConcert[],
  start: number,
  end: number,
  venue = "",
) {
  const counts: Record<string, number> = {};
  const pairs = new Map<string, Edge>();
  let concerts = 0;
  for (const event of events) {
    const month = monthIndex(event.date);
    if (month < start || month > end || (venue && event.venue !== venue))
      continue;
    concerts++;
    for (const id of event.musicians) counts[id] = (counts[id] || 0) + 1;
    for (let i = 0; i < event.musicians.length; i++) {
      for (let j = i + 1; j < event.musicians.length; j++) {
        const a = event.musicians[i],
          b = event.musicians[j],
          key = edgeKey(a, b);
        const edge = pairs.get(key);
        if (edge) edge.weight++;
        else
          pairs.set(key, {
            source: Math.min(a, b),
            target: Math.max(a, b),
            weight: 1,
          });
      }
    }
  }
  return { counts, edges: [...pairs.values()], concerts };
}

export function concertHistogram(
  events: DatedConcert[],
  bounds: DateRange,
  venue = "",
) {
  const bins = Array<number>(bounds[1] - bounds[0] + 1).fill(0);
  for (const event of events) {
    const i = monthIndex(event.date) - bounds[0];
    if (i >= 0 && i < bins.length && (!venue || event.venue === venue))
      bins[i]++;
  }
  return bins;
}
