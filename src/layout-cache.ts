import type { LayoutRequest, Position } from "./layout";
import { defaultResolution } from "./layout-options";

// Bump when layout output changes so shipped precomputed positions are ignored.
export const LAYOUT_VERSION = 4;

// Cheap content signature of a layout request. Identical filters produce the
// same nodes and edges in the same order, so returning to a view is instant.
export function layoutKey(request: LayoutRequest) {
  let hash = 2166136261;
  const mix = (value: number) => {
    hash = Math.imul(hash ^ value, 16777619);
    hash = Math.imul(hash ^ (hash >>> 15), 2246822507);
  };
  for (const n of request.nodes) {
    mix(n.id);
    mix(n.count);
  }
  for (const e of request.edges) {
    mix(e.source);
    mix(e.target);
    mix(e.weight);
  }
  return [
    LAYOUT_VERSION,
    request.mode ?? "2d",
    request.spacing,
    request.resolution ?? defaultResolution,
    request.nodes.length,
    request.edges.length,
    (hash >>> 0).toString(36),
  ].join(":");
}

const cache = new Map<string, Position[]>();
const LIMIT = 8;
export function cachedLayout(key: string) {
  const positions = cache.get(key);
  if (positions) {
    cache.delete(key);
    cache.set(key, positions);
  }
  return positions;
}
export function cacheLayout(key: string, positions: Position[]) {
  cache.delete(key);
  cache.set(key, positions);
  while (cache.size > LIMIT) cache.delete(cache.keys().next().value!);
}
