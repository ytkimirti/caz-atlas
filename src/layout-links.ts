import type { Edge } from "./types";
import type { LayoutNode } from "./layout";

// Retain each person's strongest ties and a maximum spanning forest. Weak
// bridges still connect communities, without thousands of springs into hubs.
export function layoutLinks(nodes: LayoutNode[], edges: Edge[]): Edge[] {
  const parent = new Map(nodes.map((n) => [n.id, n.id]));
  const root = (id: number): number => {
    let current = id;
    while (parent.get(current) !== current) current = parent.get(current)!;
    while (id !== current) {
      const next = parent.get(id)!;
      parent.set(id, current);
      id = next;
    }
    return current;
  };
  const degree = new Map<number, number>();
  return [...edges]
    .filter(
      (e) =>
        e.source !== e.target && parent.has(e.source) && parent.has(e.target),
    )
    .sort(
      (a, b) =>
        b.weight - a.weight || a.source - b.source || a.target - b.target,
    )
    .filter((e) => {
      const a = degree.get(e.source) ?? 0,
        b = degree.get(e.target) ?? 0;
      degree.set(e.source, a + 1);
      degree.set(e.target, b + 1);
      const ra = root(e.source),
        rb = root(e.target);
      if (ra !== rb) parent.set(ra, rb);
      return a < 3 || b < 3 || ra !== rb;
    })
    .map((e) => ({ ...e }));
}
