"""Read public concert listings into a local snapshot. No database access."""
import argparse
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime, timezone
from html import unescape
from pathlib import Path
import json
import gzip
import re
import subprocess
import time

ROOT = Path(__file__).resolve().parent.parent


def plain(value):
    return unescape(re.sub(r"<[^>]+>", "", value)).strip()


def parse_concerts(body):
    records = []
    for row in re.findall(r"<tr\b[^>]*>(.*?)</tr>", body, re.S):
        cells = re.findall(r"<td\b[^>]*>(.*?)</td>", row, re.S)
        if len(cells) != 7:
            continue
        link = re.search(r'href="/concert/([^"]+)"', cells[5])
        if not link:
            continue
        date = datetime.strptime(plain(cells[0]), "%d.%m.%Y").date().isoformat()
        names = [re.sub(r"\s*\([^()]*\)\s*$", "", plain(name)) for name in
                 re.findall(r"<li\b[^>]*>(.*?)</li>", cells[6], re.S)]
        key = unescape(link[1])
        records.append({"key": key, "date": date,
                        "venue": key.rsplit("_", 2)[0],
                        "venueName": plain(cells[2]), "city": plain(cells[3]),
                        "musicians": sorted(set(names))})
    return records


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--fetch", action="store_true", help="Fetch public pages and write the local concert snapshot")
    args = parser.parse_args()
    if not args.fetch:
        parser.print_help()
        return
    cache = ROOT / ".cache/concerts"
    cache.mkdir(parents=True, exist_ok=True)

    def get(route):
        target = cache / (route.strip("/").replace("/", "-") + ".html")
        if target.exists():
            return target.read_text()
        for attempt in range(4):
            result = subprocess.run(["curl", "-sSfL", "--max-time", "45", "-A", "CazAtlas/1.0 (public concert archive)",
                                     "https://bizimcaz.com" + route], capture_output=True, text=True)
            if result.returncode == 0 and ("concerts-list-table" in result.stdout or route == "/concerts"):
                target.write_text(result.stdout)
                time.sleep(0.15)
                return result.stdout
            time.sleep(2 ** attempt)
        raise RuntimeError("Could not read " + route)

    index = get("/concerts")
    years = re.findall(r'/concerts/year/(\d+)"[^>]*>\s*\d+\s*<span[^>]*>\((\d+)\)', index)
    routes = [f"/concerts/year/{year}" + (f"/{page}" if page > 1 else "")
              for year, count in years for page in range(1, (int(count) + 19) // 20 + 1)]
    if not routes:
        raise RuntimeError("No archive years found")
    records = {}
    failures = []
    with ThreadPoolExecutor(max_workers=4) as pool:
        futures = {pool.submit(get, route): route for route in routes}
        for done, future in enumerate(as_completed(futures), 1):
            try:
                parsed = parse_concerts(future.result())
                if not parsed:
                    raise RuntimeError("No concert rows")
                for record in parsed:
                    records[record["key"]] = record
            except Exception as error:
                failures.append(futures[future])
                print(str(error), flush=True)
            if done % 100 == 0:
                print(f"{done}/{len(routes)} pages; {len(records)} concerts; {len(failures)} failures", flush=True)
    if failures:
        raise RuntimeError(f"{len(failures)} pages failed; rerun to resume. Snapshot not replaced.")
    if len(records) != sum(int(count) for _, count in years):
        raise RuntimeError("Archive count changed during collection. Snapshot not replaced.")
    snapshot = {"source": "https://bizimcaz.com/concerts", "fetchedAt": datetime.now(timezone.utc).isoformat(),
                "pages": len(routes), "complete": True, "concerts": sorted(records.values(), key=lambda c: c["key"])}
    target = ROOT / "data/concerts.json.gz"
    temporary = target.with_suffix(".tmp")
    temporary.write_bytes(gzip.compress(json.dumps(snapshot, ensure_ascii=False, separators=(",", ":")).encode(), mtime=0))
    temporary.replace(target)
    print(f"Saved {len(records)} concerts to {target}", flush=True)


if __name__ == "__main__":
    main()
