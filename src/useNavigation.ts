import { useCallback, useEffect, useRef, useState } from "react";

export type NavEntry =
  | { kind: "musician"; id: number }
  | { kind: "ensemble"; id: string }
  // Two musicians: their shared concerts, or the path between them.
  | { kind: "pair"; id: number; other: number }
  | null;

export const sameEntry = (a: NavEntry, b: NavEntry) =>
  a === b ||
  (!!a &&
    !!b &&
    a.kind === b.kind &&
    a.id === b.id &&
    (a.kind !== "pair" || a.other === (b as typeof a).other));

/** A step behind the current one; `depth` steps back reaches it. */
export interface TrailStep {
  entry: NonNullable<NavEntry>;
  depth: number;
  index: number;
}

interface HistoryState {
  nav: number;
  entry: NavEntry;
  // How far forward the trail went when this entry was last shown.
  length?: number;
  // The entries just before this one, so a reload keeps the trail.
  trail?: (NavEntry | undefined)[];
}
const TRAIL_SAVED = 24;
const readState = (value: unknown): HistoryState | null =>
  value &&
  typeof value === "object" &&
  typeof (value as HistoryState).nav === "number"
    ? (value as HistoryState)
    : null;
// Fills the slots this tab has not seen yet from a saved trail.
function restore(
  entries: (NavEntry | undefined)[],
  { nav, entry, trail = [] }: HistoryState,
) {
  trail.forEach((step, i) => {
    const index = nav - trail.length + i;
    if (index >= 0 && entries[index] === undefined) entries[index] = step;
  });
  entries[nav] = entry;
}
const savedTrail = (entries: (NavEntry | undefined)[], index: number) =>
  entries.slice(Math.max(0, index - TRAIL_SAVED), index);

// Every selection is a browser history entry, so the panel's back and forward
// buttons, the trail, the browser buttons and swipe gestures walk the same
// path. Each entry also keeps the panel's scroll and open lists, so returning
// to it looks the way it was left.
export function useNavigation(initial: NavEntry) {
  const [state, setState] = useState(() => {
    const saved = readState(window.history.state);
    const index = saved?.nav ?? 0;
    const entries: (NavEntry | undefined)[] = [];
    if (saved) restore(entries, saved);
    entries[index] = initial;
    return {
      entries,
      index,
      length: Math.max(index + 1, saved?.length ?? 0),
    };
  });
  const current = useRef(state);
  current.current = state;
  const memory = useRef(new Map<number, Map<string, unknown>>());
  useEffect(() => {
    const { entries, index, length } = current.current;
    window.history.replaceState(
      {
        nav: index,
        entry: initial,
        length,
        trail: savedTrail(entries, index),
      } satisfies HistoryState,
      "",
    );
    const pop = (event: PopStateEvent) => {
      const next = readState(event.state);
      if (!next) return;
      const s = current.current;
      const entries = [...s.entries];
      restore(entries, next);
      const length = Math.max(s.length, next.nav + 1);
      window.history.replaceState({ ...next, length }, "");
      const updated = { entries, index: next.nav, length };
      current.current = updated;
      setState(updated);
    };
    window.addEventListener("popstate", pop);
    return () => window.removeEventListener("popstate", pop);
    // The initial entry only seeds the first history record.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const navigate = useCallback((entry: NavEntry) => {
    const s = current.current;
    if (sameEntry(s.entries[s.index] ?? null, entry)) return;
    const index = s.index + 1;
    const entries = s.entries.slice(0, index);
    entries[index] = entry;
    window.history.pushState(
      {
        nav: index,
        entry,
        length: index + 1,
        trail: savedTrail(entries, index),
      } satisfies HistoryState,
      "",
      window.location.href,
    );
    // The forward entries are gone, and so is what they remembered.
    for (const key of memory.current.keys())
      if (key >= index) memory.current.delete(key);
    const next = { entries, index, length: index + 1 };
    current.current = next;
    setState(next);
  }, []);
  const back = useCallback(() => window.history.back(), []);
  const forward = useCallback(() => window.history.forward(), []);
  const go = useCallback((delta: number) => window.history.go(delta), []);
  // The open panel's ancestry: every known step back until the panel closed.
  const trail: TrailStep[] = [];
  for (let i = state.index - 1; i >= 0; i--) {
    const entry = state.entries[i];
    if (!entry) break;
    trail.unshift({ entry, depth: state.index - i, index: i });
  }
  let remembered = memory.current.get(state.index);
  if (!remembered) memory.current.set(state.index, (remembered = new Map()));
  return {
    entry: state.entries[state.index] ?? null,
    index: state.index,
    previous: state.index > 0 ? state.entries[state.index - 1] : null,
    next:
      state.index < state.length - 1 ? state.entries[state.index + 1] : null,
    canGoBack: state.index > 0,
    canGoForward: state.index < state.length - 1,
    trail,
    memory: remembered,
    navigate,
    back,
    forward,
    go,
  };
}
