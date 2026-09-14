/** Public, read-only snapshot. No network or mutations without --fetch. */
import { mkdir } from "node:fs/promises";
import { join } from "node:path";
if (!Bun.argv.includes("--fetch")) {
  console.log(
    "Usage: bun run scripts/collect.ts --fetch\nReads public Bizim Caz musician networks into a resumable local cache. No database access.",
  );
  process.exit(0);
}
const origin = "https://bizimcaz.com";
const cache = join(import.meta.dir, "../.cache");
await mkdir(join(cache, "networks"), { recursive: true });
const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));
async function get(path: string) {
  let lastError: unknown;
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      const response = await fetch(origin + path, {
        signal: AbortSignal.timeout(45000),
        headers: { "User-Agent": "CazAtlas/1.0 (public jazz network archive)" },
      });
      if (response.status === 429 || response.status >= 500) {
        await delay(
          Math.max(
            Number(response.headers.get("retry-after") || 0) * 1000,
            2500 * 2 ** attempt,
          ),
        );
        continue;
      }
      if (response.status === 404) return JSON.stringify({ unavailable: true });
      if (!response.ok) throw new Error(`${response.status} ${path}`);
      return await response.text();
    } catch (error) {
      lastError = error;
      console.warn(`Connection retry ${attempt + 1}: ${path}`);
      await delay(2500 * 2 ** attempt);
    }
  }
  throw new Error(
    `Retries exhausted: ${path}; ${String(lastError || "HTTP error")}`,
  );
}
const directory = JSON.parse(await get("/api/musicians-list"));
await Bun.write(join(cache, "directory.json"), JSON.stringify(directory));
const sitemapIndex = await get("/pug5092/sitemap.xml");
const peopleMaps = [
  ...sitemapIndex.matchAll(/<loc>([^<]*sitemap-people[^<]*)<\/loc>/g),
].map((m) => new URL(m[1]).pathname);
const allKeys = new Set<string>(
  directory.musicians.map((m: { compound_key: string }) => m.compound_key),
);
for (const path of peopleMaps) {
  const xml = await get(path);
  for (const match of xml.matchAll(
    /<loc>https:\/\/bizimcaz.com\/musician\/([^<]+)<\/loc>/g,
  ))
    allKeys.add(decodeURIComponent(match[1]));
}
const keys = [...allKeys];
await Bun.write(join(cache, "keys.json"), JSON.stringify(keys));
let next = 0,
  done = 0,
  failures = 0,
  cached = 0;
const startedAt = new Date().toISOString();
async function worker() {
  while (next < keys.length) {
    const key = keys[next++];
    const file = Bun.file(
      join(cache, "networks", encodeURIComponent(key) + ".json"),
    );
    if (await file.exists()) {
      cached++;
      done++;
      continue;
    }
    try {
      const body = await get(
        `/api/musician-network-cached/${encodeURIComponent(key)}?years_back=150&min_weight=0&max_musicians=20000`,
      );
      const data = JSON.parse(body);
      if (data.unavailable) {
        const info = JSON.parse(
          await get(`/api/musician-info/${encodeURIComponent(key)}`),
        );
        if (!info.name) throw new Error("Missing musician info");
        await Bun.write(
          file,
          JSON.stringify({ unavailable: true, info, nodes: [], links: [] }),
        );
      } else {
        if (!Array.isArray(data.nodes) || !Array.isArray(data.links))
          throw new Error(data.error || "Invalid network");
        await Bun.write(file, body);
      }
    } catch (error) {
      failures++;
      console.error(key, String(error));
    }
    done++;
    if (done % 100 === 0)
      console.log(
        `${done}/${keys.length} checked; ${cached} cached; ${failures} failures`,
      );
    await delay(100);
  }
}
console.log(
  `Collecting ${keys.length} public musician networks with 4 workers.`,
);
await Promise.all(Array.from({ length: 4 }, worker));
await Bun.write(
  join(cache, "collection.json"),
  JSON.stringify(
    {
      startedAt,
      finishedAt: new Date().toISOString(),
      total: keys.length,
      failures,
      cached,
    },
    null,
    2,
  ),
);
console.log(
  `Finished: ${done} checked, ${failures} failed. Run again to retry missing records.`,
);
if (failures) process.exitCode = 1;
