import { monthIndex } from "./chronology";
import type { DateRange } from "./chronology";
import type { DatedConcert, Edge } from "./types";

/** Which concerts count: one venue or city, jam sessions, large lineups. */
export interface Scope {
  venue: string;
  city: string;
  jams: boolean;
  crowds: boolean;
}
// Orchestras, big bands and festival finales credit this many musicians or
// more; every pair among them becomes a tie.
export const CROWD = 10;
export type ConcertTest = (concert: DatedConcert) => boolean;

export function scopeTest(
  scope: Scope,
  cityOf: Map<string, string>,
): ConcertTest | null {
  if (!scope.venue && !scope.city && scope.jams && scope.crowds) return null;
  return (concert) =>
    (!scope.venue || concert.venue === scope.venue) &&
    (!scope.city || cityOf.get(concert.venue) === scope.city) &&
    (scope.jams || !concert.jam) &&
    (scope.crowds || concert.musicians.length < CROWD);
}

/** Timeline indices of each musician's concerts, oldest first. */
export function concertsByMusician(timeline: DatedConcert[]) {
  const map = new Map<number, number[]>();
  timeline.forEach((concert, i) => {
    for (const id of concert.musicians) {
      const list = map.get(id);
      if (list) list.push(i);
      else map.set(id, [i]);
    }
  });
  return map;
}

/** Concerts inside the scope and date range, newest first. */
export function pickConcerts(
  indices: readonly number[],
  timeline: DatedConcert[],
  test: ConcertTest | null,
  range: DateRange,
) {
  const result: number[] = [];
  for (let i = indices.length - 1; i >= 0; i--) {
    const concert = timeline[indices[i]];
    const month = monthIndex(concert.date);
    if (month < range[0] || month > range[1]) continue;
    if (!test || test(concert)) result.push(indices[i]);
  }
  return result;
}

/** Common entries of two ascending index lists. */
export function sharedConcerts(a: readonly number[], b: readonly number[]) {
  const result: number[] = [];
  for (let i = 0, j = 0; i < a.length && j < b.length;)
    if (a[i] === b[j]) {
      result.push(a[i]);
      i++;
      j++;
    } else if (a[i] < b[j]) i++;
    else j++;
  return result;
}

/** Concerts of a list whose month falls inside the range, order kept. */
export function withinDates(
  concerts: readonly number[],
  timeline: DatedConcert[],
  range: DateRange,
) {
  return concerts.filter((i) => {
    const month = monthIndex(timeline[i].date);
    return month >= range[0] && month <= range[1];
  });
}

/** Yearly activity of a newest-first concert list. */
export function career(concerts: readonly number[], timeline: DatedConcert[]) {
  if (!concerts.length) return null;
  const first = Number(
    timeline[concerts[concerts.length - 1]].date.slice(0, 4),
  );
  const last = Number(timeline[concerts[0]].date.slice(0, 4));
  const years = Array<number>(last - first + 1).fill(0);
  for (const i of concerts)
    years[Number(timeline[i].date.slice(0, 4)) - first]++;
  return {
    first: timeline[concerts[concerts.length - 1]].date,
    last: timeline[concerts[0]].date,
    startYear: first,
    years,
  };
}

/** Venues of a concert list, busiest first. */
export function topVenues(
  concerts: readonly number[],
  timeline: DatedConcert[],
) {
  const venues = new Map<string, number>();
  for (const i of concerts) {
    const { venue } = timeline[i];
    venues.set(venue, (venues.get(venue) ?? 0) + 1);
  }
  return [...venues]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([id, count]) => ({ id, count }));
}

/** January to December of the years, clamped to the archive. */
export function yearRange(
  from: number,
  to: number,
  bounds: DateRange,
): DateRange {
  return [
    Math.min(Math.max(from * 12, bounds[0]), bounds[1]),
    Math.max(Math.min(to * 12 + 11, bounds[1]), bounds[0]),
  ];
}

type Ranked = { id: number; count: number }[];

/**
 * Starting points for the window ending at month `end`: the busiest musicians
 * of its last year and those whose first concert in scope came within its
 * last two years. Counts stay inside the window, so every pick is on the map.
 */
