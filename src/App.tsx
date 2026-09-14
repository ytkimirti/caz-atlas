import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Network as NetworkIcon,
  ChevronDown,
  ArrowUpRight,
  AudioLines,
  Check,
  Focus,
  Info,
  Minus,
  Plus,
  Settings2,
  Search,
  SlidersHorizontal,
  X,
  Users,
} from "lucide-react";
import Network from "./Network";
import MusicianPortrait from "./MusicianPortrait";
import { searchAtlas } from "./search";
import type { SearchKind, SearchResult } from "./search";
import Timeline from "./Timeline";
import { playbackArrivals } from "./playback";
import { useSettingsPanel } from "./useSettingsPanel";
import {
  concertHistogram,
  concertEnsembles,
  createConcertWindow,
  firstPlaybackMonth,
  monthIndex,
  monthValue,
  readRange,
} from "./chronology";
import type { DateRange } from "./chronology";
import {
  DEFAULT_ENGINE,
  groupingOptions,
  parseResolution,
  layoutEngines,
  parseEngine,
  parseViewMode,
  parseSpacing,
  spacingOptions,
} from "./layout-options";
import type { LayoutStatus } from "./layout-options";
import type { NetworkHandle } from "./Network";
import type { Ensemble, GraphMusician } from "./types";
import { unpackRuntime } from "./runtime-data";
import type { ProjectData, RuntimeData } from "./runtime-data";
import { groupInfo, groups, normalize, number } from "./types";
import {
  adjacency,
  filterGraph,
  shortestPath,
  topCollaboratorEdges,
} from "./graph";

function AtlasSearch({
  nodes,
  ensembles,
  onEnsembleSelect,
  onOpen,
  projectsReady,
  projectError,
  onRetry,
  onSelect,
  onHover,
  selected,
}: {
  nodes: GraphMusician[];
  ensembles: Ensemble[];
  onEnsembleSelect: (id: string) => void;
  onOpen: () => void;
  projectsReady: boolean;
  projectError: boolean;
  onRetry: () => void;
  onSelect: (id: number) => void;
  onHover: (id: number | null) => void;
  selected: number | null;
}) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [cursor, setCursor] = useState(0);
  const wrap = useRef<HTMLDivElement>(null);
  const [kind, setKind] = useState<SearchKind>("all");
  const results = useMemo(
    () => searchAtlas(nodes, ensembles, query, kind),
    [nodes, ensembles, query, kind],
  );
  const active = results[Math.min(cursor, Math.max(0, results.length - 1))];
  function hover(result?: SearchResult) {
    onHover(result?.kind === "musician" ? result.musician.id : null);
  }
  useEffect(() => {
    if (open && active)
      document
        .getElementById(`search-option-${active.id}`)
        ?.scrollIntoView({ block: "nearest" });
  }, [open, active]);
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
  function choose(result: SearchResult) {
    if (result.kind === "musician") onSelect(result.musician.id);
    else onEnsembleSelect(result.ensemble.id);
    onHover(null);
    setOpen(false);
    setQuery("");
  }
  return (
    <div
      className="search-wrap"
      ref={wrap}
      onKeyDown={(event) => {
        if (event.key === "Escape") {
          event.stopPropagation();
          wrap.current?.querySelector("input")?.focus();
          setOpen(false);
          onHover(null);
        }
      }}
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
          placeholder="Müzisyen veya grup ara"
          aria-label="Müzisyen veya grup ara"
          role="combobox"
          aria-expanded={open}
          aria-controls="atlas-results"
          aria-autocomplete="list"
          aria-activedescendant={
            open && active ? `search-option-${active.id}` : undefined
          }
          value={query}
          onFocus={() => {
            setOpen(true);
            onOpen();
          }}
          onChange={(e) => {
            setQuery(e.target.value);
            setCursor(0);
            setOpen(true);
            onHover(null);
          }}
          onKeyDown={(e) => {
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
              hover(results[next]);
            }
            if (e.key === "Enter" && open && active) {
              e.preventDefault();
              choose(active);
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
          onMouseLeave={() => onHover(null)}
        >
          <div className="search-kinds" role="group" aria-label="Arama türü">
            {(
              [
                ["all", "Tümü"],
                ["musician", "Müzisyenler"],
                ["ensemble", "Gruplar"],
              ] as const
            ).map(([value, label]) => (
              <button
                key={value}
                aria-pressed={kind === value}
                onClick={() => {
                  setKind(value);
                  setCursor(0);
                  onHover(null);
                }}
              >
                {label}
              </button>
            ))}
          </div>
          <span className="search-caption">
            {query ? "ARAMA SONUÇLARI" : "ARŞİVİ KEŞFET"}
          </span>
          {selected !== null && (
            <p className="search-hint">
              Yolu görmek için bir müzisyenin üzerine gel.
            </p>
          )}
          <div
            id="atlas-results"
            role="listbox"
            aria-label="Müzisyenler ve gruplar"
          >
            {results.map((n, i) => (
              <button
                key={n.id}
                id={`search-option-${n.id}`}
                role="option"
                aria-selected={n.id === active?.id}
                className={n.id === active?.id ? "highlighted" : ""}
                onFocus={() => {
                  setCursor(i);
                  hover(n);
                }}
                onMouseMove={() => {
                  setCursor(i);
                  hover(n);
                }}
                onClick={() => choose(n)}
              >
                {n.kind === "musician" ? (
                  <i
                    className="color-dot"
                    style={{ background: groupInfo(n.musician.group).color }}
                  />
                ) : (
                  <Users size={15} aria-hidden="true" />
                )}
                <span>{n.name}</span>
                <small>
                  {n.kind === "musician"
                    ? groupInfo(n.musician.group).name
                    : `Grup · ${number(n.ensemble.concerts)} konser`}
                </small>
              </button>
            ))}
          </div>
          {!results.length && (kind === "musician" || projectsReady) && (
            <p role="status">Bu filtrelerde sonuç bulunamadı.</p>
          )}
          {kind !== "musician" &&
            !projectsReady &&
            (projectError ? (
              <button className="text-button" onClick={onRetry}>
                Gruplar yüklenemedi. Tekrar dene
              </button>
            ) : (
              <p role="status">Gruplar yükleniyor…</p>
            ))}
        </div>
      )}
    </div>
  );
}

