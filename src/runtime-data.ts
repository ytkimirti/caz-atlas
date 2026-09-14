import type {
  Atlas,
  ConcertIndex,
  Edge,
  Ensemble,
  GraphMusician,
  Venue,
} from "./types";

export type RuntimeConcerts = Omit<ConcertIndex, "ensembles" | "venues"> & {
  venues: Omit<Venue, "ensembles">[];
};
export interface RuntimeData {
  nodes: GraphMusician[];
  concerts: RuntimeConcerts;
}
export interface ProjectData {
  ensembles: Ensemble[];
  venues: Record<string, Ensemble[]>;
}
type PackedEdge = [source: number, target: number, weight: number];
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
  ensemble?: string,
];
export interface PackedRuntime {
  version: 1;
  nodes: PackedNode[];
  concerts: Omit<RuntimeConcerts, "edges" | "venues" | "timeline"> & {
    edges: PackedEdge[];
    venues: (Omit<RuntimeConcerts["venues"][number], "edges"> & {
      edges: PackedEdge[];
    })[];
    timeline: PackedConcert[];
  };
}
const packEdges = (edges: Edge[]): PackedEdge[] =>
  edges.map(({ source, target, weight }) => [source, target, weight]);
const unpackEdges = (edges: PackedEdge[]): Edge[] =>
  edges.map(([source, target, weight]) => ({ source, target, weight }));

// Archive-only profile fields and legacy graph edges never enter the browser.
// Tuple encoding avoids repeating property names across hundreds of thousands of rows.
export function packRuntime(
  atlas: Atlas,
  concerts: ConcertIndex,
): PackedRuntime {
  return {
    version: 1,
    nodes: atlas.nodes.map(({ id, key, name, group, degree, x, y }) => [
      id,
      key,
      name,
      group,
      degree,
      x,
      y,
    ]),
    concerts: {
      meta: concerts.meta,
      counts: concerts.counts,
      edges: packEdges(concerts.edges),
      venues: concerts.venues.map(
        ({ ensembles: _ensembles, edges, ...venue }) => ({
          ...venue,
          edges: packEdges(edges),
        }),
      ),
      timeline: concerts.timeline.map(({ date, venue, musicians, ensemble }) =>
        ensemble
          ? [date, venue, musicians, ensemble]
          : [date, venue, musicians],
      ),
    },
  };
}
export function unpackRuntime(data: PackedRuntime): RuntimeData {
  if (data.version !== 1) throw new Error("Unsupported runtime data version");
  return {
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
      edges: unpackEdges(data.concerts.edges),
      venues: data.concerts.venues.map(({ edges, ...venue }) => ({
        ...venue,
        edges: unpackEdges(edges),
      })),
      timeline: data.concerts.timeline.map(
        ([date, venue, musicians, ensemble]) => ({
          date,
          venue,
          musicians,
          ...(ensemble ? { ensemble } : {}),
        }),
      ),
    },
  };
}
export function projectData(concerts: ConcertIndex): ProjectData {
  return {
    ensembles: concerts.ensembles,
    venues: Object.fromEntries(
      concerts.venues.map((venue) => [venue.id, venue.ensembles]),
    ),
  };
}
