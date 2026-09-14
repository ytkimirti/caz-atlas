import type { Edge, Ensemble } from "./types";

export interface EnsembleCluster {
  ensemble: Ensemble;
  members: number[];
}

// A title is only a map hint when its small roster mostly plays together.
// Keep the full roster: filters must not turn a sprawling project into a trio.
export function ensembleClusters(
  ensembles: Ensemble[],
  edges: Edge[],
  visibleIds: Set<number>,
): EnsembleCluster[] {
  const neighbors = new Map<number, { id: number; weight: number }[]>();
  for (const edge of edges) {
    for (const [id, other] of [
      [edge.source, edge.target],
      [edge.target, edge.source],
    ]) {
      const ties = neighbors.get(id) ?? [];
      ties.push({ id: other, weight: edge.weight });
      neighbors.set(id, ties);
    }
  }
  return ensembles
    .map((ensemble) => ({
      ensemble,
      members: Object.keys(ensemble.musicians).map(Number),
    }))
    .filter(({ members }) => {
      if (members.length < 3 || members.length > 6) return false;
      if (!members.every((id) => visibleIds.has(id))) return false;
      const roster = new Set(members);
      let internalTies = 0;
      for (const id of members) {
        const ties = neighbors.get(id) ?? [];
        const internal = ties.filter((tie) => roster.has(tie.id));
        internalTies += internal.length;
        const totalWeight = ties.reduce((sum, tie) => sum + tie.weight, 0);
        const internalWeight = internal.reduce(
          (sum, tie) => sum + tie.weight,
          0,
        );
        if (!totalWeight || internalWeight / totalWeight < 0.6) return false;
      }
      return internalTies / (members.length * (members.length - 1)) >= 0.8;
    })
    .sort(
      (a, b) =>
        b.ensemble.concerts - a.ensemble.concerts ||
        a.ensemble.id.localeCompare(b.ensemble.id),
    );
}

export function clusterBounds(
  members: number[],
  point: (id: number) => { x: number; y: number },
  width: number,
  height: number,
) {
  const points = members.map(point);
  if (
    points.some(
      (p) => p.x < 20 || p.x > width - 20 || p.y < 90 || p.y > height - 75,
    )
  )
    return null;
  const left = Math.min(...points.map((p) => p.x));
  const right = Math.max(...points.map((p) => p.x));
  const top = Math.min(...points.map((p) => p.y));
  const bottom = Math.max(...points.map((p) => p.y));
  const span = Math.max(right - left, bottom - top);
  // The hint belongs to a discernible local shape, never a distant centroid.
  if (span < 16 || span > 160) return null;
  return { left, right, top, bottom };
}
