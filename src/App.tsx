import { useEffect, useMemo, useRef, useState } from "react";
import {
  ChevronDown,
  LocateFixed,
  Minus,
  Plus,
  Search,
  SlidersHorizontal,
  X,
} from "lucide-react";
import Network from "./Network";
import Timeline from "./Timeline";
import {
  concertHistogram,
  createConcertWindow,
  monthIndex,
  monthValue,
  readRange,
} from "./chronology";
import type { DateRange } from "./chronology";
import type { NetworkHandle } from "./Network";
import type { Atlas, ConcertIndex, Musician } from "./types";
import { groupInfo, groups, normalize, number } from "./types";
import { adjacency, filterGraph, shortestPath, strongestEdges } from "./graph";

function MusicianSearch({
  nodes,
  onSelect,
  onHover,
  selected,
}: {
  nodes: Musician[];
  onSelect: (id: number) => void;
  onHover: (id: number | null) => void;
  selected: number | null;
}) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [cursor, setCursor] = useState(0);
  const wrap = useRef<HTMLDivElement>(null);
  const results = useMemo(
    () =>
      nodes
        .filter((n) =>
          normalize(n.name + " " + n.key).includes(normalize(query)),
        )
        .slice(0, 7),
    [query, nodes],
  );
  useEffect(() => {
    const close = (event: PointerEvent) => {
      if (!wrap.current?.contains(event.target as Node)) {
        setOpen(false);
        onHover(null);
      }
    };
    document.addEventListener("pointerdown", close);
    return () => document.removeEventListener("pointerdown", close);
  }, [onHover]);
  useEffect(() => {
    setCursor(0);
  }, [nodes]);
  function choose(id: number) {
    onSelect(id);
    onHover(null);
    setOpen(false);
    setQuery("");
  }
  return (
    <div
      className="search-wrap"
      ref={wrap}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) {
          setOpen(false);
          onHover(null);
        }
      }}
    >
      <div className="search-field">
        <Search size={16} aria-hidden="true" />
        <input
          id="main-search"
          placeholder="Müzisyen ara"
          aria-label="Müzisyen ara"
          role="combobox"
          aria-expanded={open}
          aria-controls="musician-results"
          aria-autocomplete="list"
          aria-activedescendant={
            open && results[cursor]
              ? `musician-option-${results[cursor].id}`
              : undefined
          }
          value={query}
          onFocus={() => setOpen(true)}
          onChange={(e) => {
            setQuery(e.target.value);
            setCursor(0);
            setOpen(true);
            onHover(null);
          }}
          onKeyDown={(e) => {
            if (e.key === "Escape") {
              e.stopPropagation();
              setOpen(false);
              onHover(null);
            }
            if (e.key === "ArrowDown" || e.key === "ArrowUp") {
              e.preventDefault();
              setOpen(true);
              const next = Math.max(
                0,
                Math.min(
                  results.length - 1,
                  cursor + (e.key === "ArrowDown" ? 1 : -1),
                ),
              );
              setCursor(next);
              onHover(results[next]?.id ?? null);
            }
            if (e.key === "Enter" && open && results[cursor]) {
              e.preventDefault();
              choose(results[cursor].id);
            }
          }}
        />
        <kbd>⌘ K</kbd>
      </div>
      {open && (
        <div
          className="search-results surface"
          id="musician-results"
          role="listbox"
          aria-label="Müzisyenler"
          onMouseLeave={() => onHover(null)}
        >
          {selected !== null && (
            <p className="search-hint">
              Yolu görmek için bir ismin üzerine gel.
            </p>
          )}
          {results.map((n, i) => (
            <button
              key={n.id}
              id={`musician-option-${n.id}`}
              role="option"
              aria-selected={i === cursor}
              className={i === cursor ? "highlighted" : ""}
              onMouseMove={() => {
                setCursor(i);
                onHover(n.id);
              }}
              onClick={() => choose(n.id)}
            >
              <i
                className="color-dot"
                style={{ background: groupInfo(n.group).color }}
              />
              <span>{n.name}</span>
              <small>{groupInfo(n.group).name}</small>
            </button>
          ))}
          {!results.length && <p>Bu filtrelerde müzisyen bulunamadı.</p>}
        </div>
      )}
    </div>
  );
}

