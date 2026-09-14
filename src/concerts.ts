import type { ConcertIndex, Edge, Musician, Venue } from "./types";
import { normalize } from "./types";
import { edgeKey } from "./graph";

export interface Concert {
  key: string;
  date: string;
  venue: string;
  venueName: string;
  city: string;
  musicians: string[];
}

export function indexConcerts(
  nodes: Musician[],
  concerts: Concert[],
  through: string,
) {
  const names = new Map<string, number[]>();
  for (const node of nodes) {
    const name = normalize(node.name.trim()).replace(/\s+/g, " ");
    names.set(name, [...(names.get(name) || []), node.id]);
  }
  const counts: Record<string, number> = {};
  const edges = new Map<string, Edge>();
  const venues = new Map<string, Venue & { pairs: Map<string, Edge> }>();
  const visited = new Set<string>();
  const unmatched = new Set<string>();
  function increment(map: Map<string, Edge>, source: number, target: number) {
    const key = edgeKey(source, target);
    const current = map.get(key);
    if (current) current.weight++;
    else
      map.set(key, {
        source: Math.min(source, target),
        target: Math.max(source, target),
        weight: 1,
      });
  }
  for (const concert of concerts) {
    // Today's scheduled concerts have not necessarily happened yet.
    if (concert.date >= through || visited.has(concert.key)) continue;
    visited.add(concert.key);
    const ids = new Set<number>();
    for (const name of concert.musicians) {
      const matches = names.get(normalize(name.trim()).replace(/\s+/g, " "));
      if (matches?.length === 1) ids.add(matches[0]);
      else unmatched.add(name);
    }
    let venue = venues.get(concert.venue);
    if (!venue) {
      venue = {
        id: concert.venue,
        name: concert.venueName || concert.venue,
        city: concert.city,
        concerts: 0,
        musicians: {},
        edges: [],
        pairs: new Map(),
      };
      venues.set(concert.venue, venue);
    }
    venue.concerts++;
    for (const id of ids) {
      counts[id] = (counts[id] || 0) + 1;
      venue.musicians[id] = (venue.musicians[id] || 0) + 1;
    }
    const members = [...ids];
    for (let i = 0; i < members.length; i++)
      for (let j = i + 1; j < members.length; j++) {
        increment(edges, members[i], members[j]);
        increment(venue.pairs, members[i], members[j]);
      }
  }
  return {
    counts,
    edges: [...edges.values()],
    venues: [...venues.values()]
      .map(({ pairs, ...venue }) => ({ ...venue, edges: [...pairs.values()] }))
      .filter((venue) => Object.keys(venue.musicians).length)
      .sort((a, b) => b.concerts - a.concerts),
    stats: {
      concerts: visited.size,
      matchedMusicians: Object.keys(counts).length,
      unmatchedNames: unmatched.size,
    },
  } satisfies Pick<ConcertIndex, "counts" | "edges" | "venues"> & {
    stats: Pick<
      ConcertIndex["meta"],
      "concerts" | "matchedMusicians" | "unmatchedNames"
    >;
  };
}
