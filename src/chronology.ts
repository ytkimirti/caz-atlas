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

export function parseMonth(value: string | null): number | null {
  return value && /^\d{4}-(0[1-9]|1[0-2])$/.test(value)
    ? monthIndex(value)
    : null;
}

export function readRange(
  from: string | null,
  to: string | null,
  bounds: DateRange,
): DateRange {
  const read = (value: string | null, fallback: number) => {
    const month = parseMonth(value);
    return month === null
      ? fallback
      : Math.max(bounds[0], Math.min(bounds[1], month));
  };
  const start = read(from, bounds[0]),
    end = read(to, bounds[1]);
  return start <= end ? [start, end] : bounds;
}

// Index each distinct musician and collaboration once. Sparse monthly prefix
// totals make every subsequent window a pure query, including backward seeks.
export function createConcertWindow(events: DatedConcert[], venue = "") {
  const concerts = new Map<number, number>();
  const musicians = new Map<number, Map<number, number>>();
  const pairs = new Map<
    string,
    { source: number; target: number; months: Map<number, number> }
  >();
  const increment = (months: Map<number, number>, month: number) =>
    months.set(month, (months.get(month) || 0) + 1);
  for (const event of events) {
    if (venue && event.venue !== venue) continue;
    const month = monthIndex(event.date);
    increment(concerts, month);
    for (const id of event.musicians) {
      let months = musicians.get(id);
      if (!months) musicians.set(id, (months = new Map()));
      increment(months, month);
    }
    for (let i = 0; i < event.musicians.length; i++) {
      for (let j = i + 1; j < event.musicians.length; j++) {
        const a = event.musicians[i],
          b = event.musicians[j],
          key = edgeKey(a, b);
        let pair = pairs.get(key);
        if (!pair) {
          pair = {
            source: Math.min(a, b),
            target: Math.max(a, b),
            months: new Map(),
          };
          pairs.set(key, pair);
        }
        increment(pair.months, month);
      }
    }
  }
  function prefix(months: Map<number, number>) {
    const dates = [...months.keys()].sort((a, b) => a - b);
    let total = 0;
    const totals = dates.map((date) => (total += months.get(date)!));
    return { dates, totals };
  }
  function count(
    { dates, totals }: ReturnType<typeof prefix>,
    start: number,
    end: number,
  ) {
    const last = dates.length - 1;
    if (last < 0 || start > dates[last] || end < dates[0]) return 0;
    function through(month: number) {
      if (month < dates[0]) return 0;
      if (month >= dates[last]) return totals[last];
      let lo = 0,
        hi = dates.length;
      while (lo < hi) {
        const mid = (lo + hi) >>> 1;
        if (dates[mid] <= month) lo = mid + 1;
        else hi = mid;
      }
      return lo ? totals[lo - 1] : 0;
    }
    return through(end) - through(start - 1);
  }
  const total = prefix(concerts);
  const people = [...musicians].map(([id, months]) => ({
    id,
    series: prefix(months),
  }));
  const collaborations = [...pairs.values()].map(
    ({ source, target, months }) => ({
      source,
      target,
      series: prefix(months),
    }),
  );
  // The query retains only compact sorted series, never the construction maps.
  concerts.clear();
  musicians.clear();
  pairs.clear();
  return (start: number, end: number) => {
    const counts: Record<string, number> = {};
    const edges: Edge[] = [];
    if (!Number.isInteger(start) || !Number.isInteger(end) || start > end)
      return { counts, edges, concerts: 0 };
    for (const person of people) {
      const value = count(person.series, start, end);
      if (value) counts[person.id] = value;
    }
    for (const pair of collaborations) {
      const weight = count(pair.series, start, end);
      if (weight)
        edges.push({ source: pair.source, target: pair.target, weight });
    }
    return { counts, edges, concerts: count(total, start, end) };
  };
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
