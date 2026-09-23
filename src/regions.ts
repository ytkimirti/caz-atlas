import type { Edge, Ensemble } from "./types";

export interface Region {
  id: string;
  name: string;
  /** Members whose markers form the labelled shape. */
  members: number[];
  /** Layout-space sphere around the members. */
  x: number;
  y: number;
  z: number;
  r: number;
  score: number;
}
interface Point {
  id: number;
  x: number;
  y: number;
  z?: number;
}

// Members farther than this many median distances from the roster center are
// strays: guests, or regulars who also lead a scene elsewhere on the map.
const CORE_REACH = 2.5;
// Share of the visible roster that must sit in the shape.
const MIN_COVERAGE = 0.6;
// Share of the markers inside the shape that must belong to the roster.
const MIN_PURITY = 0.5;
// Regions of similar size may share at most this share of their members.
const MAX_SHARED = 0.4;
// Share of the members' shared concerts played with each other. Below it the
// roster is a few sidemen passing through other people's scenes.
const MIN_INTERNAL = 0.3;
// Radius over square root of members, in median nearest-neighbour spacings.
// Past this a roster reads as scattered markers, not a shape.
const MAX_SPREAD = 1.15;

// Parsed rosters, shared across calls with the same ensemble objects.
const rosterIds = new WeakMap<Ensemble, number[]>();
const rosterOf = (ensemble: Ensemble) => {
  let ids = rosterIds.get(ensemble);
  if (!ids) {
    ids = Object.keys(ensemble.musicians).map(Number);
    rosterIds.set(ensemble, ids);
  }
  return ids;
};

const median = (values: number[]) => {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
};

