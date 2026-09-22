import { normalize } from "./types";
import type { Ensemble, GraphMusician } from "./types";

export type SearchKind = "all" | "musician" | "ensemble";
export type SearchResult =
  | { kind: "musician"; id: string; name: string; musician: GraphMusician }
  | { kind: "ensemble"; id: string; name: string; ensemble: Ensemble };

export function searchAtlas(
  nodes: GraphMusician[],
  ensembles: Ensemble[],
  query: string,
  kind: SearchKind,
): SearchResult[] {
  const term = normalize(query.trim());
  const score = (name: string) => {
    const text = normalize(name);
    return text === term ? 0 : text.startsWith(term) ? 1 : 2;
  };
  const musicians: SearchResult[] =
    kind === "ensemble"
      ? []
      : nodes
          .filter((node) =>
            normalize(`${node.name} ${node.key}`).includes(term),
          )
          .map((musician) => ({
            kind: "musician",
            id: `musician-${musician.id}`,
            name: musician.name,
            musician,
          }));
  const bands: SearchResult[] =
    kind === "musician"
      ? []
      : [...ensembles]
          .filter((ensemble) => normalize(ensemble.name).includes(term))
          .sort((a, b) => b.concerts - a.concerts)
          .map((ensemble) => ({
            kind: "ensemble",
            id: `ensemble-${ensemble.id}`,
            name: ensemble.name,
            ensemble,
          }));
  musicians.sort((a, b) => score(a.name) - score(b.name));
  bands.sort((a, b) => score(a.name) - score(b.name));
  // Reserve room for each kind so popular musicians cannot bury matching groups.
  const musicianSlots = Math.min(
    musicians.length,
    Math.max(4, 8 - bands.length),
  );
  const results =
    kind === "all" && musicians.length && bands.length
      ? [
          ...musicians.slice(0, musicianSlots),
          ...bands.slice(0, 8 - musicianSlots),
        ]
      : [...musicians, ...bands].slice(0, 8);
  return results.sort((a, b) => score(a.name) - score(b.name));
}
