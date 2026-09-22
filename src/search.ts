import { normalize } from "./types";
import type { Ensemble, GraphMusician } from "./types";

export type SearchKind = "all" | "musician" | "ensemble";
export type SearchResult =
  | { kind: "musician"; id: string; name: string; musician: GraphMusician }
  | { kind: "ensemble"; id: string; name: string; ensemble: Ensemble };

const normalizedLabels = new WeakMap<
  object,
  { name: string; key?: string; label: string; searchable: string }
>();

function searchText(item: { name: string; key?: string }) {
  const cached = normalizedLabels.get(item);
  if (cached?.name === item.name && cached.key === item.key) return cached;
  const label = normalize(item.name);
  const text = {
    name: item.name,
    key: item.key,
    label,
    searchable:
      item.key === undefined ? label : normalize(`${item.name} ${item.key}`),
  };
  // Weak keys release old datasets; compare fields so edited labels stay fresh.
  normalizedLabels.set(item, text);
  return text;
}

type ScoredResult<T extends SearchResult = SearchResult> = {
  result: T;
  score: number;
};
const byScore = (a: ScoredResult, b: ScoredResult) => a.score - b.score;

export function searchAtlas(
  nodes: GraphMusician[],
  ensembles: Ensemble[],
  query: string,
  kind: SearchKind,
): SearchResult[] {
  const term = normalize(query.trim());
  const score = (text: string) =>
    text === term ? 0 : text.startsWith(term) ? 1 : 2;
  const musicians: ScoredResult[] = [];
  const bands: ScoredResult<Extract<SearchResult, { kind: "ensemble" }>>[] = [];
  if (kind !== "ensemble") {
    for (const musician of nodes) {
      const text = searchText(musician);
      if (!text.searchable.includes(term)) continue;
      musicians.push({
        score: score(text.label),
        result: {
          kind: "musician",
          id: `musician-${musician.id}`,
          name: musician.name,
          musician,
        },
      });
    }
  }
  if (kind !== "musician") {
    for (const ensemble of ensembles) {
      const text = searchText(ensemble);
      if (!text.searchable.includes(term)) continue;
      bands.push({
        score: score(text.label),
        result: {
          kind: "ensemble",
          id: `ensemble-${ensemble.id}`,
          name: ensemble.name,
          ensemble,
        },
      });
    }
  }
  musicians.sort(byScore);
  bands.sort(
    (a, b) =>
      byScore(a, b) || b.result.ensemble.concerts - a.result.ensemble.concerts,
  );
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
  return results.sort(byScore).map(({ result }) => result);
}
