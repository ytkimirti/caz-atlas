import { expect, test } from "bun:test";
import { computeCommunityLayout } from "../../src/community-layout";
import { groupingOptions, parseResolution } from "../../src/layout-options";
import type { LayoutNode } from "../../src/layout";
import type { Edge } from "../../src/types";

function chain(sizes: number[], offset = 0) {
  const nodes: LayoutNode[] = [],
    edges: Edge[] = [],
    groups: number[][] = [];
  for (const size of sizes) {
    const ids = Array.from(
      { length: size },
      (_, i) => offset + nodes.length + i,
    );
    groups.push(ids);
    for (const id of ids) nodes.push({ id, count: 30 });
    for (let i = 0; i < ids.length; i++)
      for (const target of ids.slice(i + 1))
        edges.push({ source: ids[i], target, weight: 30 });
  }
  for (let i = 1; i < groups.length; i++)
    edges.push({ source: groups[i - 1][0], target: groups[i][0], weight: 1 });
  return { nodes, edges, groups };
}
const fixture = chain([7, 9, 11, 8]);
const request = { ...fixture, engine: "communities" as const, spacing: 1 };

test("unequal planted communities stay distinct and adjacent groups are closer", () => {
  const result = computeCommunityLayout(request);
  expect(result.communities.length).toBe(4);
  const groups = fixture.groups.map((ids) =>
    result.communities.find((g) => g.members.includes(ids[0]))!,
  );
  for (let i = 0; i < groups.length; i++)
    expect([...groups[i].members].sort((a, b) => a - b)).toEqual(
      fixture.groups[i],
    );
  const distance = (a: number, b: number) =>
    Math.hypot(groups[a].x - groups[b].x, groups[a].y - groups[b].y);
  const adjacent = (distance(0, 1) + distance(1, 2) + distance(2, 3)) / 3;
  const distant = (distance(0, 2) + distance(0, 3) + distance(1, 3)) / 3;
  expect(adjacent).toBeLessThan(distant);
  for (let i = 0; i < groups.length; i++)
    for (const b of groups.slice(i + 1)) {
      const a = groups[i];
      expect(Math.hypot(a.x - b.x, a.y - b.y)).toBeGreaterThanOrEqual(
        a.r + b.r - 0.001,
      );
    }
});

test("disconnected networks preserve their internal arrangement when packed", () => {
  const second = chain([8, 6], 1000);
  const alone = computeCommunityLayout(request);
  const together = computeCommunityLayout({
    ...request,
    nodes: [...fixture.nodes, ...second.nodes],
    edges: [...fixture.edges, ...second.edges],
  });
  const before = new Map(alone.positions.map((p) => [p.id, p]));
  const after = new Map(together.positions.map((p) => [p.id, p]));
  // This planted fixture retains its membership when the second network is
  // added, so packing may translate it but must not distort its geometry.
  for (const group of alone.communities) {
    expect(
      together.communities.find((g) => g.id === group.id)!.members,
    ).toEqual(group.members);
  }
  for (let i = 0; i < fixture.nodes.length; i++)
    for (const b of fixture.nodes.slice(i + 1)) {
      const a = fixture.nodes[i];
      const p = before.get(a.id)!,
        q = before.get(b.id)!;
      const movedP = after.get(a.id)!,
        movedQ = after.get(b.id)!;
      expect(Math.hypot(movedP.x - movedQ.x, movedP.y - movedQ.y)).toBeCloseTo(
        Math.hypot(p.x - q.x, p.y - q.y),
        6,
      );
    }
  for (const p of together.positions)
    expect(Number.isFinite(p.x) && Number.isFinite(p.y)).toBe(true);
  expect(before.size).toBe(fixture.nodes.length);
  expect(after.size).toBe(fixture.nodes.length + second.nodes.length);
  for (let i = 0; i < together.communities.length; i++)
    for (const b of together.communities.slice(i + 1)) {
      const a = together.communities[i];
      expect(Math.hypot(a.x - b.x, a.y - b.y)).toBeGreaterThanOrEqual(
        a.r + b.r - 0.001,
      );
    }
});

test("dominant group and many isolates retain every node without overlap", () => {
  const fixture = chain([40]);
  fixture.nodes.push(
    ...Array.from({ length: 120 }, (_, i) => ({ id: 1000 + i, count: 0 })),
  );
  const result = computeCommunityLayout({
    ...fixture,
    engine: "communities",
    spacing: 1,
  });
  expect(new Set(result.positions.map((p) => p.id)).size).toBe(160);
  for (let i = 0; i < result.positions.length; i++)
    for (const b of result.positions.slice(i + 1)) {
      const a = result.positions[i];
      expect(Math.hypot(a.x - b.x, a.y - b.y)).toBeGreaterThan(15);
    }
});

for (const option of groupingOptions)
  test(`resolution ${option.value} is repeatable and does not change graph data`, () => {
    const input = { ...request, resolution: option.value };
    const original = structuredClone(input);
    const result = computeCommunityLayout(input);
    expect(input).toEqual(original);
    expect(computeCommunityLayout(input)).toEqual(result);
    expect(
      computeCommunityLayout({
        ...input,
        nodes: [...input.nodes].reverse(),
        edges: [...input.edges].reverse(),
      }),
    ).toEqual(result);
    const byId = new Map(result.positions.map((p) => [p.id, p]));
    for (const group of result.communities) {
      const members = new Set(group.members);
      const reached = new Set([group.members[0]]);
      for (const id of reached)
        for (const e of input.edges) {
          const next =
            e.source === id ? e.target : e.target === id ? e.source : null;
          if (next !== null && members.has(next)) reached.add(next);
        }
      expect(reached.size).toBe(members.size);
      for (const id of members) {
        const p = byId.get(id)!;
        expect(Math.hypot(p.x - group.x, p.y - group.y)).toBeLessThan(group.r);
      }
    }
  });

test("group detail accepts only supported URL values", () => {
  for (const value of [null, "", "NaN", "-1", "Infinity", "99"])
    expect(parseResolution(value)).toBe(1.5);
  expect(parseResolution("0.8")).toBe(0.8);
  expect(parseResolution("3")).toBe(3);
});
