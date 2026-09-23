import type {
  Atlas,
  ConcertIndex,
  Edge,
  Ensemble,
  GraphMusician,
  Venue,
} from "./types";
import { filterGraph } from "./graph";
import type { LayoutRequest, Position } from "./layout";
import { cacheLayout, layoutKey } from "./layout-cache";

export type RuntimeConcerts = Omit<ConcertIndex, "ensembles" | "venues"> & {
  venues: Omit<Venue, "ensembles">[];
};
export interface RuntimeData {
  nodes: GraphMusician[];
  concerts: RuntimeConcerts;
  /** Layout key of the default view, whose positions are the node x / y. */
  layout?: string;
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
  layout?: string;
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
  // Precomputed default view; see defaultLayoutRequest.
  layout?: { key: string; positions: Position[] },
): PackedRuntime {
  const positions = layout && new Map(layout.positions.map((p) => [p.id, p]));
  const round = (value: number) => Math.round(value * 10) / 10;
  return {
    version: 1,
    ...(layout ? { layout: layout.key } : {}),
    nodes: atlas.nodes.map(({ id, key, name, group, degree, x, y }) => {
      const p = positions?.get(id);
      return [
        id,
        key,
        name,
        group,
        degree,
        p ? round(p.x) : x,
        p ? round(p.y) : y,
      ];
    }),
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
// Mirrors the app's initial view: all dates, no filters, default layout.
export function defaultLayoutRequest(
  nodes: GraphMusician[],
  concerts: Pick<ConcertIndex, "counts" | "edges">,
): LayoutRequest {
  const graph = filterGraph(
    { nodes, edges: concerts.edges },
    concerts.counts,
    null,
    concerts.counts,
  );
  return {
    nodes: graph.nodes.map((n) => ({
      id: n.id,
      count: concerts.counts[n.id] || 0,
    })),
    edges: graph.edges,
    mode: "2d",
    spacing: 1,
    resolution: 1.5,
  };
}
// Shipped positions make the first view ready without a layout worker.
export function seedDefaultLayout(data: RuntimeData) {
  if (!data.layout) return;
  const request = defaultLayoutRequest(data.nodes, data.concerts);
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
  if (data.version !== 1) throw new Error("Unsupported runtime data version");
  return {
    layout: data.layout,
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