export default function App() {
  const [data, setData] = useState<RuntimeData | null>(null);
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
    read("/data/runtime.json")
      .then(unpackRuntime)
      .then(setData)
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
          caz<span>-atlas</span>
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
  return <AtlasApp data={data} concerts={data.concerts} />;
}

const EMPTY_ENSEMBLES: Ensemble[] = [];

function AtlasApp({
  data,
  concerts,
}: {
  data: RuntimeData;
  concerts: RuntimeData["concerts"];
}) {
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
  const [playing, setPlaying] = useState(false);
  const [livePhysics, setLivePhysics] = useState(
    () => params.get("experience") === "live",
  );
  const changePlaying = useCallback((next: boolean) => {
    setPlaying(next);
  }, []);
  function changeExperience(live: boolean) {
    if (live === livePhysics) return;
    setPlaying(false);
    setLivePhysics(live);
  }
  function changeRange(next: DateRange) {
    setPlaying(false);
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
  const [viewOpen, setViewOpen] = useState(false);
  const [legendOpen, setLegendOpen] = useState(false);
  const [instrument, setInstrument] = useState(
    groups.some((g) => g.id === params.get("instrument"))
      ? params.get("instrument")!
      : "",
  );
  const [topCollaborators, setTopCollaborators] = useState<number | null>(
    params.get("top") === "all"
      ? null
      : [1, 3, 5, 10].includes(Number(params.get("top")))
        ? Number(params.get("top"))
        : 5,
  );
  const [mode, setMode] = useState(() => parseViewMode(params.get("view")));
  const [engine, setEngine] = useState(() => parseEngine(params.get("engine")));
  const [spacing, setSpacing] = useState(() =>
    parseSpacing(params.get("spacing")),
  );
  const [resolution, setResolution] = useState(() =>
    parseResolution(params.get("resolution")),
  );
  const [layoutStatus, setLayoutStatus] = useState<LayoutStatus>("pending");
  const [searchUsed, setSearchUsed] = useState(false);
  const [selectedEnsembleId, setSelectedEnsembleId] = useState<string | null>(
    params.get("g"),
  );
  const reportLayoutStatus = useCallback((status: LayoutStatus) => {
    setLayoutStatus(status);
    if (status === "fallback") setPlaying(false);
  }, []);
  const [projects, setProjects] = useState<ProjectData | null>(null);
  const [projectError, setProjectError] = useState(false);
  const [projectAttempt, setProjectAttempt] = useState(0);
  const [labels, setLabels] = useState(true);
  const [showEnsembles, setShowEnsembles] = useState(true);
  const [filtersOpen, setFiltersOpen] = useState(false);
  useSettingsPanel(filtersOpen ? "filters" : viewOpen ? "view-settings" : null);
  const [venueQuery, setVenueQuery] = useState("");
  const [selectedId, setSelectedId] = useState<number | null>(
    params.has("g")
      ? null
      : (data.nodes.find((n) => n.key === params.get("m"))?.id ?? null),
  );
  const [hoveredId, setHoveredId] = useState<number | null>(null);
  const network = useRef<NetworkHandle>(null);
  const byId = useMemo(() => new Map(data.nodes.map((n) => [n.id, n])), [data]);
  const venue = useMemo(
    () => concerts.venues.find((v) => v.id === venueId),
    [concerts, venueId],
  );
  const historyCounts = venue?.musicians ?? concerts.counts;
  const historyGraph = useMemo(
    () =>
      filterGraph(
        { nodes: data.nodes, edges: venue?.edges ?? concerts.edges },
        historyCounts,
        minConcerts,
        historyCounts,
      ),
    [data, concerts, historyCounts, minConcerts, venue],
  );
  useEffect(() => {
    setPlaying(false);
  }, [historyGraph, engine, mode, spacing, resolution]);
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
  const replayFrom = useMemo(
    () => firstPlaybackMonth(concerts.timeline, range, minConcerts, venueId),
    [concerts, range, minConcerts, venueId],
  );
  const arrivals = useMemo(
    () => playbackArrivals(concerts.timeline, range, minConcerts, venueId),
    [concerts, range, minConcerts, venueId],
  );
  const allDates = range[0] === bounds[0] && cursor === bounds[1];
  const knownEnsembles = projects?.ensembles ?? EMPTY_ENSEMBLES;
  const ensembles = useMemo(
    () =>
      allDates
        ? venue
          ? (projects?.venues[venue.id] ?? EMPTY_ENSEMBLES)
          : knownEnsembles
        : concertEnsembles(
            concerts.timeline,
            knownEnsembles,
            range[0],
            cursor,
            venueId,
          ),
    [
      allDates,
      venue,
      concerts,
      range[0],
      cursor,
      venueId,
      projects,
      knownEnsembles,
    ],
  );
  const selectedEnsemble =
    ensembles.find((ensemble) => ensemble.id === selectedEnsembleId) ?? null;
  const ensembleMembers = useMemo(
    () =>
      selectedEnsemble
        ? Object.entries(selectedEnsemble.musicians)
            .sort((a, b) => b[1] - a[1])
            .flatMap(([id, concerts]) => {
              const member = byId.get(Number(id));
              return member ? [{ member, concerts }] : [];
            })
        : [],
    [selectedEnsemble, byId],
  );
  const ensembleHighlights = useMemo(
    () => ensembleMembers.map(({ member }) => member.id),
    [ensembleMembers],
  );
  useEffect(() => {
    if (projects && selectedEnsembleId && !selectedEnsemble)
      setSelectedEnsembleId(null);
  }, [projects, selectedEnsembleId, selectedEnsemble]);
  const musicianEnsembles = useMemo(
    () =>
      ensembles
        .filter((e) => selectedId !== null && e.musicians[selectedId])
        .sort((a, b) => b.musicians[selectedId!] - a.musicians[selectedId!]),
    [ensembles, selectedId],
  );
  const counts = allDates ? historyCounts : windowed.counts;
  const graph = useMemo(
    () =>
      allDates
        ? historyGraph
        : filterGraph(
            { nodes: historyGraph.nodes, edges: windowed.edges },
            counts,
            minConcerts,
            counts,
          ),
    [allDates, historyGraph, windowed, counts, minConcerts],
  );
  const visibleIds = useMemo(
    () => new Set(graph.nodes.map((n) => n.id)),
    [graph],
  );
  const selected =
    selectedId !== null && visibleIds.has(selectedId) ? selectedId : null;
  const hovered =
    hoveredId !== null && visibleIds.has(hoveredId) ? hoveredId : null;
  const loadProjects =
    searchUsed ||
    selectedEnsembleId !== null ||
    selected !== null ||
    (showEnsembles && layoutStatus !== "pending");
  useEffect(() => {
    if (!loadProjects || projects) return;
    const controller = new AbortController();
    setProjectError(false);
    fetch("/data/projects.json", { signal: controller.signal })
      .then((response) => {
        if (!response.ok) throw new Error("Project data unavailable");
        return response.json() as Promise<ProjectData>;
      })
      .then(setProjects)
      .catch((error) => {
        if (error.name !== "AbortError") setProjectError(true);
      });
    return () => controller.abort();
  }, [loadProjects, projects, projectAttempt]);
  useEffect(() => {
    if (selectedId !== selected) setSelectedId(selected);
  }, [selected, selectedId]);
  useEffect(() => {
    setHoveredId(null);
  }, [graph]);
  const neighbors = useMemo(() => adjacency(graph), [graph]);
  const edges = useMemo(
    () => topCollaboratorEdges(graph.edges, topCollaborators),
    [graph, topCollaborators],
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
    if (range[0] !== bounds[0]) query.set("from", monthValue(range[0]));
    if (range[1] !== bounds[1]) query.set("to", monthValue(range[1]));
    if (cursor !== range[1]) query.set("at", monthValue(cursor));
    if (minConcerts !== 10)
      query.set("min", minConcerts === null ? "all" : String(minConcerts));
    if (venueId) query.set("venue", venueId);
    if (instrument) query.set("instrument", instrument);
    if (topCollaborators !== 5)
      query.set(
        "top",
        topCollaborators === null ? "all" : String(topCollaborators),
      );
    if (mode === "3d") query.set("view", mode);
    if (livePhysics) query.set("experience", "live");
    if (engine !== DEFAULT_ENGINE) query.set("engine", engine);
    if (resolution !== 1.5) query.set("resolution", String(resolution));
    if (spacing !== 1) query.set("spacing", String(spacing));
    if (selected !== null) query.set("m", byId.get(selected)!.key);
    if (selectedEnsembleId) query.set("g", selectedEnsembleId);
    window.history.replaceState(
      null,
      "",
      window.location.pathname + (query.size ? "?" + query : ""),
    );
  }, [
    minConcerts,
    venueId,
    instrument,
    topCollaborators,
    selected,
    selectedEnsembleId,
    byId,
    range,
    bounds,
    cursor,
    mode,
    livePhysics,
    engine,
    spacing,
    resolution,
  ]);
  useEffect(() => {
    const listener = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        document.getElementById("main-search")?.focus();
      }
      if (e.key === "Escape") {
        if (filtersOpen) setFiltersOpen(false);
        else if (viewOpen) setViewOpen(false);
        else if (legendOpen) setLegendOpen(false);
        else {
          setSelectedId(null);
          setSelectedEnsembleId(null);
          setHoveredId(null);
        }
      }
      if ((e.target as HTMLElement).matches("input, select, textarea, button"))
        return;
      if (e.key === "+" || e.key === "=") network.current?.zoom(1.3);
      if (e.key === "-") network.current?.zoom(1 / 1.3);
      if (e.key === "0") network.current?.fit();
    };
    window.addEventListener("keydown", listener);
    return () => window.removeEventListener("keydown", listener);
  }, [filtersOpen, viewOpen, legendOpen]);
  function resetFilters() {
    changeRange([...bounds]);
    setMinConcerts(null);
    setTopCollaborators(null);
    setVenueId("");
    setVenueQuery("");
  }
  function select(id: number | null) {
    setSelectedEnsembleId(null);
    setSelectedId(id);
  }
  function pick(id: number) {
    setSelectedEnsembleId(null);
    setSelectedId(id);
    if (mode === "2d" || selectedId === id) network.current?.focus(id);
  }

  return (
    <main className="atlas">
      <div className="layout-loading" data-state={layoutStatus}>
        {layoutStatus === "pending" && (
          <div
            className="layout-loading-track"
            role="progressbar"
            aria-label="Yerleşim hesaplanıyor"
          >
            <span />
          </div>
        )}
        <div
          className={
            layoutStatus === "ready" ? "sr-only" : "layout-loading-label"
          }
        >
          <span role="status" aria-live="polite" aria-atomic="true">
            {layoutStatus === "pending"
              ? "Yerleşim hesaplanıyor…"
              : layoutStatus === "fallback"
                ? "Yerleşim hesaplanamadı. Mevcut görünüm korunuyor."
                : "Yerleşim hazır"}
          </span>
          {layoutStatus === "fallback" && (
            <button
              className="layout-retry"
              onClick={() => network.current?.retryLayout()}
            >
              Tekrar hesapla
            </button>
          )}
        </div>
      </div>
      <Network
        ref={network}
        data={graph}
        layoutData={livePhysics ? historyGraph : graph}
        layoutCounts={livePhysics ? historyCounts : counts}
        playing={playing}
        livePhysics={livePhysics}
        edges={edges}
        counts={counts}
        ensembles={ensembles}
        ensembleEdges={
          allDates ? (venue?.edges ?? concerts.edges) : windowed.edges
        }
        showEnsembles={showEnsembles}
        selected={selected}
        hovered={hovered}
        path={path}
        labels={labels}
        instrument={instrument}
        highlightedIds={ensembleHighlights}
        engine={engine}
        mode={mode}
        spacing={spacing}
        resolution={resolution}
        onLayoutStatus={reportLayoutStatus}
        onSelect={select}
        onHover={setHoveredId}
      />
      {mode === "3d" && (
        <p id="spatial-help" className="sr-only">
          Sürükleyerek veya ok tuşlarıyla döndür. Shift ile taşı. Kaydırarak
          yakınlaş. Dokunmatik ekranda tek parmakla döndür, iki parmakla taşı ve
          yakınlaş. Seçilen müzisyenin etrafında döndürülür ve onun ağına
          odaklanılır.
        </p>
      )}
      <header className="app-header">
        <div className="identity">
          <div className="brand-icon" aria-hidden="true">
            <AudioLines size={23} />
          </div>
          <div>
            <h1 className="wordmark">
              caz<span>atlas</span>
              <i />
            </h1>
            <p>Türkiye’nin caz bağlantıları</p>
          </div>
          <div className="view-switch" role="group" aria-label="Graf boyutu">
            {(["2d", "3d"] as const).map((value) => (
              <button
                key={value}
                aria-pressed={mode === value}
                onClick={() => {
                  setMode(value);
                  setHoveredId(null);
                }}
              >
                {value.toUpperCase()}
              </button>
            ))}
          </div>
        </div>
        <div className="top-controls">
          <AtlasSearch
            nodes={ranked}
            ensembles={ensembles}
            projectsReady={projects !== null}
            projectError={projectError}
            onRetry={() => setProjectAttempt((n) => n + 1)}
            onOpen={() => setSearchUsed(true)}
            onEnsembleSelect={(id) => {
              setSelectedId(null);
              setHoveredId(null);
              setSelectedEnsembleId(id);
            }}
            selected={selected}
            onSelect={pick}
            onHover={setHoveredId}
          />
        </div>
        <div className="archive-meta">
          <span className="live-dot" />
          Birlikte çalmanın haritası
          <small>1956 · {Math.floor(bounds[1] / 12)}</small>
        </div>
      </header>
      <div className="explore-toolbar">
        <div className="toolbar-actions">
          <button
            className={`filter-toggle ${filtersOpen ? "active" : ""}`}
            aria-label="Filtreler"
            aria-expanded={filtersOpen}
            aria-controls="filters"
            onClick={() => {
              setFiltersOpen((v) => !v);
              setViewOpen(false);
            }}
          >
            <SlidersHorizontal size={16} />
            <span>Filtreler</span>
            {(minConcerts !== null || venueId || topCollaborators !== null) && (
              <b className="filter-count">
                {Number(minConcerts !== null) +
                  Number(Boolean(venueId)) +
                  Number(topCollaborators !== null)}
              </b>
            )}
          </button>
          <button
            className={`view-toggle ${viewOpen ? "active" : ""}`}
            aria-label="Görünüm"
            aria-expanded={viewOpen}
            aria-controls="view-settings"
            onClick={() => {
              setViewOpen((v) => !v);
              setFiltersOpen(false);
            }}
          >
            <Settings2 size={16} />
            <span>Görünüm</span>
            <ChevronDown size={13} />
          </button>
        </div>
      </div>
      {(filtersOpen || viewOpen) && (
        <div
          className="panel-backdrop"
          aria-hidden="true"
          onClick={() => {
            setFiltersOpen(false);
            setViewOpen(false);
          }}
        />
      )}
      {viewOpen && (
        <section
          id="view-settings"
          className="layout-controls surface"
          aria-label="Graf yerleşimi"
        >
          <div className="panel-heading">
            <div>
              <span className="section-caption">GÖRÜNÜM</span>
              <h2>Ağı düzenle</h2>
            </div>
            <button
              className="icon-button"
              aria-label="Görünümü kapat"
              onClick={() => setViewOpen(false)}
            >
              <X size={18} />
            </button>
          </div>
          {livePhysics ? (
            <p className="spatial-title">
              Canlı fizik · Oynatma ile hareket eder
            </p>
          ) : mode === "2d" ? (
            <>
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
                {
                  layoutEngines.find((option) => option.id === engine)!
                    .description
                }
              </p>
            </>
          ) : (
            <p className="spatial-title">Üç boyutlu ağ</p>
          )}
          {!livePhysics && mode === "2d" && engine === "communities" && (
            <div className="layout-spacing">
              <label htmlFor="community-detail">Gruplama</label>
              <select
                id="community-detail"
                value={resolution}
                onChange={(e) => setResolution(parseResolution(e.target.value))}
              >
                {groupingOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.name}
                  </option>
                ))}
              </select>
            </div>
          )}
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
          {mode === "3d" && (
            <>
              <p id="spatial-view-help">
                <span className="spatial-desktop-help">
                  Sürükleyerek döndür. Shift + sürükle ile taşı. Kaydırarak
                  yakınlaş. Graf odaktayken ok tuşlarıyla döndür, Shift + ok
                  tuşlarıyla taşı. Bir müzisyen seçince onun ağına odaklanırsın.
                </span>
                <span className="spatial-touch-help">
                  Tek parmakla döndür. İki parmakla taşı ve yakınlaş. Bir
                  müzisyene dokunarak ağına odaklan.
                </span>
              </p>
            </>
          )}
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
          {projectError && (
            <button
              className="text-button"
              onClick={() => setProjectAttempt((n) => n + 1)}
            >
              Grup bilgilerini tekrar yükle
            </button>
          )}
          <p className="layout-feedback">
            {layoutStatus === "pending"
              ? "Yerleşim hesaplanıyor…"
              : layoutStatus === "fallback"
                ? "Yerleşim hesaplanamadı. Tekrar deneyebilir veya başka bir yerleşim seçebilirsin."
                : "Yerleşim hazır"}
          </p>
        </section>
      )}

      {(minConcerts !== null || venue || topCollaborators !== null) && (
        <div className="active-filters">
          {topCollaborators !== null && (
            <button
              onClick={() => setTopCollaborators(null)}
              aria-label="Bağlantı sınırını kaldır"
            >
              Kişi başına ilk {topCollaborators} bağlantı
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
            <div>
              <span className="section-caption">KEŞFİNİ ÖZELLEŞTİR</span>
              <h2>Filtreler</h2>
            </div>
            <button
              className="icon-button"
              aria-label="Filtreleri kapat"
              onClick={() => setFiltersOpen(false)}
            >
              <X size={16} />
            </button>
          </div>
          <div className="filter-body">
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
              <div className="field-heading">
                <span>Kişi başına bağlantı</span>
              </div>
              <div className="presets">
                {[1, 3, 5, 10, null].map((n) => (
                  <button
                    key={n ?? "all"}
                    aria-label={
                      n === null
                        ? "Tüm bağlantılar"
                        : `Kişi başına ilk ${n} bağlantı`
                    }
                    aria-pressed={topCollaborators === n}
                    onClick={() => setTopCollaborators(n)}
                  >
                    {n ?? "Tümü"}
                  </button>
                ))}
              </div>
              <p className="field-note">
                En güçlü ortaklıkları göster. Bir müzisyeni seçtiğinde tüm
                bağlantıları açılır.
              </p>
            </div>
          </div>
          <div className="filter-footer">
            <span>{number(graph.nodes.length)} müzisyen</span>
            <button className="subtle-button" onClick={resetFilters}>
              Filtreleri temizle
            </button>
          </div>
          <button
            className="primary-button filter-done"
            onClick={() => setFiltersOpen(false)}
          >
            <Check size={16} /> Sonuçları keşfet
          </button>
        </section>
      )}

      <section className="instrument-explorer" aria-label="Enstrüman vurgulama">
        <div className="instrument-control">
          <AudioLines size={16} aria-hidden="true" />
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
          <div className="instrument-results surface">
            <p
              id="instrument-summary"
              className="instrument-summary"
              aria-live="polite"
            >
              Ağda {number(highlightedMusicians.length)} müzisyen vurgulanıyor.
            </p>
            {!musician && !selectedEnsemble && (
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
          </div>
        )}
      </section>

      {selectedEnsemble && (
        <section
          className={`selection-panel surface ${filtersOpen ? "with-filters" : ""}`}
          aria-label="Seçili grup"
        >
          <div className="panel-heading">
            <span className="section-caption">SEÇİLİ GRUP / PROJE</span>
            <button
              className="icon-button"
              aria-label="Seçimi kaldır"
              onClick={() => {
                setSelectedEnsembleId(null);
                setHoveredId(null);
              }}
            >
              <X size={16} />
            </button>
          </div>
          <div className="ensemble-avatar">
            <Users size={28} aria-hidden="true" />
          </div>
          <h2>{selectedEnsemble.name}</h2>
          <p className="musician-meta">
            {venue ? venue.name : "Seçili tarih aralığında"}
          </p>
          <div className="musician-stats">
            <div>
              <strong>{number(selectedEnsemble.concerts)}</strong>
              <span>konser</span>
            </div>
            <div>
              <strong>{number(ensembleMembers.length)}</strong>
              <span>müzisyen</span>
            </div>
          </div>
          <p className="field-note">
            Konser kadrolarıdır; kalıcı grup üyeliği anlamına gelmez.
          </p>
          {ensembleMembers.some(({ member }) => !visibleIds.has(member.id)) && (
            <button
              className="text-button ensemble-reveal"
              onClick={() => setMinConcerts(null)}
            >
              Tüm kadroyu haritada göster
            </button>
          )}
          <div className="collaborator-heading">
            <span>Konserlerdeki kadro</span>
            <small>Konser</small>
          </div>
          <div
            className="collaborators"
            onMouseLeave={() => setHoveredId(null)}
          >
            {ensembleMembers.map(({ member, concerts }) => (
              <button
                key={member.id}
                onClick={() => {
                  if (!visibleIds.has(member.id)) setMinConcerts(null);
                  setHoveredId(null);
                  pick(member.id);
                }}
                onMouseEnter={() => setHoveredId(member.id)}
                onFocus={() => setHoveredId(member.id)}
                onBlur={() => setHoveredId(null)}
              >
                <i
                  className="color-dot"
                  style={{ background: groupInfo(member.group).color }}
                />
                <span>{member.name}</span>
                <small>{number(concerts)}</small>
                <ArrowUpRight size={14} aria-hidden="true" />
              </button>
            ))}
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
          <MusicianPortrait key={musician.key} musician={musician} />
          <h2>{musician.name}</h2>
          <p className="musician-meta">
            <i
              className="color-dot"
              style={{ background: groupInfo(musician.group).color }}
            />
            {groupInfo(musician.group).name}
          </p>
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
                <i className="collaborator-rank" aria-hidden="true">
                  {String(i + 1).padStart(2, "0")}
                </i>
                <span>{byId.get(c.id)!.name}</span>
                <small>{number(c.weight)}</small>
                <ArrowUpRight
                  className="row-arrow"
                  size={14}
                  aria-hidden="true"
                />
              </button>
            ))}
            {!collaborators.length && <p>Bu filtrelerde bağlantısı yok.</p>}
          </div>
          {!projects && (
            <p className="field-note" aria-live="polite">
              {projectError ? (
                <button
                  className="text-button"
                  onClick={() => setProjectAttempt((n) => n + 1)}
                >
                  Grup bilgileri yüklenemedi. Tekrar dene
                </button>
              ) : (
                "Grup bilgileri yükleniyor…"
              )}
            </p>
          )}
          {musicianEnsembles.length > 0 && (
            <div className="musician-ensembles">
              <span className="section-caption">GRUP / PROJE</span>
              <ul>
                {musicianEnsembles.map((ensemble) => (
                  <li key={`${musician.id}:${ensemble.id}`}>
                    <details>
                      <summary>
                        <ChevronDown size={14} aria-hidden="true" />
                        <span>{ensemble.name}</span>
                        <small>
                          {number(ensemble.musicians[musician.id])} konser
                        </small>
                      </summary>
                      <div className="ensemble-roster collaborators">
                        <div className="collaborator-heading">
                          <span>Kadro</span>
                          <span>Konser</span>
                        </div>
                        {Object.entries(ensemble.musicians)
                          .sort((a, b) => b[1] - a[1])
                          .map(([id, concerts]) => {
                            const member = byId.get(Number(id));
                            if (!member) return null;
                            return (
                              <button
                                key={id}
                                aria-current={
                                  member.id === musician.id ? "true" : undefined
                                }
                                onClick={() => {
                                  if (!visibleIds.has(member.id))
                                    setMinConcerts(null);
                                  setHoveredId(null);
                                  pick(member.id);
                                }}
                                onMouseEnter={() => setHoveredId(member.id)}
                                onMouseLeave={() => setHoveredId(null)}
                                onFocus={() => setHoveredId(member.id)}
                                onBlur={() => setHoveredId(null)}
                              >
                                <span>{member.name}</span>
                                <small>{number(concerts)}</small>
                              </button>
                            );
                          })}
                      </div>
                    </details>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </section>
      )}

      {!graph.nodes.length && (
        <div className="empty-state surface" role="status">
          <NetworkIcon size={26} aria-hidden="true" />
          <strong>Bu filtrelerde müzisyen yok.</strong>
          <p>Konser eşiğini düşür veya tarih aralığını genişlet.</p>
          <button className="text-button" onClick={resetFilters}>
            Filtreleri temizle
          </button>
        </div>
      )}
      <div className="graph-status" aria-live="polite">
        {hoveredMusician && (selected === null || hovered === selected) ? (
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
        ) : null}
      </div>
      <div className="graph-tools">
        <div className="graph-help">
          <button
            className={`legend-toggle surface ${legendOpen ? "active" : ""}`}
            aria-label="Harita rehberi"
            aria-expanded={legendOpen}
            onClick={() => setLegendOpen((v) => !v)}
          >
            <Info size={16} />
            <span>Harita rehberi</span>
          </button>
          <p>
            {mode === "3d"
              ? "Sürükleyerek döndür, bağlantıları keşfet."
              : "Bir müzisyen seç, bağlantılarını keşfet."}
          </p>
        </div>
        {legendOpen && (
          <section className="graph-legend surface" aria-label="Harita rehberi">
            <div className="panel-heading">
              <h2>Her nokta bir müzisyen.</h2>
              <button
                className="icon-button"
                aria-label="Rehberi kapat"
                onClick={() => setLegendOpen(false)}
              >
                <X size={16} />
              </button>
            </div>
            <p>
              Nokta büyüklüğü konser sayısını, çizgiler birlikte çalan
              müzisyenleri gösterir.
            </p>
            <div className="legend-groups">
              {groups.map((group) => (
                <button
                  key={group.id}
                  aria-pressed={instrument === group.id}
                  onClick={() =>
                    setInstrument(instrument === group.id ? "" : group.id)
                  }
                >
                  <i
                    className="color-dot"
                    style={{ background: group.color }}
                  />
                  {group.name}
                </button>
              ))}
            </div>
            <p className="legend-shortcuts">
              Sürükle: taşı · Kaydır: yakınlaş · Esc: seçimi kaldır
            </p>
          </section>
        )}
        <div
          className="zoom-controls surface"
          aria-label="Yakınlaştırma kontrolleri"
        >
          <button
            className="icon-button"
            aria-label="Yakınlaştır"
            title="Yakınlaştır (+)"
            onClick={() => network.current?.zoom(1.3)}
          >
            <Plus size={18} />
          </button>
          <button
            className="icon-button"
            aria-label="Uzaklaştır"
            title="Uzaklaştır (-)"
            onClick={() => network.current?.zoom(1 / 1.3)}
          >
            <Minus size={18} />
          </button>
          <span />
          <button
            className="icon-button"
            aria-label={mode === "3d" ? "Görünümü sıfırla" : "Ekrana sığdır"}
            title="Ekrana sığdır (0)"
            onClick={() => network.current?.fit()}
          >
            <Focus size={18} />
          </button>
        </div>
      </div>
      <Timeline
        bounds={bounds}
        range={range}
        cursor={cursor}
        replayFrom={replayFrom}
        arrivals={arrivals}
        histogram={histogram}
        musicians={graph.nodes.length}
        edges={edges.length}
        concerts={windowed.concerts}
        playing={playing}
        livePhysics={livePhysics}
        onExperienceChange={changeExperience}
        onPlayingChange={changePlaying}
        calculating={layoutStatus === "pending"}
        onRange={changeRange}
        onCursor={setCursor}
      />
    </main>
  );
}
