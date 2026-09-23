import { useCallback, useEffect, useRef, useState } from "react";

export type NavEntry =
  { kind: "musician"; id: number } | { kind: "ensemble"; id: string } | null;

export const sameEntry = (a: NavEntry, b: NavEntry) =>
  a === b || (!!a && !!b && a.kind === b.kind && a.id === b.id);

interface HistoryState {
  nav: number;
  entry: NavEntry;
}
const readState = (value: unknown): HistoryState | null =>
  value &&
  typeof value === "object" &&
  typeof (value as HistoryState).nav === "number"
    ? (value as HistoryState)
    : null;

// Every selection is a browser history entry, so the panel's back and forward
// buttons, the browser buttons and swipe gestures walk the same trail. Entries
// remember their position; after a reload the older ones are known by index
// only and resolve when visited.
export function useNavigation(initial: NavEntry) {
  const [state, setState] = useState(() => {
    const index = readState(window.history.state)?.nav ?? 0;
    const entries: (NavEntry | undefined)[] = [];
    entries[index] = initial;
    return { entries, index, length: index + 1 };
  });
  const current = useRef(state);
  current.current = state;
  useEffect(() => {
    window.history.replaceState(
      { nav: current.current.index, entry: initial } satisfies HistoryState,
      "",
    );
    const pop = (event: PopStateEvent) => {
      const next = readState(event.state);
      if (!next) return;
      setState((s) => {
        const entries = [...s.entries];
        entries[next.nav] = next.entry;
        return {
          entries,
          index: next.nav,
          length: Math.max(s.length, next.nav + 1),
        };
      });
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
    window.history.pushState(
      { nav: index, entry } satisfies HistoryState,
      "",
      window.location.href,
    );
    const entries = s.entries.slice(0, index);
    entries[index] = entry;
    const next = { entries, index, length: index + 1 };
    current.current = next;
    setState(next);
  }, []);
  const back = useCallback(() => window.history.back(), []);
  const forward = useCallback(() => window.history.forward(), []);
  return {
    entry: state.entries[state.index] ?? null,
    previous: state.index > 0 ? state.entries[state.index - 1] : null,
    next:
      state.index < state.length - 1 ? state.entries[state.index + 1] : null,
    canGoBack: state.index > 0,
    canGoForward: state.index < state.length - 1,
    navigate,
    back,
    forward,
  };
}
