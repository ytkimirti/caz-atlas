import { expect, test } from "bun:test";
import { gzipSync } from "node:zlib";
import { cachedLayout, layoutKey } from "../../src/layout-cache";
import {
  allTime,
  concertDetails,
  defaultLayoutRequest,
  detailsVersion,
  packRuntime,
  projectData,
  seedDefaultLayout,
  unpackRuntime,
} from "../../src/runtime-data";
import { groupId } from "../../src/types";
import type { Atlas, ConcertIndex } from "../../src/types";

const read = async () => ({
  atlas: (await Bun.file(
    new URL("../../public/data/atlas.json", import.meta.url),
  ).json()) as Atlas,
  concerts: (await Bun.file(
    new URL("../../public/data/concerts.json", import.meta.url),
  ).json()) as ConcertIndex,
});

test("browser assets preserve every node, concert, venue and project", async () => {
  const { atlas, concerts } = await read();
  const packed = packRuntime(atlas, concerts);
  const runtime = unpackRuntime(JSON.parse(JSON.stringify(packed)));
  const projects = projectData(concerts);
  const details = concertDetails(concerts);
  expect(runtime.nodes).toEqual(
    atlas.nodes.map(({ id, key, name, group, degree, x, y }) => ({
      id,
      key,
      name,
      group: groupId(group),
      degree,
      x,
      y,
    })),
  );
  expect(runtime.concerts.meta).toEqual(concerts.meta);
  expect(runtime.concerts.venues).toEqual(
    concerts.venues.map(({ id, name, city, concerts }) => ({
      id,
      name,
      city,
      concerts,
    })),
  );
  // The timeline plus lazy details reproduce every archived concert.
  expect(
    runtime.concerts.timeline.map((concert, i) => ({
      key: details.keys[i],
      ...(details.titles[i] ? { title: details.titles[i] } : {}),
      ...concert,
      ...(details.others[i] ? { others: details.others[i] } : {}),
    })),
  ).toEqual(concerts.timeline);
  // Archive totals are derived in the browser, identical to the index.
  const totals = allTime(runtime.concerts.timeline);
  expect(totals.counts).toEqual(concerts.counts);
  const byPair = (a: { source: number; target: number }, b: typeof a) =>
    a.source - b.source || a.target - b.target;
  expect(
    totals.edges
      .map(({ source, target, weight }) => ({ source, target, weight }))
      .sort(byPair),
  ).toEqual([...concerts.edges].sort(byPair));
  for (const venue of concerts.venues)
    expect(projects.venues[venue.id] ?? []).toEqual(venue.ensembles);
  expect(projects.ensembles).toEqual(concerts.ensembles);
  const original = JSON.stringify(atlas) + JSON.stringify(concerts);
  const initial = JSON.stringify(packed);
  // Prevent accidentally returning archive fields or optional data to startup.
  expect(Buffer.byteLength(initial)).toBeLessThan(
    Buffer.byteLength(original) * 0.15,
  );
  expect(gzipSync(initial).length).toBeLessThan(
    gzipSync(original).length * 0.4,
  );
  expect(runtime.details).toBe(detailsVersion(details));
  expect("edges" in packed.concerts).toBe(false);
  expect("ensembles" in packed.concerts).toBe(false);
});

test("the shipped default layout matches the app's initial view", async () => {
  const { atlas, concerts } = await read();
  const request = defaultLayoutRequest(atlas.nodes, allTime(concerts.timeline));
  const key = layoutKey(request);
  const positions = request.nodes.map((n, i) => ({ id: n.id, x: i, y: 1 - i }));
  const runtime = unpackRuntime(
    JSON.parse(
      JSON.stringify(packRuntime(atlas, concerts, { key, positions })),
    ),
  );
  expect(request.nodes.every((n) => n.count > 0)).toBe(true);
  expect(runtime.layout).toBe(key);
  // The browser rebuilds the same request from unpacked runtime data.
  const totals = allTime(runtime.concerts.timeline);
  expect(layoutKey(defaultLayoutRequest(runtime.nodes, totals))).toBe(key);
  seedDefaultLayout(runtime, totals);
  expect(cachedLayout(key)).toEqual(positions);
});
