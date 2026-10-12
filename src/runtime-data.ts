import type {
  Atlas,
  ConcertIndex,
  DatedConcert,
  Ensemble,
  GraphMusician,
  Venue,
} from "./types";
import { groupId } from "./types";
import { filterGraph } from "./graph";
import { createConcertWindow } from "./chronology";
import type { LayoutRequest, Position } from "./layout";
import { cacheLayout, layoutKey } from "./layout-cache";
import { defaultResolution } from "./layout-options";

export type RuntimeVenue = Pick<Venue, "id" | "name" | "city" | "concerts">;
export interface RuntimeConcerts {
  meta: ConcertIndex["meta"];
  venues: RuntimeVenue[];
  timeline: DatedConcert[];
}
export interface RuntimeData {
  nodes: GraphMusician[];
  concerts: RuntimeConcerts;
  /** Layout key of the default view, whose positions are the node x / y. */
  layout?: string;
  /** detailsVersion of the matching details.json. */
  details: string;
}
export interface ProjectData {
  ensembles: Ensemble[];
  venues: Record<string, Ensemble[]>;
}
/** Per-concert text, aligned with the runtime timeline and loaded on demand. */
export interface ConcertDetails {
  keys: string[];
  titles: (string | 0)[];
  /** Unmatched lineup names by timeline index. */
  others: Record<string, string[]>;
}
type PackedNode = [
  id: number,
  key: string,
  name: string,
  group: string,
  degree: number,
  x: number,
  y: number,
];
type PackedConcert = [
  date: string,
  venue: string,
  musicians: number[],
  ensemble?: string | 0,
  jam?: 1,
];
export interface PackedRuntime {
  version: 2;
  layout?: string;
  details: string;
  nodes: PackedNode[];
  concerts: Omit<RuntimeConcerts, "timeline"> & { timeline: PackedConcert[] };
}

// Counts and ties are derived from the timeline in the browser, so archive
// totals and per-venue graphs never ship. Tuples avoid repeating property names.
export function packRuntime(
  atlas: Atlas,
  concerts: ConcertIndex,
  // Precomputed default view; see defaultLayoutRequest.
  layout?: { key: string; positions: Position[] },
): PackedRuntime {
  const positions = layout && new Map(layout.positions.map((p) => [p.id, p]));
  const round = (value: number) => Math.round(value * 10) / 10;
  return {
    version: 2,
    ...(layout ? { layout: layout.key } : {}),
    details: detailsVersion({ keys: concerts.timeline.map((c) => c.key) }),
    nodes: atlas.nodes.map(({ id, key, name, group, degree, x, y }) => {
      const p = positions?.get(id);
      return [
        id,
        key,
        name,
        groupId(group),
        degree,
        p ? round(p.x) : x,
        p ? round(p.y) : y,
      ];
    }),
    concerts: {
      meta: concerts.meta,
      venues: concerts.venues.map(({ id, name, city, concerts }) => ({
        id,
        name,
        city,
        concerts,
      })),
      timeline: concerts.timeline.map(
        ({ date, venue, musicians, ensemble, jam }) => {
          const packed: PackedConcert = [date, venue, musicians];
          if (ensemble || jam) packed.push(ensemble ?? 0);
          if (jam) packed.push(1);
          return packed;
        },
      ),
    },
  };
}
/** Concert counts and ties over the whole timeline. */
export function allTime(timeline: DatedConcert[]) {
  return createConcertWindow(timeline)(0, 1e6);
}
// Mirrors the app's initial view: all dates, no filters, default layout.
export function defaultLayoutRequest(
  nodes: GraphMusician[],
  totals: ReturnType<typeof allTime>,
): LayoutRequest {
  const graph = filterGraph(
    { nodes, edges: totals.edges },
    totals.counts,
    null,
    totals.counts,
  );
  return {
    nodes: graph.nodes.map((n) => ({
      id: n.id,
      count: totals.counts[n.id] || 0,
    })),
    edges: graph.edges,
    mode: "2d",
    spacing: 1,
    resolution: defaultResolution,
  };
}
// Shipped positions make the first view ready without a layout worker.
export function seedDefaultLayout(
  data: RuntimeData,
  totals: ReturnType<typeof allTime>,
) {
  if (!data.layout) return;
  const request = defaultLayoutRequest(data.nodes, totals);
  if (layoutKey(request) !== data.layout) return;
  const byId = new Map(data.nodes.map((n) => [n.id, n]));
  cacheLayout(
    data.layout,
    request.nodes.map(({ id }) => ({
      id,
      x: byId.get(id)!.x,
      y: byId.get(id)!.y,
    })),
  );
}
export function unpackRuntime(data: PackedRuntime): RuntimeData {
  if (data.version !== 2) throw new Error("Unsupported runtime data version");
  return {
    layout: data.layout,
    details: data.details,
    nodes: data.nodes.map(([id, key, name, group, degree, x, y]) => ({
      id,
      key,
      name,
      group,
      degree,
      x,
      y,
    })),
    concerts: {
      ...data.concerts,
      timeline: data.concerts.timeline.map(
        ([date, venue, musicians, ensemble, jam]) => ({
          date,
          venue,
          musicians,
          ...(ensemble ? { ensemble } : {}),
          ...(jam ? { jam: true as const } : {}),
        }),
      ),
    },
  };
}
export function projectData(concerts: ConcertIndex): ProjectData {
  return {
    ensembles: concerts.ensembles,
    venues: Object.fromEntries(
      concerts.venues
        .filter((venue) => venue.ensembles.length)
        .map((venue) => [venue.id, venue.ensembles]),
    ),
  };
}
/** Row count and a hash of the concert keys, in timeline order. */
export function detailsVersion({ keys }: Pick<ConcertDetails, "keys">) {
  let hash = 2166136261;
  for (const key of keys)
    for (let i = 0; i < key.length; i++)
      hash = Math.imul(hash ^ key.charCodeAt(i), 16777619);
  return `${keys.length}-${(hash >>> 0).toString(36)}`;
}
export function concertDetails(concerts: ConcertIndex): ConcertDetails {
  const others: ConcertDetails["others"] = {};
  concerts.timeline.forEach((concert, i) => {
    if (concert.others) others[i] = concert.others;
  });
  return {
    keys: concerts.timeline.map((concert) => concert.key),
    titles: concerts.timeline.map((concert) => concert.title ?? 0),
    others,
  };
}
