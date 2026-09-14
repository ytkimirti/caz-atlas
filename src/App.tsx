import { useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties, ReactNode } from "react";
import {
  ArrowDownToLine,
  ArrowRight,
  ArrowUpRight,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Command,
  Disc3,
  Expand,
  GitBranch,
  Globe2,
  Info,
  Maximize,
  Minus,
  Music2,
  Network as NetworkIcon,
  Orbit,
  Pause,
  Play,
  Plus,
  Route,
  Search,
  Shuffle,
  SlidersHorizontal,
  Sparkles,
  Volume2,
  VolumeX,
  X,
} from "lucide-react";
import Network from "./Network";
import type { NetworkHandle } from "./Network";
import type { Atlas, Mode, Musician } from "./types";
import { groupInfo, groups, normalize, number } from "./types";
import { adjacency, shortestPath } from "./graph";

function MusicianSearch({
  nodes,
  onSelect,
  placeholder = "Bir müzisyen ara...",
  inputId,
  value = "",
}: {
  nodes: Musician[];
  onSelect: (node: Musician) => void;
  placeholder?: string;
  inputId?: string;
  value?: string;
}) {
  const [query, setQuery] = useState(value),
    [open, setOpen] = useState(false),
    [cursor, setCursor] = useState(0);
  const wrap = useRef<HTMLDivElement>(null);
  useEffect(() => {
    setQuery(value);
  }, [value]);
  useEffect(() => {
    const listener = (event: MouseEvent) => {
      if (!wrap.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", listener);
    return () => document.removeEventListener("mousedown", listener);
  }, []);
  const results = useMemo(() => {
    const q = normalize(query);
    return nodes
      .filter((n) => normalize(n.name + " " + n.key).includes(q))
      .slice(0, 8);
  }, [nodes, query]);
  function choose(node: Musician) {
    onSelect(node);
    setQuery(value ? node.name : "");
    setOpen(false);
  }
  return (
    <div className="search-wrap" ref={wrap}>
      <div className={"search-field " + (open ? "focused" : "")}>
        <Search size={16} />
        <input
          id={inputId}
          value={query}
          placeholder={placeholder}
          aria-label={placeholder}
          role="combobox"
          aria-autocomplete="list"
          aria-expanded={open}
          aria-controls={`${inputId || "musician"}-results`}
          aria-activedescendant={
            open && results[cursor]
              ? `${inputId || "musician"}-option-${cursor}`
              : undefined
          }
          onFocus={() => setOpen(true)}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
            setCursor(0);
          }}
          onKeyDown={(e) => {
            if (e.key === "ArrowDown") {
              e.preventDefault();
              setOpen(true);
              setCursor((c) => Math.min(c + 1, results.length - 1));
            }
            if (e.key === "ArrowUp") {
              e.preventDefault();
              setCursor((c) => Math.max(0, c - 1));
            }
            if (e.key === "Enter" && open && results[cursor]) {
              e.preventDefault();
              choose(results[cursor]);
            }
            if (e.key === "Escape") {
              setOpen(false);
              e.stopPropagation();
            }
          }}
        />
        {inputId === "main-search" && <kbd>⌘ K</kbd>}
      </div>
      {open && (
        <div
          className="search-results"
          role="listbox"
          id={`${inputId || "musician"}-results`}
        >
          {results.map((n, i) => (
            <button
              role="option"
              aria-selected={i === cursor}
              id={`${inputId || "musician"}-option-${i}`}
              key={n.id}
              className={i === cursor ? "highlighted" : ""}
              onClick={() => choose(n)}
            >
              <i style={{ background: groupInfo(n.group).color }} />
              <span>
                {n.name}
                <small>{groupInfo(n.group).name}</small>
              </span>
              <small>{number(n.degree)}</small>
            </button>
          ))}
          {!results.length && <p>Bu isimle bir müzisyen bulunamadı.</p>}
        </div>
      )}
    </div>
  );
}
function Modal({
  title,
  children,
  onClose,
}: {
  title: string;
  children: ReactNode;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    ref.current?.showModal();
  }, []);
  return (
    <dialog
      ref={ref}
      className="modal"
      onCancel={onClose}
      onClick={(e) => {
        if (e.target === ref.current) onClose();
      }}
    >
      <div className="modal-top">
        <span className="eyebrow">CAZ ATLASI / NOTLAR</span>
        <button
          className="icon-button"
          onClick={onClose}
          aria-label="Pencereyi kapat"
        >
          <X size={18} />
        </button>
      </div>
      <h2>{title}</h2>
      {children}
    </dialog>
  );
}
function useJam(playing: boolean, audible: boolean) {
  useEffect(() => {
    if (!playing || !audible) return;
    const context = new AudioContext();
    let step = 0;
    const master = context.createGain();
    master.gain.value = 0.12;
    master.connect(context.destination);
    const chords = [
      [130.81, 164.81, 196, 246.94],
      [110, 130.81, 164.81, 196],
      [146.83, 174.61, 220, 261.63],
      [98, 123.47, 146.83, 174.61],
    ];
    function note(
      frequency: number,
      duration: number,
      volume: number,
      type: OscillatorType = "sine",
    ) {
      const oscillator = context.createOscillator(),
        gain = context.createGain(),
        now = context.currentTime;
      oscillator.type = type;
      oscillator.frequency.value = frequency;
      gain.gain.setValueAtTime(0, now);
      gain.gain.linearRampToValueAtTime(volume, now + 0.025);
      gain.gain.exponentialRampToValueAtTime(0.001, now + duration);
      oscillator.connect(gain);
      gain.connect(master);
      oscillator.start(now);
      oscillator.stop(now + duration + 0.1);
    }
    const timer = window.setInterval(() => {
      const chord = chords[Math.floor(step / 8) % 4];
      if (step % 4 === 0)
        chord.forEach((f) => note(f * 2, 1.1, 0.18, "triangle"));
      if (step % 2 === 0) note(chord[Math.floor(step / 2) % 4] / 2, 0.35, 0.7);
      if (step % 3 === 0) note(chord[step % 4] * 4, 0.22, 0.1);
      step++;
    }, 235);
    void context.resume();
    return () => {
      clearInterval(timer);
      void context.close();
    };
  }, [playing, audible]);
}
const modes: {
  id: Mode;
  title: string;
  subtitle: string;
  icon: typeof Orbit;
  tag?: string;
}[] = [
  {
    id: "network",
    title: "Takımyıldız",
    subtitle: "Bütün sahne, tek bir evren.",
    icon: Orbit,
  },
  {
    id: "islands",
    title: "Enstrüman adaları",
    subtitle: "Aynı sesin etrafında buluş.",
    icon: Music2,
  },
  {
    id: "record",
    title: "Plak koleksiyonu",
    subtitle: "Bu ağın bir de B yüzü var.",
    icon: Disc3,
    tag: "PLAY",
  },
  {
    id: "path",
    title: "Aramızda kaç nota?",
    subtitle: "İki müzisyen, en kısa yol.",
    icon: Route,
  },
];
export default function App() {
  const [data, setData] = useState<Atlas | null>(null),
    [error, setError] = useState(""),
    [attempt, setAttempt] = useState(0);
  useEffect(() => {
    const abort = new AbortController();
    setError("");
    fetch("/data/atlas.json", { signal: abort.signal })
      .then((r) => {
        if (!r.ok) throw new Error("Veri dosyası yüklenemedi.");
        return r.json();
      })
      .then(setData)
      .catch((e) => {
        if (e.name !== "AbortError") setError(e.message);
      });
    return () => abort.abort();
  }, [attempt]);
  return data ? (
    <AtlasApp data={data} />
  ) : (
    <div className="loading-screen">
      <div className="brand-icon">
        <NetworkIcon />
      </div>
      <h1>
        caz atlası<span>®</span>
      </h1>
      {error ? (
        <>
          <p>{error}</p>
          <button
            className="primary-button"
            onClick={() => setAttempt((v) => v + 1)}
          >
            Tekrar dene <ArrowRight size={16} />
          </button>
        </>
      ) : (
        <>
          <div className="loading-orbit">
            <i />
            <i />
            <i />
          </div>
          <p>Müzisyenler aynı sahnede buluşuyor...</p>
        </>
      )}
    </div>
  );
}
function AtlasApp({ data }: { data: Atlas }) {
  const params = new URLSearchParams(window.location.search);
  const initialMode = params.get("mode");
  const [mode, setMode] = useState<Mode>(
    modes.some((m) => m.id === initialMode) ? (initialMode as Mode) : "network",
  );
  const [selected, setSelected] = useState<number | null>(
    data.nodes.find((n) => n.key === params.get("m"))?.id ?? null,
  );
  const [instrument, setInstrument] = useState<string | null>(null),
    [labels, setLabels] = useState(true),
    [playing, setPlaying] = useState(false),
    [audible, setAudible] = useState(false);
  const [tab, setTab] = useState<"explore" | "archive">("explore"),
    [about, setAbout] = useState(false),
    [zoom, setZoom] = useState(1),
    [toast, setToast] = useState("");
  const [from, setFrom] = useState<number | null>(
      data.nodes.find((n) => n.key === params.get("from"))?.id ?? null,
    ),
    [to, setTo] = useState<number | null>(
      data.nodes.find((n) => n.key === params.get("to"))?.id ?? null,
    );
  const [archiveQuery, setArchiveQuery] = useState(""),
    [archivePage, setArchivePage] = useState(0),
    [sort, setSort] = useState("degree"),
    [connectionQuery, setConnectionQuery] = useState("");
  const network = useRef<NetworkHandle>(null),
    graphArea = useRef<HTMLDivElement>(null);
  const byId = useMemo(() => new Map(data.nodes.map((n) => [n.id, n])), [data]);
  const neighbors = useMemo(() => adjacency(data), [data]);
  const ranked = useMemo(
    () => [...data.nodes].sort((a, b) => b.degree - a.degree),
    [data],
  );
  const counts = useMemo(
    () =>
      new Map(
        groups.map((g) => [
          g.id,
          data.nodes.filter((n) => n.group === g.id).length,
        ]),
      ),
    [data],
  );
  const path = useMemo(
    () =>
      mode === "path" && from !== null && to !== null
        ? shortestPath(neighbors, from, to)
        : [],
    [mode, from, to, neighbors],
  );
  const musician = selected === null ? null : byId.get(selected)!;
  const collaborators = useMemo(
    () =>
      selected === null
        ? []
        : (neighbors.get(selected) || []).filter((n) =>
            normalize(byId.get(n.id)!.name).includes(
              normalize(connectionQuery),
            ),
          ),
    [selected, neighbors, byId, connectionQuery],
  );
  const archive = useMemo(
    () =>
      data.nodes
        .filter(
          (n) =>
            normalize(n.name + " " + n.key).includes(normalize(archiveQuery)) &&
            (!instrument || n.group === instrument),
        )
        .sort((a, b) =>
          sort === "degree"
            ? b.degree - a.degree
            : a.name.localeCompare(b.name, "tr"),
        ),
    [data, archiveQuery, instrument, sort],
  );
  useJam(playing, audible);
  useEffect(() => {
    setConnectionQuery("");
  }, [selected]);
  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(""), 3200);
    return () => clearTimeout(timer);
  }, [toast]);
  useEffect(() => {
    const q = new URLSearchParams();
    if (mode !== "network") q.set("mode", mode);
    if (selected !== null) q.set("m", byId.get(selected)!.key);
    if (mode === "path" && from !== null) q.set("from", byId.get(from)!.key);
    if (mode === "path" && to !== null) q.set("to", byId.get(to)!.key);
    window.history.replaceState(
      null,
      "",
      window.location.pathname + (q.size ? "?" + q.toString() : ""),
    );
  }, [mode, selected, from, to, byId]);
  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key === "k") {
        event.preventDefault();
        document.getElementById("main-search")?.focus();
      }
      if (event.key === "Escape") {
        setSelected(null);
        setInstrument(null);
      }
      if ((event.target as HTMLElement).matches("input, textarea, select"))
        return;
      if (event.key === "+" || event.key === "=") network.current?.zoom(1.3);
      if (event.key === "-") network.current?.zoom(1 / 1.3);
      if (event.key === "0") network.current?.fit();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);
  function pick(node: Musician, focus = false) {
    setSelected(node.id);
    setTab("explore");
    if (focus) setTimeout(() => network.current?.focus(node.id), 50);
  }
  function surprise() {
    const candidates = instrument
      ? ranked.filter((n) => n.group === instrument)
      : ranked;
    const node = candidates[Math.floor(Math.random() * candidates.length)];
    if (node) {
      pick(node);
      setToast(
        `${node.name} ile tanış. ${number(node.degree)} bağlantı keşfedilmeyi bekliyor.`,
      );
    }
  }
  async function share() {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setToast("Bu keşfin bağlantısı kopyalandı.");
    } catch {
      setToast("Bağlantıyı adres çubuğundan kopyalayabilirsin.");
    }
  }
  async function fullscreen() {
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else await graphArea.current?.requestFullscreen();
    } catch {
      setToast("Bu tarayıcı tam ekranı desteklemiyor.");
    }
  }
  const reset = () => {
    setSelected(null);
    setInstrument(null);
    setFrom(null);
    setTo(null);
    network.current?.fit();
  };
  return (
    <div className="app-shell">
      <header className="topbar">
        <button
          className="brand"
          onClick={() => {
            setTab("explore");
            setMode("network");
            reset();
          }}
          aria-label="Caz atlası ana görünüm"
        >
          <span className="brand-icon">
            <NetworkIcon size={23} />
          </span>
          caz atlası<span className="brand-period">.</span>
          <span className="beta">BİR KEŞİF ALANI</span>
        </button>
        <nav aria-label="Ana gezinme">
          <button
            className={tab === "explore" ? "nav-active" : ""}
            onClick={() => setTab("explore")}
          >
            Keşfet
          </button>
          <button
            className={tab === "archive" ? "nav-active" : ""}
            onClick={() => setTab("archive")}
          >
            Müzisyenler <span>{number(data.nodes.length)}</span>
          </button>
          <button onClick={() => setAbout(true)}>
            Hikâyesi <ArrowUpRight size={13} />
          </button>
        </nav>
        <a
          className="source-link"
          href="https://bizimcaz.com"
          target="_blank"
          rel="noreferrer"
        >
          <span>Veri dostumuz</span>Bizim Caz <ArrowUpRight size={14} />
        </a>
      </header>
      <div className="workspace">
        <aside className="sidebar">
          <div className="sidebar-top">
            <span className="eyebrow">BİRAZ MERAK, BOLCA CAZ.</span>
            <h2>
              Kulak ver.
              <br />
              Bağlantıyı keşfet.
            </h2>
            <MusicianSearch
              nodes={ranked}
              onSelect={(n) => pick(n)}
              inputId="main-search"
            />
          </div>
          <div className="sidebar-scroll">
            <div className="section-label">
              KEŞİF MODU <SlidersHorizontal size={12} />
            </div>
            <div className="mode-list">
              {modes.map((m) => (
                <button
                  key={m.id}
                  className={
                    "mode-card " + (mode === m.id ? "mode-active" : "")
                  }
                  onClick={() => {
                    setMode(m.id);
                    setTab("explore");
                    setSelected(null);
                  }}
                >
                  <span className="mode-icon">
                    <m.icon size={20} strokeWidth={1.5} />
                  </span>
                  <span>
                    <strong>
                      {m.title} {m.tag && <em>{m.tag}</em>}
                    </strong>
                    <small>{m.subtitle}</small>
                  </span>
                  {mode === m.id && <span className="active-dot" />}
                </button>
              ))}
            </div>
            {mode === "path" && (
              <div className="path-form">
                <div className="section-label">İKİ İSİM SEÇ</div>
                <label>İlk nota</label>
                <MusicianSearch
                  inputId="path-from"
                  nodes={ranked}
                  value={from !== null ? byId.get(from)!.name : ""}
                  placeholder="Başlangıç müzisyeni"
                  onSelect={(n) => {
                    setFrom(n.id);
                    setSelected(null);
                  }}
                />
                <div className="path-connector">
                  <span />
                  <Route size={13} />
                  <span />
                </div>
                <label>Son nota</label>
                <MusicianSearch
                  inputId="path-to"
                  nodes={ranked}
                  value={to !== null ? byId.get(to)!.name : ""}
                  placeholder="Varış müzisyeni"
                  onSelect={(n) => {
                    setTo(n.id);
                    setSelected(null);
                  }}
                />
                {from !== null && to !== null && (
                  <div className="path-result">
                    {path.length ? (
                      <>
                        <strong>
                          {path.length === 1
                            ? "Aynı nota!"
                            : `${path.length - 1} bağlantıyla buluştular.`}
                        </strong>
                        <div className="path-stops">
                          {path.map((id, i) => (
                            <button
                              key={id}
                              onClick={() => network.current?.focus(id)}
                            >
                              <i>{i + 1}</i>
                              {byId.get(id)!.name}
                            </button>
                          ))}
                        </div>
                      </>
                    ) : (
                      <p>
                        Arşivde bu iki isim arasında kayıtlı bir yol bulunamadı.
                        Eksik kaynak kayıtları da buna neden olabilir.
                      </p>
                    )}
                  </div>
                )}
              </div>
            )}
            <div className="instrument-section">
              <div className="section-label">
                SAHNENİN RENKLERİ{" "}
                <button
                  onClick={() => {
                    setInstrument(null);
                    setArchivePage(0);
                  }}
                  className="text-button"
                >
                  Tümü
                </button>
              </div>
              {groups.map((g) => (
                <button
                  key={g.id}
                  className={
                    "instrument-row " +
                    (instrument === g.id ? "instrument-active" : "")
                  }
                  onClick={() => {
                    setInstrument(instrument === g.id ? null : g.id);
                    setArchivePage(0);
                  }}
                  aria-pressed={instrument === g.id}
                >
                  <i style={{ background: g.color }} />
                  <span>{g.name}</span>
                  <div className="mini-bar">
                    <b
                      style={{
                        width: `${(counts.get(g.id)! / Math.max(...counts.values())) * 100}%`,
                        background: g.color,
                      }}
                    />
                  </div>
                  <small>{number(counts.get(g.id)!)}</small>
                </button>
              ))}
            </div>
            <div className="sidebar-note">
              <Sparkles size={17} />
              <p>
                Her nokta bir müzisyen.
                <br />
                Her çizgi ortak bir hikâye.
              </p>
              <button
                className="icon-button"
                aria-label="Veri hakkında bilgi"
                onClick={() => setAbout(true)}
              >
                <Info size={14} />
              </button>
            </div>
          </div>
          <div className="sidebar-bottom">
            <button className="surprise-button" onClick={surprise}>
              <Shuffle size={17} />
              <span>Beni şaşırt</span>
              <ArrowUpRight size={17} />
            </button>
            <div className="made-with">
              MERAKLA HARİTALANDI <span>✳</span> CAZLA BİRLEŞTİ
            </div>
          </div>
        </aside>
        <main className="main-content">
          <section className="intro">
            <div>
              <div className="eyebrow">
                <span className="tiny-star">✳</span> TÜRKİYE'DEN DÜNYAYA, CAZIN
                BAĞLANTI ATLASI
              </div>
              <h1>
                {tab === "archive" ? (
                  <>
                    Sahnedeki <span>herkes.</span>
                  </>
                ) : (
                  <>
                    Kim, kiminle <span>çaldı?</span>
                  </>
                )}
              </h1>
              <p>
                {tab === "archive"
                  ? "Tanıdık isimler, yeni keşifler. Arşivin tamamı burada."
                  : "İsimlerin ötesine bak. Aynı sahnede buluşan bir evreni keşfet."}
              </p>
            </div>
            <div className="intro-stats">
              <div>
                <strong>{number(data.nodes.length)}</strong>
                <span>MÜZİSYEN</span>
              </div>
              <b>×</b>
              <div>
                <strong>{number(data.edges.length)}</strong>
                <span>BAĞLANTI</span>
              </div>
            </div>
          </section>
          {tab === "explore" ? (
            <div className="graph-area" ref={graphArea}>
              <div className="graph-toolbar">
                <div className="all-network">
                  <span className="live-dot" />
                  <strong>
                    {instrument ? groupInfo(instrument).name : "Tüm ağ"}
                  </strong>
                  <span>
                    {instrument
                      ? `${number(counts.get(instrument)!)} vurgulandı`
                      : "Herkes aynı sahnede"}
                  </span>
                  {instrument && (
                    <button
                      onClick={() => setInstrument(null)}
                      aria-label="Enstrüman vurgusunu kaldır"
                    >
                      <X size={12} />
                    </button>
                  )}
                </div>
                <div className="toolbar-actions">
                  <button
                    className={"label-toggle " + (labels ? "on" : "")}
                    onClick={() => setLabels(!labels)}
                    aria-pressed={labels}
                  >
                    <span>Aa</span>
                    <span>İsimler</span>
                    <i />
                  </button>
                  <span className="toolbar-divider" />
                  <button
                    className="icon-button"
                    aria-label="Grafı PNG olarak indir"
                    title="Grafı indir"
                    onClick={() => network.current?.export()}
                  >
                    <ArrowDownToLine size={16} />
                  </button>
                  <button
                    className="icon-button"
                    aria-label="Tam ekran"
                    title="Tam ekran"
                    onClick={fullscreen}
                  >
                    <Expand size={16} />
                  </button>
                </div>
              </div>
              <Network
                ref={network}
                data={data}
                mode={mode}
                selected={selected}
                instrument={instrument}
                labels={labels}
                playing={playing}
                path={path}
                onSelect={setSelected}
                onZoom={setZoom}
              />
              <div className="graph-corner-label">
                <span>FIG. 0{modes.findIndex((m) => m.id === mode) + 1}</span>
                <span>
                  {modes
                    .find((m) => m.id === mode)!
                    .title.toLocaleUpperCase("tr-TR")}
                </span>
              </div>
              {mode === "network" && !musician && (
                <div className="graph-annotation">
                  <span />
                  <p>
                    Aynı sahneyi paylaşanlar,
                    <br />
                    aynı evrende buluşur.
                  </p>
                  <Sparkles size={15} />
                </div>
              )}
              {musician && (
                <section
                  className="musician-panel"
                  aria-label="Müzisyen detayları"
                >
                  <div className="panel-top">
                    <span className="eyebrow">SAHNEDEN BİR İSİM</span>
                    <button
                      className="icon-button"
                      aria-label="Müzisyen kartını kapat"
                      onClick={() => setSelected(null)}
                    >
                      <X size={17} />
                    </button>
                  </div>
                  <div
                    className="musician-avatar"
                    style={
                      {
                        "--artist-color": groupInfo(musician.group).color,
                      } as CSSProperties
                    }
                  >
                    <Disc3 size={35} strokeWidth={1} />
                    <span>
                      {musician.name
                        .split(" ")
                        .map((w) => w[0])
                        .slice(0, 2)
                        .join("")}
                    </span>
                  </div>
                  <h2>{musician.name}</h2>
                  <div className="artist-meta">
                    <i
                      style={{ background: groupInfo(musician.group).color }}
                    />
                    {groupInfo(musician.group).name}
                    {musician.city && musician.city !== "Unknown" && (
                      <span>· {musician.city}</span>
                    )}
                  </div>
                  <div className="artist-numbers">
                    <strong>{number(musician.degree)}</strong>
                    <span>müzisyenle bağlantılı</span>
                    <button
                      className="icon-button"
                      title="Müzisyene yakınlaş"
                      aria-label="Müzisyene yakınlaş"
                      onClick={() => network.current?.focus(musician.id)}
                    >
                      <Maximize size={16} />
                    </button>
                  </div>
                  {musician.coverage !== "available" && (
                    <p className="coverage-note">
                      {musician.coverage === "pending"
                        ? "Bu ismin kendi ağ kaydı henüz alınmadı."
                        : "Kaynak, bu ismin kendi ağ kaydını sunmuyor."}{" "}
                      Varsa diğer kayıtlardaki bağlantıları gösteriliyor.
                    </p>
                  )}
                  <div className="panel-links">
                    <a
                      href={`https://bizimcaz.com/musician/${encodeURIComponent(musician.key)}`}
                      target="_blank"
                      rel="noreferrer"
                    >
                      Kaynak profili <ArrowUpRight size={13} />
                    </a>
                    <button onClick={share}>
                      Keşfi paylaş <ArrowUpRight size={13} />
                    </button>
                  </div>
                  <div className="collaborator-heading">
                    <span className="section-label">KİMLERLE BULUŞTU?</span>
                    <span>{number(musician.degree)}</span>
                  </div>
                  {musician.degree > 8 && (
                    <input
                      className="connection-search"
                      placeholder="Bağlantılarında ara..."
                      aria-label="Bağlantılarında ara"
                      value={connectionQuery}
                      onChange={(e) => setConnectionQuery(e.target.value)}
                    />
                  )}
                  <div className="collaborators">
                    {collaborators.map(({ id, weight }) => {
                      const n = byId.get(id)!;
                      return (
                        <div className="collaborator" key={id}>
                          <button onClick={() => setSelected(id)}>
                            <i style={{ background: groupInfo(n.group).color }}>
                              {n.name
                                .split(" ")
                                .map((w) => w[0])
                                .slice(0, 2)
                                .join("")}
                            </i>
                            <span>
                              {n.name}
                              <small>{groupInfo(n.group).name}</small>
                            </span>
                          </button>
                          <a
                            title={`Ortak konser kayıtları. Kaynaktaki ilişki ağırlığı: ${weight}`}
                            aria-label={`${musician.name} ve ${n.name} ortak konser kayıtları`}
                            href={`https://bizimcaz.com/concerts/musician/${encodeURIComponent(musician.key)}/${encodeURIComponent(n.key)}`}
                            target="_blank"
                            rel="noreferrer"
                          >
                            <ArrowUpRight size={14} />
                          </a>
                        </div>
                      );
                    })}
                    {!collaborators.length && (
                      <p className="empty-copy">
                        {musician.degree
                          ? "Bu aramayla eşleşen bağlantı yok."
                          : "Bu veri kesitinde kayıtlı bağlantı yok."}
                      </p>
                    )}
                  </div>
                  <button
                    className="find-path-button"
                    onClick={() => {
                      setFrom(musician.id);
                      setTo(null);
                      setMode("path");
                      setSelected(null);
                    }}
                  >
                    Bu isimden bir yol çiz <Route size={15} />
                  </button>
                </section>
              )}
              <div className="graph-bottom">
                <div className="graph-hints">
                  <span>
                    <Command size={12} /> Kaydır, yakınlaş
                  </span>
                  <i />
                  <span>Sürükle, keşfet</span>
                  <i />
                  <button onClick={reset}>
                    Bütünü gör <ArrowUpRight size={12} />
                  </button>
                </div>
                <div className="zoom-control">
                  <button
                    onClick={() => network.current?.zoom(1 / 1.3)}
                    aria-label="Uzaklaştır"
                  >
                    <Minus size={15} />
                  </button>
                  <button
                    className="zoom-value"
                    onClick={() => network.current?.fit()}
                    title="Ağın tamamını sığdır"
                  >
                    {Math.round(zoom * 100)}%
                  </button>
                  <button
                    onClick={() => network.current?.zoom(1.3)}
                    aria-label="Yakınlaştır"
                  >
                    <Plus size={15} />
                  </button>
                  <span />
                  <button
                    onClick={() => network.current?.fit()}
                    aria-label="Tüm ağı ekrana sığdır"
                  >
                    <Maximize size={14} />
                  </button>
                </div>
              </div>
            </div>
          ) : (
            <section className="archive-area">
              <div className="archive-toolbar">
                <div className="search-field">
                  <Search size={16} />
                  <input
                    placeholder="Arşivde bir isim ara..."
                    aria-label="Arşivde ara"
                    value={archiveQuery}
                    onChange={(e) => {
                      setArchiveQuery(e.target.value);
                      setArchivePage(0);
                    }}
                  />
                </div>
                <label className="archive-sort">
                  <select
                    aria-label="Müzisyenleri sırala"
                    value={sort}
                    onChange={(e) => {
                      setSort(e.target.value);
                      setArchivePage(0);
                    }}
                  >
                    <option value="degree">En çok bağlantı</option>
                    <option value="name">İsme göre A-Z</option>
                  </select>
                  <ChevronDown size={14} />
                </label>
              </div>
              <div className="archive-summary">
                {number(archive.length)} müzisyen{" "}
                {instrument && (
                  <button onClick={() => setInstrument(null)}>
                    {groupInfo(instrument).name} <X size={12} />
                  </button>
                )}
              </div>
              <div className="archive-grid">
                {archive
                  .slice(archivePage * 48, (archivePage + 1) * 48)
                  .map((n, i) => (
                    <button
                      className="archive-card"
                      key={n.id}
                      onClick={() => pick(n)}
                    >
                      <span className="archive-rank">
                        {String(archivePage * 48 + i + 1).padStart(2, "0")}
                      </span>
                      <span
                        className="archive-avatar"
                        style={
                          {
                            "--artist-color": groupInfo(n.group).color,
                          } as CSSProperties
                        }
                      >
                        {n.name
                          .split(" ")
                          .map((w) => w[0])
                          .slice(0, 2)
                          .join("")}
                      </span>
                      <strong>
                        {n.name}
                        <small>
                          <i style={{ background: groupInfo(n.group).color }} />
                          {groupInfo(n.group).name}
                        </small>
                      </strong>
                      <span className="archive-degree">
                        {number(n.degree)}
                        <GitBranch size={13} />
                      </span>
                      <ArrowUpRight size={15} />
                    </button>
                  ))}
              </div>
              {!archive.length && (
                <div className="archive-empty">
                  <Search size={30} />
                  <h3>Burada henüz bir nota yok.</h3>
                  <p>Başka bir isim dene veya enstrüman filtresini kaldır.</p>
                </div>
              )}
              <div className="pagination">
                <span>
                  {archive.length ? archivePage * 48 + 1 : 0} -{" "}
                  {Math.min((archivePage + 1) * 48, archive.length)} /{" "}
                  {number(archive.length)}
                </span>
                <div>
                  <button
                    disabled={archivePage === 0}
                    onClick={() => setArchivePage((p) => p - 1)}
                    aria-label="Önceki sayfa"
                  >
                    <ChevronLeft size={16} />
                  </button>
                  <span>
                    {archivePage + 1} /{" "}
                    {Math.max(1, Math.ceil(archive.length / 48))}
                  </span>
                  <button
                    disabled={(archivePage + 1) * 48 >= archive.length}
                    onClick={() => setArchivePage((p) => p + 1)}
                    aria-label="Sonraki sayfa"
                  >
                    <ChevronRight size={16} />
                  </button>
                </div>
              </div>
            </section>
          )}
          <footer className="bottom-bar">
            <div className="jam-player">
              <button
                className={"play-button " + (playing ? "playing" : "")}
                onClick={() => setPlaying(!playing)}
                aria-label={
                  playing ? "Jam session durdur" : "Jam session başlat"
                }
              >
                {playing ? (
                  <Pause size={14} fill="currentColor" />
                ) : (
                  <Play size={14} fill="currentColor" />
                )}
              </button>
              <span>
                <strong>
                  Jam session <em>DENE</em>
                </strong>
                <small>
                  {playing
                    ? "Bağlantılar ritme karışıyor."
                    : "Ağın ritmini hisset."}
                </small>
              </span>
              <div className={"equalizer " + (playing ? "moving" : "")}>
                {[6, 12, 18, 10, 22, 15, 8, 18, 12, 6, 16, 9].map((h, i) => (
                  <i
                    key={i}
                    style={{ height: h, animationDelay: `${i * -0.12}s` }}
                  />
                ))}
              </div>
              <button
                className="icon-button"
                onClick={() => {
                  setAudible(!audible);
                  if (!audible) setPlaying(true);
                }}
                aria-label={audible ? "Sesi kapat" : "Üretilen caz ritmini aç"}
                title="Bu uygulama için üretilen sentetik caz döngüsü"
              >
                {audible ? <Volume2 size={16} /> : <VolumeX size={16} />}
              </button>
            </div>
            <div className="footer-note">
              <Globe2 size={13} />
              <span>
                {data.meta.complete
                  ? "Arşiv taraması tamamlandı"
                  : `Arşiv taranıyor · ${number(data.meta.pendingCount)} kayıt bekliyor`}
              </span>
              <i />
              <button onClick={() => setAbout(true)}>
                Veri & yöntem <ArrowUpRight size={12} />
              </button>
            </div>
          </footer>
        </main>
      </div>
      {toast && (
        <div className="toast" role="status">
          <Check size={16} />
          {toast}
        </div>
      )}
      {about && (
        <Modal
          title="Caz, birlikte çalınca güzel."
          onClose={() => setAbout(false)}
        >
          <p className="modal-lead">
            Bir solo ile başlar, binlerce hikâyeye bağlanır. Caz atlası,
            müzisyenlerin ortak sahnelerini keşfetmek için yapılmış bağımsız bir
            harita.
          </p>
          <div className="about-stats">
            <div>
              <strong>{number(data.meta.archiveCount)}</strong>
              <span>arşivdeki isim</span>
            </div>
            <div>
              <strong>{number(data.edges.length)}</strong>
              <span>benzersiz ilişki</span>
            </div>
            <div>
              <strong>{number(data.meta.fetchedCount)}</strong>
              <span>alınan ağ kaydı</span>
            </div>
          </div>
          <h3>Bu çizgiler ne anlatıyor?</h3>
          <p>
            Veriler{" "}
            <a
              href="https://bizimcaz.com/graph/AsudeSasmaz"
              target="_blank"
              rel="noreferrer"
            >
              Bizim Caz'ın halka açık ilişki grafından
            </a>{" "}
            gelir. Bir çizgi, kaynakta kayıtlı bir ortak grup, albüm veya konser
            ilişkisini gösterir. İlişki ağırlığı konser sayısı değildir.
            Noktalar, farklı müzisyenlerle bağlantı sayısına göre büyür; renkler
            kaynaktaki enstrüman grubunu gösterir.
          </p>
          <h3>Gerçekten herkes burada mı?</h3>
          <p>
            Site haritasındaki {number(data.meta.archiveCount)} müzisyen ve ağ
            kayıtlarında keşfedilen isimler dahil. Arama menüsündeki{" "}
            {number(data.meta.directoryCount)} kişiyle sınırlı değil. Aynı
            profile ait {number(data.meta.mergedAliases)} eski kimlik
            birleştirildi. {number(data.meta.unavailableCount)} isim için kaynak
            graf servisi ağ kaydı sunmadı; bu kişilerin başka müzisyenlerin
            kayıtlarındaki bağlantıları korunur.{" "}
            {data.meta.pendingCount
              ? `${number(data.meta.pendingCount)} kayıt henüz taranmadı.`
              : "Taranmayı bekleyen kayıt yok."}{" "}
            Kaynakta kayıt bulunmaması, müzisyenlerin hiç birlikte çalmadığı
            anlamına gelmez.
          </p>
          <h3>Haritanın dili</h3>
          <p>
            Takımyıldız görünümü gerçek bağlantılardan hesaplanır. Enstrüman
            adaları ses ailelerine göre gruplanır. Plak görünümünde en
            bağlantılı isimler merkeze yaklaşır. Dış halkadaki noktalar bu
            kesitte bağlantısı bulunmayan kayıtlardır. Aramızda kaç nota,
            kayıtlı ağdaki en kısa yolu bulur.
          </p>
          <div className="source-box">
            <Info size={17} />
            <p>
              Kaynak dönemi: tüm zamanlar (all_time). Veri kesiti:{" "}
              {new Date(data.meta.fetchedAt).toLocaleDateString("tr-TR", {
                day: "numeric",
                month: "long",
                year: "numeric",
              })}
              . Bu, kaynak arşivin bir kopyasıdır; canlı güncellenmez. Jam
              session sesi bu uygulama için sentezlenir, sanatçılara ait kayıt
              içermez.
            </p>
          </div>
          <a
            className="data-download"
            href="/data/atlas.json"
            download="caz-atlasi.json"
          >
            Tüm graf verisini indir (JSON) <ArrowDownToLine size={15} />
          </a>
          <a
            className="primary-button"
            href="https://bizimcaz.com"
            target="_blank"
            rel="noreferrer"
          >
            Bizim Caz arşivini ziyaret et <ArrowUpRight size={16} />
          </a>
        </Modal>
      )}
    </div>
  );
}
