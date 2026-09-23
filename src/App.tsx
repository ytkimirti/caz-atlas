import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Network as NetworkIcon,
  AudioLines,
  Check,
  Focus,
  Minus,
  Plus,
  Settings2,
  Search,
  SlidersHorizontal,
  X,
  Users,
} from "lucide-react";
import Network from "./Network";
import InstrumentIcon from "./InstrumentIcon";
import {
  EnsembleInspector,
  InspectorShell,
  InstrumentInspector,
  MusicianInspector,
} from "./Inspector";
import type { InspectorNav } from "./Inspector";
import { searchAtlas } from "./search";
import type { SearchKind, SearchResult } from "./search";
import Timeline from "./Timeline";
import { playbackArrivals } from "./playback";
import { useSettingsPanel } from "./useSettingsPanel";
import { useNavigation } from "./useNavigation";
import type { NavEntry } from "./useNavigation";
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
  groupingOptions,
  parseResolution,
  parseViewMode,
  parseSpacing,
  spacingOptions,
} from "./layout-options";
import type { LayoutStatus } from "./layout-options";
import type { NetworkHandle } from "./Network";
import type { Ensemble, GraphMusician } from "./types";
import { seedDefaultLayout, unpackRuntime } from "./runtime-data";
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
  searchRequest,
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
  searchRequest: number;
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
  useEffect(() => {
    if (!searchRequest) return;
    // Wait for settings cleanup to remove inert from the mobile header.
    wrap.current?.querySelector("input")?.focus();
    setOpen(true);
    setCursor(0);
    onHover(null);
    onOpen();
  }, [searchRequest, onHover, onOpen]);
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
        if (event.key === "Escape" && open && !event.nativeEvent.isComposing) {
          event.preventDefault();
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
          onClick={() => {
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
            if (e.nativeEvent.isComposing) return;
            if (e.key === "ArrowDown" || e.key === "ArrowUp") {
              e.preventDefault();
              setOpen(true);
              const current = Math.min(cursor, results.length - 1);
              const next = open
                ? Math.max(
                    0,
                    Math.min(
                      results.length - 1,
                      current + (e.key === "ArrowDown" ? 1 : -1),
                    ),
                  )
                : e.key === "ArrowDown"
                  ? 0
                  : Math.max(0, results.length - 1);
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
              setOpen(true);
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
                  <InstrumentIcon group={n.musician.group} size={15} />
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
      .then((runtime) => {
        seedDefaultLayout(runtime);
        setData(runtime);
      })
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
const EMPTY_IDS: number[] = [];
// "N+" keeps musicians with at least N concerts; 1+ is the unfiltered map.
const CONCERT_PRESETS = [1, 2, 3, 5, 10, 50];
const TOP_PRESETS = [null, 1, 3, 5, 10] as const;
const TIMELINE_KEY = "caz-atlas:timeline-collapsed";

function readMinimum(value: string | null) {
  const n = Number(value);
  return value && Number.isInteger(n) && n > 1 ? n : null;
}

function Segmented<T extends string | number>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: readonly { value: T; name: string }[];
  onChange: (value: T) => void;
}) {
  return (
    <div className="setting-row">
      <span>{label}</span>
      <div className="presets" role="group" aria-label={label}>
        {options.map((option) => (
          <button
            key={option.value}
            aria-pressed={value === option.value}
            onClick={() => onChange(option.value)}
          >
            {option.name}
          </button>
        ))}
      </div>
    </div>
  );
}

function Toggle({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label className="switch-row">
      <span>{label}</span>
      <input
        type="checkbox"
        role="switch"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
      />
    </label>
  );
}

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
  const [timelineCollapsed, setTimelineCollapsed] = useState(
    () => localStorage.getItem(TIMELINE_KEY) === "1",
  );
  function changeTimelineCollapsed(collapsed: boolean) {
    setTimelineCollapsed(collapsed);
    localStorage.setItem(TIMELINE_KEY, collapsed ? "1" : "0");
  }
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
  const [minConcerts, setMinConcerts] = useState<number | null>(() =>
    readMinimum(params.get("min")),
  );
  // Graph helpers keep musicians with more than this many concerts.
  const moreThan = minConcerts === null ? null : minConcerts - 1;
  const [venueId, setVenueId] = useState(
    concerts.venues.some((v) => v.id === params.get("venue"))
      ? params.get("venue")!
      : "",
  );
  const [viewOpen, setViewOpen] = useState(false);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [popoverLeft, setPopoverLeft] = useState(24);
  const [instrument, setInstrument] = useState(
    groups.some((g) => g.id === params.get("instrument"))
      ? params.get("instrument")!
      : "",
  );
  const [topCollaborators, setTopCollaborators] = useState<number | null>(
    [1, 3, 5, 10].includes(Number(params.get("top")))
      ? Number(params.get("top"))
      : null,
  );
  const [mode, setMode] = useState(() => parseViewMode(params.get("view")));
  const [spacing, setSpacing] = useState(() =>
    parseSpacing(params.get("spacing")),
  );
  const [resolution, setResolution] = useState(() =>
    parseResolution(params.get("resolution")),
  );
  const [layoutStatus, setLayoutStatus] = useState<LayoutStatus>("pending");
  const [searchUsed, setSearchUsed] = useState(false);
  const [searchRequest, setSearchRequest] = useState(0);
  const markSearchUsed = useCallback(() => setSearchUsed(true), []);
  const initialEntry = useMemo<NavEntry>(() => {
    const ensemble = params.get("g");
    if (ensemble) return { kind: "ensemble", id: ensemble };
    const musician = data.nodes.find((n) => n.key === params.get("m"));
    return musician ? { kind: "musician", id: musician.id } : null;
  }, [params, data]);
  const nav = useNavigation(initialEntry);
  const selectedId = nav.entry?.kind === "musician" ? nav.entry.id : null;
  const selectedEnsembleId =
    nav.entry?.kind === "ensemble" ? nav.entry.id : null;
  const reportLayoutStatus = useCallback((status: LayoutStatus) => {
    setLayoutStatus(status);
    if (status === "fallback") setPlaying(false);
  }, []);
  const [projects, setProjects] = useState<ProjectData | null>(null);
  const [projectError, setProjectError] = useState(false);
  const [projectAttempt, setProjectAttempt] = useState(0);
  const [labels, setLabels] = useState(true);
  const [showEnsembles, setShowEnsembles] = useState(true);
  useSettingsPanel(filtersOpen ? "filters" : viewOpen ? "view-settings" : null);
  const [venueQuery, setVenueQuery] = useState("");
  const [hoveredId, setHoveredId] = useState<number | null>(null);
  const [previewEnsembleId, setPreviewEnsembleId] = useState<string | null>(
    null,
  );
  const [mapEnsembleId, setMapEnsembleId] = useState<string | null>(null);
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
        moreThan,
        historyCounts,
      ),
    [data, concerts, historyCounts, moreThan, venue],
  );
  useEffect(() => {
    setPlaying(false);
  }, [historyGraph, mode, spacing, resolution]);
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
    () => firstPlaybackMonth(concerts.timeline, range, moreThan, venueId),
    [concerts, range, moreThan, venueId],
  );
  const arrivals = useMemo(
    () => playbackArrivals(concerts.timeline, range, moreThan, venueId),
    [concerts, range, moreThan, venueId],
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
  const ensemblesById = useMemo(
    () => new Map(ensembles.map((e) => [e.id, e])),
    [ensembles],
  );
  const selectedEnsemble =
    (selectedEnsembleId && ensemblesById.get(selectedEnsembleId)) || null;
  // Until projects load the id is all there is; after that, an unknown or
  // filtered-out group no longer counts as selected.
  const ensembleSelected =
    selectedEnsembleId !== null && (!projects || selectedEnsemble !== null);
  const previewEnsemble =
    (previewEnsembleId && ensemblesById.get(previewEnsembleId)) || null;
  const mapEnsemble =
    (mapEnsembleId && ensemblesById.get(mapEnsembleId)) || null;
  const rosterOf = useCallback(
    (ensemble: Ensemble | null) =>
      ensemble
        ? Object.entries(ensemble.musicians)
            .sort((a, b) => b[1] - a[1])
            .flatMap(([id, concerts]) => {
              const member = byId.get(Number(id));
              return member ? [{ member, concerts }] : [];
            })
        : [],
    [byId],
  );
  const ensembleMembers = useMemo(
    () => rosterOf(selectedEnsemble),
    [rosterOf, selectedEnsemble],
  );
  const selectedRoster = useMemo(
    () =>
      ensembleMembers.length
        ? ensembleMembers.map(({ member }) => member.id)
        : EMPTY_IDS,
    [ensembleMembers],
  );
  const previewRoster = useMemo(
    () =>
      previewEnsemble
        ? Object.keys(previewEnsemble.musicians).map(Number)
        : EMPTY_IDS,
    [previewEnsemble],
  );
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
            moreThan,
            counts,
          ),
    [allDates, historyGraph, windowed, counts, moreThan],
  );
  const visibleIds = useMemo(
    () => new Set(graph.nodes.map((n) => n.id)),
    [graph],
  );
  const selected =
    selectedId !== null && visibleIds.has(selectedId) ? selectedId : null;
  const hovered =
    hoveredId !== null && visibleIds.has(hoveredId) ? hoveredId : null;
  // Frame the regulars; one-off guests often sit in other scenes.
  const frameIds = useMemo(() => {
    const shown = ensembleMembers.filter(({ member }) =>
      visibleIds.has(member.id),
    );
    const top = shown[0]?.concerts ?? 0;
    return shown
      .filter(({ concerts }) => concerts >= top / 4)
      .map(({ member }) => member.id);
  }, [ensembleMembers, visibleIds]);
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
    setHoveredId(null);
  }, [graph]);
  useEffect(() => {
    setPreviewEnsembleId(null);
    setHoveredId(null);
  }, [nav.entry]);
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
  const groupCounts = useMemo(() => {
    const result = new Map<string, number>();
    for (const node of graph.nodes) {
      const id = groupInfo(node.group).id;
      result.set(id, (result.get(id) ?? 0) + 1);
    }
    return result;
  }, [graph]);
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

  useEffect(() => {
    const query = new URLSearchParams();
    if (range[0] !== bounds[0]) query.set("from", monthValue(range[0]));
    if (range[1] !== bounds[1]) query.set("to", monthValue(range[1]));
    if (cursor !== range[1]) query.set("at", monthValue(cursor));
    if (minConcerts !== null) query.set("min", String(minConcerts));
    if (venueId) query.set("venue", venueId);
    if (instrument) query.set("instrument", instrument);
    if (topCollaborators !== null) query.set("top", String(topCollaborators));
    if (mode === "3d") query.set("view", mode);
    if (livePhysics) query.set("experience", "live");
    if (resolution !== 1.5) query.set("resolution", String(resolution));
    if (spacing !== 1) query.set("spacing", String(spacing));
    if (selected !== null) query.set("m", byId.get(selected)!.key);
    if (ensembleSelected) query.set("g", selectedEnsembleId!);
    // Keep the navigation record attached to this history entry.
    window.history.replaceState(
      window.history.state,
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
    ensembleSelected,
    byId,
    range,
    bounds,
    cursor,
    mode,
    livePhysics,
    spacing,
    resolution,
  ]);
  const navigate = nav.navigate;
  const hasSelection = selected !== null || ensembleSelected;
  useEffect(() => {
    const listener = (e: KeyboardEvent) => {
      if (e.isComposing) return;
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setFiltersOpen(false);
        setViewOpen(false);
        setSearchRequest((request) => request + 1);
        return;
      }
      if (e.key === "Escape") {
        if (filtersOpen) setFiltersOpen(false);
        else if (viewOpen) setViewOpen(false);
        else if (hasSelection) {
          navigate(null);
          setHoveredId(null);
        } else if (instrument) setInstrument("");
      }
      if ((e.target as HTMLElement).matches("input, select, textarea, button"))
        return;
      if (e.key === "+" || e.key === "=") network.current?.zoom(1.3);
      if (e.key === "-") network.current?.zoom(1 / 1.3);
      if (e.key === "0") network.current?.fit();
    };
    window.addEventListener("keydown", listener);
    return () => window.removeEventListener("keydown", listener);
  }, [filtersOpen, viewOpen, hasSelection, instrument, navigate]);
  function resetFilters() {
    changeRange([...bounds]);
    setMinConcerts(null);
    setTopCollaborators(null);
    setVenueId("");
    setVenueQuery("");
  }
  const selectFromGraph = useCallback(
    (id: number | null) =>
      navigate(id === null ? null : { kind: "musician", id }),
    [navigate],
  );
  function pick(id: number) {
    if (!visibleIds.has(id)) setMinConcerts(null);
    setHoveredId(null);
    navigate({ kind: "musician", id });
    if (mode === "2d" || selectedId === id) network.current?.focus(id);
  }
  const openEnsemble = useCallback(
    (id: string) => {
      setPreviewEnsembleId(null);
      setMapEnsembleId(null);
      if (selectedEnsembleId === id) network.current?.frameGroup();
      else navigate({ kind: "ensemble", id });
    },
    [navigate, selectedEnsembleId],
  );
  function entryLabel(entry: NavEntry | undefined) {
    if (entry === undefined) return "Kayıtlı görünüm";
    if (entry === null) return "Genel görünüm";
    if (entry.kind === "musician")
      return byId.get(entry.id)?.name ?? "Müzisyen";
    return ensemblesById.get(entry.id)?.name ?? "Grup";
  }
  const inspectorNav: InspectorNav = {
    canGoBack: nav.canGoBack,
    canGoForward: nav.canGoForward,
    backLabel: entryLabel(nav.previous),
    forwardLabel: entryLabel(nav.next),
    back: nav.back,
    forward: nav.forward,
  };
  const actions = {
    onMusician: pick,
    onEnsemble: openEnsemble,
    onPreviewEnsemble: setPreviewEnsembleId,
    onHover: setHoveredId,
    onInstrument: setInstrument,
  };
  const place = venue ? venue.name : allDates ? "Tüm arşiv" : "Seçili dönem";
  const activeFilters =
    Number(minConcerts !== null) +
    Number(Boolean(venueId)) +
    Number(topCollaborators !== null);
  function togglePopover(
    event: React.MouseEvent<HTMLButtonElement>,
    which: "filters" | "view",
  ) {
    setPopoverLeft(
      Math.max(
        12,
        Math.min(
          event.currentTarget.getBoundingClientRect().left,
          window.innerWidth - 352,
        ),
      ),
    );
    setFiltersOpen(which === "filters" ? (v) => !v : false);
    setViewOpen(which === "view" ? (v) => !v : false);
  }
  const highlight = previewEnsemble ?? mapEnsemble ?? selectedEnsemble;

  return (
    <main className={`atlas ${timelineCollapsed ? "timeline-collapsed" : ""}`}>
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
        livePhysics={livePhysics}
        edges={edges}
        counts={counts}
        ensembles={ensembles}
        showEnsembles={showEnsembles}
        selected={selected}
        hovered={hovered}
        path={path}
        labels={labels}
        instrument={instrument}
        highlightedIds={
          previewEnsemble
            ? previewRoster
            : selectedEnsemble && !mapEnsemble
              ? selectedRoster
              : EMPTY_IDS
        }
        highlightLabel={highlight?.name ?? null}
        frameIds={frameIds}
        mode={mode}
        spacing={spacing}
        resolution={resolution}
        onLayoutStatus={reportLayoutStatus}
        onSelect={selectFromGraph}
        onHover={setHoveredId}
        onSelectEnsemble={openEnsemble}
        onHoverEnsemble={setMapEnsembleId}
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
            <AudioLines size={20} />
          </div>
          <h1 className="wordmark">
            caz<span>atlas</span>
            <i />
          </h1>
        </div>
        <AtlasSearch
          nodes={ranked}
          ensembles={ensembles}
          projectsReady={projects !== null}
          projectError={projectError}
          onRetry={() => setProjectAttempt((n) => n + 1)}
          searchRequest={searchRequest}
          onOpen={markSearchUsed}
          onEnsembleSelect={openEnsemble}
          selected={selected}
          onSelect={pick}
          onHover={setHoveredId}
        />
        <div className="toolbar-actions" role="toolbar" aria-label="Görünüm">
          <button
            className={`toolbar-button ${filtersOpen ? "active" : ""}`}
            aria-label="Filtreler"
            aria-expanded={filtersOpen}
            aria-controls="filters"
            onClick={(e) => togglePopover(e, "filters")}
          >
            <SlidersHorizontal size={15} />
            <span>Filtreler</span>
            {activeFilters > 0 && (
              <b className="filter-count">{activeFilters}</b>
            )}
          </button>
          <button
            className={`toolbar-button ${viewOpen ? "active" : ""}`}
            aria-label="Görünüm"
            aria-expanded={viewOpen}
            aria-controls="view-settings"
            onClick={(e) => togglePopover(e, "view")}
          >
            <Settings2 size={15} />
            <span>Görünüm</span>
          </button>
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
      </header>

      {activeFilters > 0 && (
        <div className="active-filters">
          {minConcerts !== null && (
            <button
              onClick={() => setMinConcerts(null)}
              aria-label="Konser sayısı filtresini kaldır"
            >
              En az {number(minConcerts)} konser
              <X size={12} />
            </button>
          )}
          {topCollaborators !== null && (
            <button
              onClick={() => setTopCollaborators(null)}
              aria-label="Bağlantı sınırını kaldır"
            >
              Kişi başına ilk {topCollaborators} bağ
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
          className="layout-controls popover surface"
          aria-label="Görünüm ayarları"
          style={{ left: popoverLeft }}
        >
          <div className="panel-heading">
            <h2>Görünüm</h2>
            <button
              className="icon-button"
              aria-label="Görünümü kapat"
              onClick={() => setViewOpen(false)}
            >
              <X size={16} />
            </button>
          </div>
          {!livePhysics && mode === "2d" && (
            <Segmented
              label="Gruplama"
              value={resolution}
              options={groupingOptions}
              onChange={setResolution}
            />
          )}
          <Segmented
            label="Aralık"
            value={spacing}
            options={spacingOptions}
            onChange={setSpacing}
          />
          <div className="settings-divider" />
          <Toggle
            label="Müzisyen isimleri"
            checked={labels}
            onChange={setLabels}
          />
          <Toggle
            label="Grup / proje adları"
            checked={showEnsembles}
            onChange={setShowEnsembles}
          />
          {projectError && (
            <button
              className="text-button"
              onClick={() => setProjectAttempt((n) => n + 1)}
            >
              Grup bilgilerini tekrar yükle
            </button>
          )}
        </section>
      )}

      {filtersOpen && (
        <section
          id="filters"
          className="filter-panel popover surface"
          aria-label="Graf filtreleri"
          style={{ left: popoverLeft }}
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
          <div className="filter-body">
            <div className="filter-section">
              <div className="field-heading">
                <span id="concert-min-label">En az konser</span>
              </div>
              <div
                className="presets"
                role="group"
                aria-labelledby="concert-min-label"
              >
                {CONCERT_PRESETS.map((n) => (
                  <button
                    key={n}
                    aria-label={`En az ${n} konser`}
                    aria-pressed={(minConcerts ?? 1) === n}
                    onClick={() => setMinConcerts(n === 1 ? null : n)}
                  >
                    {n}+
                  </button>
                ))}
              </div>
            </div>
            <div className="filter-section">
              <div className="field-heading">
                <span id="top-label">Kişi başına bağlantı</span>
              </div>
              <div className="presets" role="group" aria-labelledby="top-label">
                {TOP_PRESETS.map((n) => (
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
            </div>
            <div className="filter-section">
              <div className="field-heading">
                <label htmlFor="venue-search">Mekan</label>
                {venue && (
                  <button
                    className="subtle-button"
                    onClick={() => setVenueId("")}
                  >
                    Tüm mekanlar
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
                  {!venueId && <Check size={14} />}
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
                    <small>{number(v.concerts)} konser</small>
                  </button>
                ))}
                {!venues.length && <p>Mekan bulunamadı.</p>}
              </div>
            </div>
          </div>
          <div className="filter-footer">
            <span>
              <strong>{number(graph.nodes.length)}</strong> müzisyen
            </span>
            {activeFilters > 0 && (
              <button className="subtle-button" onClick={resetFilters}>
                Filtreleri temizle
              </button>
            )}
          </div>
          <button
            className="primary-button filter-done"
            onClick={() => setFiltersOpen(false)}
          >
            <Check size={16} /> Sonuçları göster
          </button>
        </section>
      )}

      {(selectedEnsemble || musician || instrument) && (
        <InspectorShell
          {...(selectedEnsemble
            ? {
                label: "Seçili grup",
                caption: "GRUP / PROJE",
                contentKey: `g:${selectedEnsemble.id}`,
              }
            : musician
              ? {
                  label: "Seçili müzisyen",
                  caption: "MÜZİSYEN",
                  contentKey: `m:${musician.id}`,
                }
              : {
                  label: "Vurgulanan enstrüman",
                  caption: "ENSTRÜMAN",
                  contentKey: `i:${instrument}`,
                })}
          closeLabel={
            selectedEnsemble || musician
              ? "Seçimi kaldır"
              : "Vurgulamayı kaldır"
          }
          nav={inspectorNav}
          onClose={() =>
            selectedEnsemble || musician ? navigate(null) : setInstrument("")
          }
        >
          {selectedEnsemble ? (
            <EnsembleInspector
              key={selectedEnsemble.id}
              ensemble={selectedEnsemble}
              members={ensembleMembers}
              visibleIds={visibleIds}
              place={place}
              onFrame={() => network.current?.frameGroup()}
              onRevealAll={() => setMinConcerts(null)}
              actions={actions}
            />
          ) : musician ? (
            <MusicianInspector
              key={musician.id}
              musician={musician}
              concerts={counts[musician.id] ?? 0}
              collaborators={collaborators}
              ensembles={musicianEnsembles}
              byId={byId}
              projects={projects ? "ready" : projectError ? "error" : "loading"}
              onRetryProjects={() => setProjectAttempt((n) => n + 1)}
              actions={actions}
            />
          ) : (
            <InstrumentInspector
              group={instrument}
              musicians={highlightedMusicians}
              counts={counts}
              place={place}
              actions={actions}
            />
          )}
        </InspectorShell>
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
            <InstrumentIcon group={hoveredMusician.group} size={14} />
            <strong>{hoveredMusician.name}</strong>
            <span>
              {groupInfo(hoveredMusician.group).name} ·{" "}
              {number(counts[hoveredMusician.id] ?? 0)} konser ·{" "}
              {number(neighbors.get(hovered!)?.length ?? 0)} bağ
            </span>
          </div>
        ) : mapEnsemble ? (
          <div className="hover-readout surface">
            <Users size={14} aria-hidden="true" />
            <strong>{mapEnsemble.name}</strong>
            <span>
              {number(Object.keys(mapEnsemble.musicians).length)} müzisyen ·{" "}
              {number(mapEnsemble.concerts)} konser
            </span>
          </div>
        ) : null}
      </div>
      <div className="graph-tools">
        <nav
          className="instrument-legend surface"
          aria-label="Enstrüman renkleri"
        >
          {groups.map((group) => (
            <button
              key={group.id}
              aria-pressed={instrument === group.id}
              title={`${group.name}: haritada vurgula`}
              onClick={() =>
                setInstrument(instrument === group.id ? "" : group.id)
              }
              style={{ "--tone": group.color } as React.CSSProperties}
            >
              <InstrumentIcon group={group.id} size={16} />
              <span>{group.name}</span>
              <small>{number(groupCounts.get(group.id) ?? 0)}</small>
            </button>
          ))}
        </nav>
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
        collapsed={timelineCollapsed}
        onCollapsedChange={changeTimelineCollapsed}
        onExperienceChange={changeExperience}
        onPlayingChange={changePlaying}
        calculating={layoutStatus === "pending"}
        onRange={changeRange}
        onCursor={setCursor}
      />
    </main>
  );
}
