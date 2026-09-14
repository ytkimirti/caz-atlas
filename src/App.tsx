import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowUpRight,
  Network as NetworkIcon,
  ChevronDown,
  LocateFixed,
  Minus,
  Plus,
  Search,
  SlidersHorizontal,
  X,
} from "lucide-react";
import Network from "./Network";
import {
  DEFAULT_ENGINE,
  layoutEngines,
  parseEngine,
  parseSpacing,
  spacingOptions,
} from "./layout-options";
import type { LayoutStatus } from "./layout-options";
import type { NetworkHandle } from "./Network";
import type { Atlas, ConcertIndex, Musician } from "./types";
import { groupInfo, groups, normalize, number } from "./types";
import {
  adjacency,
  filterGraph,
  shortestPath,
  edgesBySharedConcerts,
} from "./graph";

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
        {query ? (
          <button
            className="icon-button search-clear"
            aria-label="Aramayı temizle"
            onClick={() => {
              setQuery("");
              setCursor(0);
              onHover(null);
              wrap.current?.querySelector("input")?.focus();
            }}
          >
            <X size={14} />
          </button>
        ) : (
          <kbd aria-hidden="true">
            {/Mac|iPhone|iPad/.test(navigator.platform) ? "⌘" : "Ctrl"} K
          </kbd>
        )}
      </div>
      {open && (
        <div
          className="search-results surface"
          id="musician-results"
          role="listbox"
          aria-label="Müzisyenler"
          onMouseLeave={() => onHover(null)}
        >
          <span className="search-caption">
            {query ? "ARAMA SONUÇLARI" : "MÜZİSYENLERİ KEŞFET"}
          </span>
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
        {!error && (
          <div className="loading-mark" aria-hidden="true">
            <i />
            <i />
            <i />
          </div>
        )}
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
  const [minSharedConcerts, setMinSharedConcerts] = useState(
    [1, 2, 5, 10].includes(Number(params.get("shared")))
      ? Number(params.get("shared"))
      : 5,
  );
  const [engine, setEngine] = useState(() => parseEngine(params.get("engine")));
  const [spacing, setSpacing] = useState(() =>
    parseSpacing(params.get("spacing")),
  );
  const [layoutStatus, setLayoutStatus] = useState<LayoutStatus>("pending");
  const [labels, setLabels] = useState(true);
  const [showEnsembles, setShowEnsembles] = useState(true);
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
  const counts = venue?.musicians ?? concerts.counts;
  const ensembles = venue?.ensembles ?? concerts.ensembles ?? [];
  const musicianEnsembles = useMemo(
    () =>
      ensembles
        .filter((e) => selectedId !== null && e.musicians[selectedId])
        .sort((a, b) => b.musicians[selectedId!] - a.musicians[selectedId!]),
    [ensembles, selectedId],
  );
  const graph = useMemo(
    () =>
      filterGraph(
        { nodes: data.nodes, edges: venue?.edges ?? concerts.edges },
        counts,
        minConcerts,
        venue?.musicians,
      ),
    [data, concerts.edges, counts, minConcerts, venue],
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
    () => edgesBySharedConcerts(graph.edges, minSharedConcerts),
    [graph, minSharedConcerts],
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
  const highlightedMusicians = useMemo(
    () => ranked.filter((node) => node.group === instrument),
    [ranked, instrument],
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
    if (minConcerts !== 10)
      query.set("min", minConcerts === null ? "all" : String(minConcerts));
    if (venueId) query.set("venue", venueId);
    if (instrument) query.set("instrument", instrument);
    if (minSharedConcerts !== 5) query.set("shared", String(minSharedConcerts));
    if (engine !== DEFAULT_ENGINE) query.set("engine", engine);
    if (spacing !== 1) query.set("spacing", String(spacing));
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
    minSharedConcerts,
    selected,
    byId,
    engine,
    spacing,
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
    setMinConcerts(null);
    setMinSharedConcerts(1);
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
      {layoutStatus === "pending" && (
        <div className="layout-loading">
          <div
            className="layout-loading-track"
            role="progressbar"
            aria-label="Yerleşim hesaplanıyor"
          >
            <span />
          </div>
          <span className="layout-loading-label">Yerleşim hesaplanıyor…</span>
        </div>
      )}
      <Network
        ref={network}
        data={graph}
        edges={edges}
        counts={counts}
        ensembles={ensembles}
        ensembleEdges={venue?.edges ?? concerts.edges}
        showEnsembles={showEnsembles}
        selected={selected}
        hovered={hovered}
        path={path}
        labels={labels}
        instrument={instrument}
        engine={engine}
        spacing={spacing}
        onLayoutStatus={setLayoutStatus}
        onSelect={select}
        onHover={setHoveredId}
      />
      <div className="layout-controls surface" aria-label="Graf yerleşimi">
        <label htmlFor="layout-engine">Yerleşim</label>
        <select
          id="layout-engine"
          value={engine}
          onChange={(e) => setEngine(parseEngine(e.target.value))}
          aria-describedby="layout-description"
        >
          {layoutEngines.map((option) => (
            <option key={option.id} value={option.id}>
              {option.name}
            </option>
          ))}
        </select>
        <p id="layout-description">
          {layoutEngines.find((option) => option.id === engine)!.description}
        </p>
        <div className="layout-spacing">
          <label htmlFor="layout-spacing">Aralık</label>
          <select
            id="layout-spacing"
            value={spacing}
            onChange={(e) => setSpacing(parseSpacing(e.target.value))}
          >
            {spacingOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.name}
              </option>
            ))}
          </select>
        </div>
        <p className="layout-feedback" role="status">
          {layoutStatus === "pending"
            ? "Yerleşim hesaplanıyor…"
            : layoutStatus === "fallback"
              ? "Yerleşim hesaplanamadı. Arşiv konumları gösteriliyor; başka bir yerleşim seçebilirsin."
              : "Yerleşim hazır"}
        </p>
      </div>
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
          {(minConcerts !== null || venueId || minSharedConcerts > 1) && (
            <i className="filter-dot" />
          )}
        </button>
      </div>

      {(minConcerts !== null || venue || minSharedConcerts > 1) && (
        <div className="active-filters">
          {minSharedConcerts > 1 && (
            <button
              onClick={() => setMinSharedConcerts(1)}
              aria-label="Ortak konser filtresini kaldır"
            >
              En az {minSharedConcerts} ortak konser
              <X size={12} />
            </button>
          )}
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
              {venue ? "Seçilen mekandaki" : "Arşivdeki"} geçmiş konserler
              sayılır.
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
            <div className="field-heading">
              <span>En az ortak konser</span>
            </div>
            <div className="presets">
              {[1, 2, 5, 10].map((n) => (
                <button
                  key={n}
                  aria-label={`En az ${n} ortak konser`}
                  aria-pressed={minSharedConcerts === n}
                  onClick={() => setMinSharedConcerts(n)}
                >
                  {n}
                </button>
              ))}
            </div>
            <p className="field-note">
              Aynı konserde birlikte çaldıkları kayıt sayısı. Üzerine gelince
              veya seçince kişinin tüm bağları görünür.
            </p>
            <label className="check-label">
              <input
                type="checkbox"
                checked={labels}
                onChange={(e) => setLabels(e.target.checked)}
              />
              İsimleri göster
            </label>
            <label className="check-label">
              <input
                type="checkbox"
                checked={showEnsembles}
                onChange={(e) => setShowEnsembles(e.target.checked)}
              />
              Grup / proje adlarını göster
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

      <section
        className="instrument-explorer surface"
        aria-label="Enstrüman vurgulama"
      >
        <div className="instrument-control">
          <div className="select-wrap">
            <select
              id="instrument"
              aria-label="Enstrüman vurgula"
              aria-describedby={instrument ? "instrument-summary" : undefined}
              value={instrument}
              onChange={(event) => setInstrument(event.target.value)}
            >
              <option value="">Enstrüman vurgula</option>
              {groups.map((group) => (
                <option key={group.id} value={group.id}>
                  {group.name}
                </option>
              ))}
            </select>
            <ChevronDown size={14} />
          </div>
          {instrument && (
            <button
              className="icon-button"
              aria-label="Vurgulamayı kaldır"
              onClick={() => setInstrument("")}
            >
              <X size={14} />
            </button>
          )}
        </div>
        {instrument && (
          <>
            <p
              id="instrument-summary"
              className="instrument-summary"
              aria-live="polite"
            >
              Ağda {number(highlightedMusicians.length)} müzisyen vurgulanıyor.
            </p>
            {!musician && (
              <>
                <div className="collaborator-heading">
                  <span>Konser sayısına göre</span>
                  <small>{venue ? venue.name : "Arşiv"}</small>
                </div>
                <div
                  className="collaborators instrument-ranking"
                  onMouseLeave={() => setHoveredId(null)}
                >
                  {highlightedMusicians.map((node) => (
                    <button
                      key={node.id}
                      onClick={() => pick(node.id)}
                      onMouseEnter={() => setHoveredId(node.id)}
                      onFocus={() => setHoveredId(node.id)}
                      onBlur={() => setHoveredId(null)}
                    >
                      <span>{node.name}</span>
                      <small>{number(counts[node.id] ?? 0)} konser</small>
                    </button>
                  ))}
                  {!highlightedMusicians.length && (
                    <p>Bu görünümde müzisyen yok.</p>
                  )}
                </div>
              </>
            )}
          </>
        )}
      </section>

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
          <p className="musician-meta">{groupInfo(musician.group).name}</p>
          <div className="musician-stats">
            <div>
              <strong>{number(counts[musician.id] ?? 0)}</strong>
              <span>konser</span>
            </div>
            <div>
              <strong>{number(collaborators.length)}</strong>
              <span>müzisyenle bağ</span>
            </div>
          </div>
          <div className="collaborator-heading">
            <span>En çok birlikte çaldığı</span>
            <small>Ortak konser</small>
          </div>
          <div
            className="collaborators"
            onMouseLeave={() => setHoveredId(null)}
          >
            {collaborators.slice(0, 6).map((c, i) => (
              <button
                key={c.id}
                style={{ animationDelay: `${i * 18}ms` }}
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
          {musicianEnsembles.length > 0 && (
            <div className="musician-ensembles">
              <span className="section-caption">GRUP / PROJE</span>
              <ul>
                {musicianEnsembles.map((ensemble) => (
                  <li key={ensemble.id}>
                    <span>{ensemble.name}</span>
                    <small>
                      {number(ensemble.musicians[musician.id])} konser
                    </small>
                  </li>
                ))}
              </ul>
              <p>Arşivdeki konser adları ve o konserlerin kadroları.</p>
            </div>
          )}
          <p className="selection-hint">
            Başka bir ismin üzerine gel, aralarındaki yolu gör.
          </p>
        </section>
      )}

      {!graph.nodes.length && (
        <div className="empty-state surface" role="status">
          <NetworkIcon size={26} aria-hidden="true" />
          <strong>Bu filtrelerde müzisyen yok.</strong>
          <p>Konser eşiğini düşür veya başka bir mekan seç.</p>
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
      <div className="graph-footer">
        <span>
          {number(graph.nodes.length)} müzisyen <b>·</b> {number(edges.length)}{" "}
          bağ
        </span>
        <a href="https://bizimcaz.com" target="_blank" rel="noreferrer">
          Bizim Caz <ArrowUpRight size={10} />
        </a>
      </div>
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