// A concert title names a place on the map when its roster sits together,
// dominates that spot and mostly plays with each other. Roster size is free:
// a trio and a big band both qualify, a leader's rotating sidemen do not.
export function findRegions(
  points: Point[],
  ensembles: Ensemble[],
  edges: Edge[],
): Region[] {
  if (points.length < 3) return [];
  const byId = new Map(points.map((p) => [p.id, p]));
  const ties = new Map<number, Edge[]>();
  for (const edge of edges) {
    if (!byId.has(edge.source) || !byId.has(edge.target)) continue;
    for (const id of [edge.source, edge.target]) {
      const list = ties.get(id);
      if (list) list.push(edge);
      else ties.set(id, [edge]);
    }
  }
  let minX = Infinity,
    minY = Infinity,
    maxX = -Infinity,
    maxY = -Infinity;
  for (const p of points) {
    minX = Math.min(minX, p.x);
    maxX = Math.max(maxX, p.x);
    minY = Math.min(minY, p.y);
    maxY = Math.max(maxY, p.y);
  }
  const cell =
    Math.sqrt(((maxX - minX || 1) * (maxY - minY || 1)) / points.length) * 2;
  const cols = Math.max(1, Math.ceil((maxX - minX) / cell) + 1);
  const rows = Math.max(1, Math.ceil((maxY - minY) / cell) + 1);
  const grid = new Map<number, Point[]>();
  for (const p of points) {
    const key =
      Math.floor((p.y - minY) / cell) * cols + Math.floor((p.x - minX) / cell);
    const bucket = grid.get(key);
    if (bucket) bucket.push(p);
    else grid.set(key, [p]);
  }
  const distance3 = (a: Point, b: Point) =>
    Math.sqrt(
      (a.x - b.x) ** 2 + (a.y - b.y) ** 2 + ((a.z ?? 0) - (b.z ?? 0)) ** 2,
    );
  // Median nearest-neighbour distance from an even sample: dense cells hold
  // hundreds of markers, and the median needs only a few thousand.
  const nearest: number[] = [];
  const stride = Math.max(1, Math.floor(points.length / 2000));
  for (let k = 0; k < points.length; k += stride) {
    const p = points[k];
    const cx = Math.floor((p.x - minX) / cell),
      cy = Math.floor((p.y - minY) / cell);
    let best = Infinity;
    for (let dy = -1; dy <= 1; dy++)
      for (let dx = -1; dx <= 1; dx++)
        for (const q of grid.get((cy + dy) * cols + cx + dx) ?? [])
          if (q !== p) best = Math.min(best, distance3(p, q));
    if (best < Infinity) nearest.push(best);
  }
  const spacing = nearest.length ? median(nearest) : cell;
  const countWithin = (x: number, y: number, z: number, r: number) => {
    let count = 0;
    const x0 = Math.max(0, Math.floor((x - r - minX) / cell)),
      x1 = Math.min(cols - 1, Math.floor((x + r - minX) / cell)),
      y0 = Math.max(0, Math.floor((y - r - minY) / cell)),
      y1 = Math.min(rows - 1, Math.floor((y + r - minY) / cell));
    for (let cy = y0; cy <= y1; cy++)
      for (let cx = x0; cx <= x1; cx++)
        for (const p of grid.get(cy * cols + cx) ?? [])
          if ((p.x - x) ** 2 + (p.y - y) ** 2 + ((p.z ?? 0) - z) ** 2 <= r * r)
            count++;
    return count;
  };

  const candidates: Region[] = [];
  for (const ensemble of ensembles) {
    const roster: Point[] = [];
    for (const id of rosterOf(ensemble)) {
      const p = byId.get(id);
      if (p) roster.push(p);
    }
    if (roster.length < 3) continue;
    const cx = median(roster.map((p) => p.x)),
      cy = median(roster.map((p) => p.y)),
      cz = median(roster.map((p) => p.z ?? 0));
    const distance = roster.map((p) =>
      distance3(p, { id: 0, x: cx, y: cy, z: cz }),
    );
    const reach = Math.max(median(distance) * CORE_REACH, cell * 0.05);
    const core = roster.filter((_, i) => distance[i] <= reach);
    if (core.length < 3 || core.length / roster.length < MIN_COVERAGE) continue;
    let x = 0,
      y = 0,
      z = 0;
    for (const p of core) {
      x += p.x;
      y += p.y;
      z += p.z ?? 0;
    }
    x /= core.length;
    y /= core.length;
    z /= core.length;
    let r = 0;
    for (const p of core) r = Math.max(r, distance3(p, { id: 0, x, y, z }));
    if (r > MAX_SPREAD * spacing * Math.sqrt(core.length)) continue;
    const purity = core.length / Math.max(core.length, countWithin(x, y, z, r));
    if (purity < MIN_PURITY) continue;
    const inCore = new Set(core.map((p) => p.id));
    let internal = 0,
      total = 0;
    for (const p of core)
      for (const edge of ties.get(p.id) ?? []) {
        total += edge.weight;
        if (inCore.has(edge.source) && inCore.has(edge.target))
          internal += edge.weight;
      }
    if (!total || internal / total < MIN_INTERNAL) continue;
    candidates.push({
      id: ensemble.id,
      name: ensemble.name,
      members: core.map((p) => p.id),
      x,
      y,
      z,
      r,
      // Big, clean shapes first; concerts break ties between equal rosters.
      score:
        core.length *
        purity *
        purity *
        (1 + 0.1 * Math.log1p(ensemble.concerts)),
    });
  }
  candidates.sort((a, b) => b.score - a.score || a.id.localeCompare(b.id));
  // One name per shape: a quartet and quintet of the same leader, or a big
  // band and its guest-soloist edition, compete for the same members. A trio
  // inside a big band is a different scale and keeps its own label.
  const claims = new Map<number, Region[]>();
  const regions: Region[] = [];
  for (const candidate of candidates) {
    let shared = 0;
    for (const id of candidate.members)
      if (
        claims
          .get(id)
          ?.some(
            (other) => other.r < candidate.r * 3 && candidate.r < other.r * 3,
          )
      )
        shared++;
    if (shared / candidate.members.length > MAX_SHARED) continue;
    regions.push(candidate);
    for (const id of candidate.members) {
      const list = claims.get(id);
      if (list) list.push(candidate);
      else claims.set(id, [candidate]);
    }
  }
  return regions;
}

// Map labels carry the ensemble, not the programme: subtitles after a dash
// and parenthesised conductors or soloists stay in the search results.
export function shortName(name: string) {
  const short = name
    .replace(/\s+-\s+.*$/, "")
    .replace(/\s*\([^)]*\)/g, "")
    .trim();
  return short.length >= 3 ? short : name;
}

// Greedy word wrap into at most `lines` lines; the last line is truncated.
export function wrapName(
  name: string,
  maxWidth: number,
  measure: (text: string) => number,
  lines = 2,
) {
  const out: string[] = [];
  let current = "";
  for (const word of name.split(/\s+/)) {
    const next = current ? `${current} ${word}` : word;
    if (measure(next) <= maxWidth || !current) current = next;
    else {
      out.push(current);
      current = word;
    }
  }
  if (current) out.push(current);
  if (out.length > lines) {
    out.length = lines;
    out[lines - 1] += "…";
  }
  return out.map((line) => {
    while (measure(line) > maxWidth && line.length > 2)
      line = line.slice(0, -2).trimEnd() + "…";
    return line;
  });
}
