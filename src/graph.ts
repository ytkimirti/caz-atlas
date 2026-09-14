import type { Atlas, Edge, Musician } from "./types";

// A mutual top-k graph bounds each person's visible degree, even for hubs.
// The full graph is retained separately for hover and shortest paths.
export function strongestEdges(edges: Edge[], limit: number): Edge[] {
  if (limit <= 0) return [];
  const ranked = [...edges].sort(
    (a, b) => b.weight - a.weight || a.source - b.source || a.target - b.target,
  );
  const choices = new Map<number, Set<string>>();
  for (const edge of ranked) {
    const key = edgeKey(edge.source, edge.target);
    for (const id of [edge.source, edge.target]) {
      const set = choices.get(id) || new Set<string>();
      if (set.size < limit) set.add(key);
      choices.set(id, set);
    }
  }
  return ranked.filter((edge) => {
    const key = edgeKey(edge.source, edge.target);
    return (
      choices.get(edge.source)?.has(key) && choices.get(edge.target)?.has(key)
    );
  });
}

export function filterGraph(
  data: Pick<Atlas, "nodes" | "edges">,
  counts: Record<string, number>,
  minConcerts: number | null,
  instrument: string,
  venueMembers?: Record<string, number>,
) {
  const nodes: Musician[] = data.nodes.filter(
    (node) =>
      (!instrument || node.group === instrument) &&
      (minConcerts === null || (counts[node.id] ?? 0) > minConcerts) &&
      (!venueMembers || (venueMembers[node.id] ?? 0) > 0),
  );
  const ids = new Set(nodes.map((node) => node.id));
  return {
    nodes,
    edges: data.edges.filter(
      (edge) => ids.has(edge.source) && ids.has(edge.target),
    ),
  };
}
export function adjacency(data: Pick<Atlas, "nodes" | "edges">) {
  const map = new Map<number, { id: number; weight: number }[]>(
    data.nodes.map((n) => [n.id, []]),
  );
  for (const edge of data.edges) {
    map.get(edge.source)?.push({ id: edge.target, weight: edge.weight });
    map.get(edge.target)?.push({ id: edge.source, weight: edge.weight });
  }
  for (const items of map.values()) items.sort((a, b) => b.weight - a.weight);
  return map;
}
export function shortestPath(
  map: ReturnType<typeof adjacency>,
  start: number,
  end: number,
): number[] {
  if (!map.has(start) || !map.has(end)) return [];
  const previous = new Map<number, number | null>([[start, null]]);
  const queue = [start];
  for (let i = 0; i < queue.length; i++) {
    const id = queue[i];
    if (id === end) {
      const path: number[] = [];
      let current: number | null = end;
      while (current !== null) {
        path.push(current);
        current = previous.get(current)!;
      }
      return path.reverse();
    }
    for (const next of map.get(id) || [])
      if (!previous.has(next.id)) {
        previous.set(next.id, id);
        queue.push(next.id);
      }
  }
  return [];
}
export function edgeKey(source: number, target: number) {
  return source < target ? `${source}:${target}` : `${target}:${source}`;
}
export function pathEdges(path: number[]) {
  return new Set(path.slice(1).map((id, i) => edgeKey(path[i], id)));
}
export function mergeEdge(map: Map<string, Edge>, edge: Edge) {
  if (edge.source === edge.target) return;
  const key = edgeKey(edge.source, edge.target),
    current = map.get(key);
  if (!current || current.weight < edge.weight)
    map.set(key, {
      source: Math.min(edge.source, edge.target),
      target: Math.max(edge.source, edge.target),
      weight: edge.weight,
    });
}