export function discover(
  timeline: DatedConcert[],
  start: number,
  end: number,
  limit = 5,
) {
  const recent = new Map<number, number>();
  const first = new Map<number, number>();
  for (const concert of timeline) {
    const month = monthIndex(concert.date);
    if (month > end) break;
    for (const id of concert.musicians) {
      if (!first.has(id)) first.set(id, month);
      if (month > end - 12 && month >= start)
        recent.set(id, (recent.get(id) ?? 0) + 1);
    }
  }
  const top = (entries: [number, number][]): Ranked =>
    entries
      .sort((a, b) => b[1] - a[1] || a[0] - b[0])
      .slice(0, limit)
      .map(([id, count]) => ({ id, count }));
  // Newcomers are ranked by their concerts since arriving, within two years.
  const arrivals = new Map<number, number>();
  for (const concert of timeline) {
    const month = monthIndex(concert.date);
    if (month > end) break;
    if (month <= end - 24 || month < start) continue;
    for (const id of concert.musicians)
      if (first.get(id)! > end - 24)
        arrivals.set(id, (arrivals.get(id) ?? 0) + 1);
  }
  return { active: top([...recent]), newcomers: top([...arrivals]) };
}

/**
 * Musicians on the most shortest paths (sampled betweenness) over repeated
 * ties, so a single shared bill, often an orchestra, does not make a bridge.
 */
export function bridges(
  nodes: { id: number }[],
  edges: Edge[],
  limit = 5,
  minWeight = 2,
  samples = 64,
): Ranked {
  const n = nodes.length;
  if (n < 3) return [];
  const index = new Map(nodes.map((node, i) => [node.id, i]));
  const degree = new Int32Array(n);
  const strong = edges.filter(
    (e) => e.weight >= minWeight && index.has(e.source) && index.has(e.target),
  );
  for (const e of strong) {
    degree[index.get(e.source)!]++;
    degree[index.get(e.target)!]++;
  }
  const start = new Int32Array(n + 1);
  for (let i = 0; i < n; i++) start[i + 1] = start[i] + degree[i];
  const fill = start.slice(0, n);
  const links = new Int32Array(start[n]);
  for (const e of strong) {
    const a = index.get(e.source)!,
      b = index.get(e.target)!;
    links[fill[a]++] = b;
    links[fill[b]++] = a;
  }
  const score = new Float64Array(n);
  const sigma = new Float64Array(n),
    delta = new Float64Array(n),
    dist = new Int32Array(n),
    order = new Int32Array(n);
  // Evenly spaced sources over the most connected half keep runs stable.
  const sources = [...Array(n).keys()]
    .filter((i) => degree[i] > 0)
    .sort((a, b) => degree[b] - degree[a] || a - b);
  const step = Math.max(1, Math.floor(sources.length / samples));
  for (let k = 0; k < sources.length && k / step < samples; k += step) {
    const s = sources[k];
    sigma.fill(0);
    delta.fill(0);
    dist.fill(-1);
    sigma[s] = 1;
    dist[s] = 0;
    let head = 0,
      tail = 0;
    order[tail++] = s;
    while (head < tail) {
      const v = order[head++];
      for (let j = start[v]; j < start[v + 1]; j++) {
        const w = links[j];
        if (dist[w] < 0) {
          dist[w] = dist[v] + 1;
          order[tail++] = w;
        }
        if (dist[w] === dist[v] + 1) sigma[w] += sigma[v];
      }
    }
    for (let i = tail - 1; i > 0; i--) {
      const w = order[i];
      for (let j = start[w]; j < start[w + 1]; j++) {
        const v = links[j];
        if (dist[v] === dist[w] - 1)
          delta[v] += (sigma[v] / sigma[w]) * (1 + delta[w]);
      }
      score[w] += delta[w];
    }
  }
  return [...score.keys()]
    .filter((i) => score[i] > 0)
    .sort((a, b) => score[b] - score[a] || nodes[a].id - nodes[b].id)
    .slice(0, limit)
    .map((i) => ({ id: nodes[i].id, count: degree[i] }));
}