export default function App() {
  const [data, setData] = useState<{
    atlas: Atlas;
    concerts: ConcertIndex;
  } | null>(null);
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    setError("");
    const read = async (url: string) => {
      const response = await fetch(url, { signal: controller.signal });
      if (!response.ok) throw new Error("Graf verisi yüklenemedi.");
      return response.json();
    };
    Promise.all([read("/data/atlas.json"), read("/data/concerts.json")])
      .then(([atlas, concerts]) => setData({ atlas, concerts }))
      .catch((e) => {
        if (e.name !== "AbortError")
          setError("Graf verisi yüklenemedi. Tekrar deneyebilirsin.");
      });
    return () => controller.abort();
  }, [attempt]);
  if (!data)
    return (
      <main className="loading-screen">
        <span className="wordmark">
          caz<span>graf</span>
        </span>
        <p role="status">{error || "Graf yükleniyor…"}</p>
        {error && (
          <button
            className="text-button"
            onClick={() => setAttempt((n) => n + 1)}
          >
            Tekrar dene
          </button>
        )}
      </main>
    );
  return <AtlasApp data={data.atlas} concerts={data.concerts} />;
}

function AtlasApp({ data, concerts }: { data: Atlas; concerts: ConcertIndex }) {
  const params = useMemo(() => new URLSearchParams(window.location.search), []);
  const bounds = useMemo<DateRange>(() => {
    const events = concerts.timeline;
    return events.length
      ? [monthIndex(events[0].date), monthIndex(events[events.length - 1].date)]
      : [monthIndex(concerts.meta.through), monthIndex(concerts.meta.through)];
  }, [concerts]);
  const [range, setRange] = useState<DateRange>(() =>
    readRange(params.get("from"), params.get("to"), bounds),
  );
  const [cursor, setCursor] = useState(
    () =>
      readRange(
        params.get("from"),
        params.get("at") ?? params.get("to"),
        range,
      )[1],
  );
  function changeRange(next: DateRange) {
    setRange(next);
    setCursor(next[1]);
  }
  const initialMin = Number(params.get("min") ?? 10);
  const [minConcerts, setMinConcerts] = useState<number | null>(
    params.get("min") === "all"
      ? null
      : Number.isFinite(initialMin)
        ? Math.max(0, Math.floor(initialMin))
        : 10,
  );
  const [venueId, setVenueId] = useState(
    concerts.venues.some((v) => v.id === params.get("venue"))
      ? params.get("venue")!
      : "",
  );
  const [instrument, setInstrument] = useState(
    groups.some((g) => g.id === params.get("instrument"))
      ? params.get("instrument")!
      : "",
  );
  const [edgeLimit, setEdgeLimit] = useState(
    [1, 2, 3, 5].includes(Number(params.get("links")))
      ? Number(params.get("links"))
      : 2,
  );
  const [labels, setLabels] = useState(true);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [venueQuery, setVenueQuery] = useState("");
  const [selectedId, setSelectedId] = useState<number | null>(
    data.nodes.find((n) => n.key === params.get("m"))?.id ?? null,
  );
  const [hoveredId, setHoveredId] = useState<number | null>(null);
  const network = useRef<NetworkHandle>(null);
  const byId = useMemo(() => new Map(data.nodes.map((n) => [n.id, n])), [data]);
  const venue = useMemo(
    () => concerts.venues.find((v) => v.id === venueId),
    [concerts, venueId],
  );
  const layoutCounts = venue?.musicians ?? concerts.counts;
  const layoutGraph = useMemo(
    () =>
      filterGraph(
        { nodes: data.nodes, edges: venue?.edges ?? concerts.edges },
        layoutCounts,
        minConcerts,
        instrument,
        layoutCounts,
      ),
    [data, concerts, layoutCounts, minConcerts, instrument, venue],
  );
  const queryConcerts = useMemo(
    () => createConcertWindow(concerts.timeline, venueId),
    [concerts, venueId],
  );
  const windowed = useMemo(
    () => queryConcerts(range[0], cursor),
    [queryConcerts, range[0], cursor],
  );
  const histogram = useMemo(
    () => concertHistogram(concerts.timeline, bounds, venueId),
    [concerts, bounds, venueId],
  );
  const allDates = range[0] === bounds[0] && cursor === bounds[1];
  const counts = allDates ? layoutCounts : windowed.counts;
  const graph = useMemo(
    () =>
      allDates
        ? layoutGraph
        : filterGraph(
            { nodes: layoutGraph.nodes, edges: windowed.edges },
            counts,
            minConcerts,
            instrument,
            counts,
          ),
    [allDates, layoutGraph, windowed, counts, minConcerts, instrument],
  );
  const visibleIds = useMemo(
    () => new Set(graph.nodes.map((n) => n.id)),
    [graph],
  );
  const selected =
    selectedId !== null && visibleIds.has(selectedId) ? selectedId : null;
  const hovered =
    hoveredId !== null && visibleIds.has(hoveredId) ? hoveredId : null;
  useEffect(() => {
    if (selectedId !== selected) setSelectedId(selected);
  }, [selected, selectedId]);
  useEffect(() => {
    setHoveredId(null);
  }, [graph]);
  const neighbors = useMemo(() => adjacency(graph), [graph]);
  const edges = useMemo(
    () => strongestEdges(graph.edges, edgeLimit),
    [graph, edgeLimit],
  );
  const path = useMemo(
    () =>
      selected !== null && hovered !== null
        ? shortestPath(neighbors, selected, hovered)
        : [],
    [neighbors, selected, hovered],
  );
  const ranked = useMemo(
    () =>
      [...graph.nodes].sort(
        (a, b) =>
          (counts[b.id] ?? 0) - (counts[a.id] ?? 0) || b.degree - a.degree,
      ),
    [graph, counts],
  );
  const musician = selected === null ? null : byId.get(selected)!;
  const hoveredMusician = hovered === null ? null : byId.get(hovered)!;
  const collaborators = selected === null ? [] : neighbors.get(selected) || [];
  const venues = useMemo(
    () =>
      concerts.venues.filter((v) =>
        normalize(v.name + " " + v.city).includes(normalize(venueQuery)),
      ),
    [concerts, venueQuery],
  );
  const maxConcerts = useMemo(
    () => Math.max(1, ...Object.values(counts)),
    [counts],
  );

  useEffect(() => {
    const query = new URLSearchParams();
    if (range[0] !== bounds[0]) query.set("from", monthValue(range[0]));
    if (range[1] !== bounds[1]) query.set("to", monthValue(range[1]));
    if (cursor !== range[1]) query.set("at", monthValue(cursor));
    if (minConcerts !== 10)
      query.set("min", minConcerts === null ? "all" : String(minConcerts));
    if (venueId) query.set("venue", venueId);
    if (instrument) query.set("instrument", instrument);
    if (edgeLimit !== 2) query.set("links", String(edgeLimit));
    if (selected !== null) query.set("m", byId.get(selected)!.key);
    window.history.replaceState(
      null,
      "",
      window.location.pathname + (query.size ? "?" + query : ""),
    );
  }, [
    minConcerts,
    venueId,
    instrument,
    edgeLimit,
    selected,
    byId,
    range,
    bounds,
    cursor,
  ]);
  useEffect(() => {
    const listener = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        document.getElementById("main-search")?.focus();
      }
      if (e.key === "Escape") {
        setFiltersOpen(false);
        setSelectedId(null);
        setHoveredId(null);
      }
      if ((e.target as HTMLElement).matches("input, select, textarea, button"))
        return;
      if (e.key === "+" || e.key === "=") network.current?.zoom(1.3);
      if (e.key === "-") network.current?.zoom(1 / 1.3);
      if (e.key === "0") network.current?.fit();
    };
    window.addEventListener("keydown", listener);
    return () => window.removeEventListener("keydown", listener);
  }, []);
  function resetFilters() {
    changeRange([...bounds]);
    setMinConcerts(null);
    setInstrument("");
    setVenueId("");
    setVenueQuery("");
  }
  function select(id: number | null) {
    setSelectedId(id);
  }
  function pick(id: number) {
    setSelectedId(id);
    network.current?.focus(id);
  }

  return (
    <main className="atlas">
      <Network
        ref={network}
        data={graph}
        layoutData={layoutGraph}
        layoutCounts={layoutCounts}
        edges={edges}
        counts={counts}
        selected={selected}
        hovered={hovered}
        path={path}
        labels={labels}
        onSelect={select}
        onHover={setHoveredId}
      />
      <div className="identity">
        <h1 className="wordmark">
          caz<span>graf</span>
          <i />
        </h1>
        <p>Kim, kiminle çalıyor?</p>
      </div>
      <div className="top-controls">
        <MusicianSearch
          nodes={ranked}
          selected={selected}
          onSelect={pick}
          onHover={setHoveredId}
        />
        <button
          className={`filter-toggle surface ${filtersOpen ? "active" : ""}`}
          aria-label="Filtreler"
          aria-expanded={filtersOpen}
          aria-controls="filters"
          onClick={() => setFiltersOpen((v) => !v)}
        >
          <SlidersHorizontal size={17} />
          <span>Filtreler</span>
          {(minConcerts !== null || venueId || instrument) && (
            <i className="filter-dot" />
          )}
        </button>
      </div>

      {(minConcerts !== null || venue || instrument) && (
        <div className="active-filters">
          {minConcerts !== null && (
            <button
              onClick={() => setMinConcerts(null)}
              aria-label="Konser sayısı filtresini kaldır"
            >
              {number(minConcerts)} konserden fazla
              <X size={12} />
            </button>
          )}
          {venue && (
            <button
              onClick={() => setVenueId("")}
              aria-label="Mekan filtresini kaldır"
            >
              {venue.name}
              <X size={12} />
            </button>
          )}
          {instrument && (
            <button
              onClick={() => setInstrument("")}
              aria-label="Enstrüman filtresini kaldır"
            >
              {groupInfo(instrument).name}
              <X size={12} />
            </button>
          )}
        </div>
      )}

      {filtersOpen && (
        <section
          id="filters"
          className="filter-panel surface"
          aria-label="Graf filtreleri"
        >
          <div className="panel-heading">
            <h2>Filtreler</h2>
            <button
              className="icon-button"
              aria-label="Filtreleri kapat"
              onClick={() => setFiltersOpen(false)}
            >
              <X size={16} />
            </button>
          </div>
          <div className="filter-section">
            <div className="field-heading">
              <label htmlFor="concert-min">Konser sayısı</label>
              <button
                className="subtle-button"
                onClick={() => setMinConcerts(null)}
              >
                Tümü
              </button>
            </div>
            <div className="threshold">
              <input
                id="concert-min"
                type="number"
                min="0"
                step="1"
                value={minConcerts ?? ""}
                placeholder="0"
                onChange={(e) =>
                  setMinConcerts(
                    e.target.value === ""
                      ? null
                      : Math.max(0, Math.floor(Number(e.target.value) || 0)),
                  )
                }
              />
              <span>konserden fazla</span>
            </div>
            <input
              className="range"
              type="range"
              aria-label="Konser sayısı eşiği"
              min="0"
              max={maxConcerts}
              step="1"
              value={Math.min(minConcerts ?? 0, maxConcerts)}
              onChange={(e) => setMinConcerts(Number(e.target.value))}
            />
            <div className="presets">
              {[0, 10, 50, 100].map((n) => (
                <button
                  key={n}
                  aria-pressed={minConcerts === n}
                  onClick={() => setMinConcerts(n)}
                >
                  {n}+
                </button>
              ))}
            </div>
            <p className="field-note">
              {venue
                ? "Seçilen mekan ve tarih aralığındaki"
                : "Seçilen tarih aralığındaki"}{" "}
              geçmiş konserler sayılır.
            </p>
          </div>
          <div className="filter-section">
            <div className="field-heading">
              <label htmlFor="venue-search">Mekan</label>
              {venue && (
                <button
                  className="subtle-button"
                  onClick={() => setVenueId("")}
                >
                  Tümü
                </button>
              )}
            </div>
            <div className="venue-search">
              <Search size={14} />
              <input
                id="venue-search"
                placeholder="Mekan veya şehir ara"
                value={venueQuery}
                onChange={(e) => setVenueQuery(e.target.value)}
              />
            </div>
            <div className="venue-list" aria-label="Mekanlar">
              <button
                className={!venueId ? "chosen" : ""}
                aria-pressed={!venueId}
                onClick={() => setVenueId("")}
              >
                <span>Tüm mekanlar</span>
              </button>
              {venues.map((v) => (
                <button
                  key={v.id}
                  className={v.id === venueId ? "chosen" : ""}
                  aria-pressed={v.id === venueId}
                  onClick={() => {
                    setVenueId(v.id);
                    setHoveredId(null);
                  }}
                >
                  <span>
                    {v.name}
                    <small>{v.city}</small>
                  </span>
                  <small>{number(v.concerts)}</small>
                </button>
              ))}
              {!venues.length && <p>Mekan bulunamadı.</p>}
            </div>
            {venue && (
              <p className="field-note">
                Yalnızca burada aynı konserde çalanların bağları.
              </p>
            )}
          </div>
          <div className="filter-section">
            <label className="field-heading" htmlFor="instrument">
              Enstrüman
            </label>
            <div className="select-wrap">
              <select
                id="instrument"
                value={instrument}
                onChange={(e) => setInstrument(e.target.value)}
              >
                <option value="">Tüm enstrümanlar</option>
                {groups.map((g) => (
                  <option key={g.id} value={g.id}>
                    {g.name}
                  </option>
                ))}
              </select>
              <ChevronDown size={14} />
            </div>
          </div>
          <div className="filter-section">
            <div className="field-heading">
              <span>Kişi başına güçlü bağ</span>
            </div>
            <div className="presets">
              {[1, 2, 3, 5].map((n) => (
                <button
                  key={n}
                  aria-pressed={edgeLimit === n}
                  onClick={() => setEdgeLimit(n)}
                >
                  {n}
                </button>
              ))}
            </div>
            <p className="field-note">
              İki kişinin de en güçlü bağları. Hover’da diğer bağlar da görünür.
            </p>
            <label className="check-label">
              <input
                type="checkbox"
                checked={labels}
                onChange={(e) => setLabels(e.target.checked)}
              />
              İsimleri göster
            </label>
          </div>
          <div className="filter-footer">
            <span>{number(graph.nodes.length)} müzisyen</span>
            <button className="subtle-button" onClick={resetFilters}>
              Filtreleri temizle
            </button>
          </div>
        </section>
      )}

      {musician && (
        <section
          className={`selection-panel surface ${filtersOpen ? "with-filters" : ""}`}
          aria-label="Seçili müzisyen"
        >
          <div className="panel-heading">
            <span className="section-caption">SEÇİLİ MÜZİSYEN</span>
            <button
              className="icon-button"
              aria-label="Seçimi kaldır"
              onClick={() => {
                setSelectedId(null);
                setHoveredId(null);
              }}
            >
              <X size={16} />
            </button>
          </div>
          <h2>
            <i
              className="color-dot"
              style={{ background: groupInfo(musician.group).color }}
            />
            {musician.name}
          </h2>
          <p className="musician-meta">
            {groupInfo(musician.group).name} ·{" "}
            {number(counts[musician.id] ?? 0)} konser ·{" "}
            {number(collaborators.length)} bağ
          </p>
          <div className="collaborator-heading">
            <span>En çok birlikte çaldığı</span>
            <small>Ortak konser</small>
          </div>
          <div
            className="collaborators"
            onMouseLeave={() => setHoveredId(null)}
          >
            {collaborators.slice(0, 6).map((c) => (
              <button
                key={c.id}
                onClick={() => pick(c.id)}
                onMouseEnter={() => setHoveredId(c.id)}
                onFocus={() => setHoveredId(c.id)}
                onBlur={() => setHoveredId(null)}
              >
                <span>{byId.get(c.id)!.name}</span>
                <small>{number(c.weight)}</small>
              </button>
            ))}
            {!collaborators.length && <p>Bu filtrelerde bağlantısı yok.</p>}
          </div>
          <p className="selection-hint">
            Başka bir ismin üzerine gel, aranızdaki yolu gör.
          </p>
        </section>
      )}

      {!graph.nodes.length && (
        <div className="empty-state surface" role="status">
          <strong>Bu filtrelerde müzisyen yok.</strong>
          <p>Konser eşiğini düşür veya tarih aralığını genişlet.</p>
          <button className="text-button" onClick={resetFilters}>
            Filtreleri temizle
          </button>
        </div>
      )}
      <div className="graph-status" aria-live="polite">
        {hoveredMusician && selected !== null && hovered !== selected ? (
          <div className="path-readout surface">
            {path.length ? (
              <>
                <span className="path-caption">
                  En kısa yol · {path.length - 1} bağ
                </span>
                <div className="path-names">
                  {path.map((id, i) => (
                    <span key={id}>
                      {i > 0 && <span className="path-separator">→</span>}
                      {byId.get(id)!.name}
                    </span>
                  ))}
                </div>
              </>
            ) : (
              <>
                <strong>
                  {musician?.name} → {hoveredMusician.name}
                </strong>
                <span>Bu filtrelerde aralarında yol bulunamadı.</span>
              </>
            )}
          </div>
        ) : hoveredMusician ? (
          <div className="hover-readout surface">
            <i
              className="color-dot"
              style={{ background: groupInfo(hoveredMusician.group).color }}
            />
            <strong>{hoveredMusician.name}</strong>
            <span>
              {number(counts[hoveredMusician.id] ?? 0)} konser ·{" "}
              {number(neighbors.get(hovered!)?.length ?? 0)} bağ
            </span>
          </div>
        ) : (
          <p className="interaction-hint">
            {selected !== null
              ? "En kısa yol için başka bir müzisyenin üzerine gel."
              : "Üzerine gel: bağlantılar · Tıkla: seç · Kaydır: yakınlaş"}
          </p>
        )}
      </div>
      <Timeline
        bounds={bounds}
        range={range}
        cursor={cursor}
        histogram={histogram}
        musicians={graph.nodes.length}
        edges={edges.length}
        concerts={windowed.concerts}
        onRange={changeRange}
        onCursor={setCursor}
      />
      <div className="zoom-controls surface" aria-label="Graf görünümü">
        <button
          className="icon-button"
          aria-label="Uzaklaştır"
          title="Uzaklaştır (-)"
          onClick={() => network.current?.zoom(1 / 1.3)}
        >
          <Minus size={17} />
        </button>
        <button
          className="icon-button"
          aria-label="Yakınlaştır"
          title="Yakınlaştır (+)"
          onClick={() => network.current?.zoom(1.3)}
        >
          <Plus size={17} />
        </button>
        <span />
        <button
          className="icon-button"
          aria-label="Grafı ekrana sığdır"
          title="Ekrana sığdır (0)"
          onClick={() => network.current?.fit()}
        >
          <LocateFixed size={17} />
        </button>
      </div>
    </main>
  );
}
