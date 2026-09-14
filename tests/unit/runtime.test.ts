import { expect, test } from "bun:test";
import { gzipSync } from "node:zlib";
import {
  packRuntime,
  projectData,
  unpackRuntime,
} from "../../src/runtime-data";
import type { Atlas, ConcertIndex } from "../../src/types";

test("browser assets preserve every runtime field, concert, venue and project", async () => {
  const atlas: Atlas = await Bun.file(
    new URL("../../public/data/atlas.json", import.meta.url),
  ).json();
  const concerts: ConcertIndex = await Bun.file(
    new URL("../../public/data/concerts.json", import.meta.url),
  ).json();
  const packed = packRuntime(atlas, concerts);
  const runtime = unpackRuntime(JSON.parse(JSON.stringify(packed)));
  const projects = projectData(concerts);
  expect(runtime.nodes).toEqual(
    atlas.nodes.map(({ id, key, name, group, degree, x, y }) => ({
      id,
      key,
      name,
      group,
      degree,
      x,
      y,
    })),
  );
  expect({
    ...runtime.concerts,
    ensembles: projects.ensembles,
    venues: runtime.concerts.venues.map((venue) => ({
      ...venue,
      ensembles: projects.venues[venue.id],
    })),
  }).toEqual(concerts);
  const original = JSON.stringify(atlas) + JSON.stringify(concerts);
  const initial = JSON.stringify(packed);
  // Prevent accidentally returning archive fields or optional projects to startup.
  expect(Buffer.byteLength(initial)).toBeLessThan(
    Buffer.byteLength(original) * 0.35,
  );
  expect(gzipSync(initial).length).toBeLessThan(
    gzipSync(original).length * 0.65,
  );
  expect("edges" in packed).toBe(false);
  expect("ensembles" in packed.concerts).toBe(false);
});
