import type {
  ArchivedConcert,
  ConcertIndex,
  Edge,
  Ensemble,
  Musician,
  Venue,
} from "./types";
import { normalize } from "./types";
import { edgeKey } from "./graph";

export interface Concert {
  key: string;
  title?: string;
  date: string;
  venue: string;
  venueName: string;
  city: string;
  musicians: string[];
}

// Open sessions credit the house band; the title names the event, not a group.
export const isJam = (title: string) =>
  /jam\s*session|açık\s*sahne|acik\s*sahne|open\s*mic/i.test(title);

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
  const timeline: ArchivedConcert[] = [];
  const ensembles = new Map<string, Ensemble>();
  const venueEnsembles = new Map<string, Map<string, Ensemble>>();
  function recordEnsemble(
    map: Map<string, Ensemble>,
    title: string,
    ids: Set<number>,
  ) {
    const id = normalize(title).replace(/\s+/g, " ");
    const ensemble = map.get(id) ?? {
      id,
      name: title,
      concerts: 0,
      musicians: {},
    };
    ensemble.concerts++;
    for (const member of ids)
      ensemble.musicians[member] = (ensemble.musicians[member] ?? 0) + 1;
    map.set(id, ensemble);
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
    const others: string[] = [];
    for (const name of concert.musicians) {
      const matches = names.get(normalize(name.trim()).replace(/\s+/g, " "));
      if (matches?.length === 1) ids.add(matches[0]);
      else {
        unmatched.add(name);
        if (!others.includes(name.trim())) others.push(name.trim());
      }
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
        ensembles: [],
        pairs: new Map(),
      };
      venues.set(concert.venue, venue);
    }
    let ensembleId: string | undefined;
    const title = concert.title?.trim().replace(/\s+/g, " ");
    const jam = !!title && isJam(title);
    // Concert titles identify ensembles/projects, not permanent memberships.
    // Solo artist bills and generic open sessions do not create group labels.
    if (title && ids.size >= 2 && !names.has(normalize(title)) && !jam) {
      ensembleId = normalize(title).replace(/\s+/g, " ");
      recordEnsemble(ensembles, title, ids);
      const local =
        venueEnsembles.get(concert.venue) ?? new Map<string, Ensemble>();
      recordEnsemble(local, title, ids);
      venueEnsembles.set(concert.venue, local);
    }
    venue.concerts++;
    for (const id of ids) {
      counts[id] = (counts[id] || 0) + 1;
      venue.musicians[id] = (venue.musicians[id] || 0) + 1;
    }
    const members = [...ids];
    timeline.push({
      key: concert.key,
      ...(title ? { title } : {}),
      ...(ensembleId ? { ensemble: ensembleId } : {}),
      date: concert.date,
      venue: concert.venue,
      musicians: members,
      ...(others.length ? { others } : {}),
      ...(jam ? { jam: true as const } : {}),
    });
    for (let i = 0; i < members.length; i++)
      for (let j = i + 1; j < members.length; j++) {
        increment(edges, members[i], members[j]);
        increment(venue.pairs, members[i], members[j]);
      }
  }
  return {
    timeline: timeline.sort((a, b) => a.date.localeCompare(b.date)),
    ensembles: [...ensembles.values()].sort(
      (a, b) => b.concerts - a.concerts || a.id.localeCompare(b.id),
    ),
    counts,
    edges: [...edges.values()],
    venues: [...venues.values()]
      .map(({ pairs, ...venue }) => ({
        ...venue,
        edges: [...pairs.values()],
        ensembles: [...(venueEnsembles.get(venue.id)?.values() ?? [])],
      }))
      .sort((a, b) => b.concerts - a.concerts),
    stats: {
      concerts: visited.size,
      matchedMusicians: Object.keys(counts).length,
      unmatchedNames: unmatched.size,
    },
  } satisfies Pick<
    ConcertIndex,
    "counts" | "edges" | "venues" | "timeline" | "ensembles"
  > & {
    stats: Pick<
      ConcertIndex["meta"],
      "concerts" | "matchedMusicians" | "unmatchedNames"
    >;
  };
}
