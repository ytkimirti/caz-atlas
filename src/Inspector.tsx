import { useLayoutEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import {
  ArrowLeftRight,
  ArrowUpRight,
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  LocateFixed,
  Search,
  Users,
  X,
} from "lucide-react";
import InstrumentIcon from "./InstrumentIcon";
import MusicianPortrait from "./MusicianPortrait";
import { groupInfo, number } from "./types";
import type { DatedConcert, Ensemble, GraphMusician } from "./types";
import type { ConcertDetails, RuntimeVenue } from "./runtime-data";
import type { career as careerOf } from "./scope";
import { searchAtlas } from "./search";

export interface InspectorNav {
  canGoBack: boolean;
  canGoForward: boolean;
  backLabel: string;
  forwardLabel: string;
  back: () => void;
  forward: () => void;
}
interface Actions {
  onMusician: (id: number) => void;
  onEnsemble: (id: string) => void;
  onPreviewEnsemble: (id: string | null) => void;
  onHover: (id: number | null) => void;
  onInstrument: (group: string) => void;
  onPair: (id: number, other: number) => void;
  onVenue: (id: string) => void;
}
type ProjectState = "ready" | "loading" | "error";
/** Everything a concert row needs; titles arrive with the lazy details file. */
export interface ConcertSource {
  timeline: DatedConcert[];
  details: ConcertDetails | null;
  detailsState: "ready" | "loading" | "failed" | "stale";
  onRetryDetails: () => void;
  venues: Map<string, RuntimeVenue>;
  byId: Map<number, GraphMusician>;
  ensembleNames: Map<string, string>;
}
type Career = NonNullable<ReturnType<typeof careerOf>>;

// One persistent frame for every selection, so the back and forward buttons
// keep focus while the body swaps underneath them.
export function InspectorShell({
  label,
  caption,
  contentKey,
  nav,
  onClose,
  closeLabel,
  children,
}: {
  label: string;
  caption: string;
  contentKey: string;
  nav: InspectorNav;
  onClose: () => void;
  closeLabel: string;
  children: ReactNode;
}) {
  const panel = useRef<HTMLElement>(null);
  const keyboardOpen = useRef(false);
  // A control marked data-nav replaces the body; opened from the keyboard,
  // focus lands on the new title instead of falling to the page.
  const body = useRef<HTMLDivElement>(null);
  const backButton = useRef<HTMLButtonElement>(null);
  const forwardButton = useRef<HTMLButtonElement>(null);
  const focusTitle = () =>
    panel.current?.querySelector<HTMLElement>("h2")?.focus({
      preventScroll: true,
    });
  // Closing the panel from inside it would drop focus to the page; the map
  // is where the reader continues.
  useLayoutEffect(() => {
    const root = panel.current;
    return () => {
      if (root?.contains(document.activeElement))
        document
          .querySelector<HTMLElement>(".network-canvas")
          ?.focus({ preventScroll: true });
    };
  }, []);
  useLayoutEffect(() => {
    body.current?.scrollTo({ top: 0 });
    if (!keyboardOpen.current) return;
    keyboardOpen.current = false;
    if (!panel.current?.contains(document.activeElement)) focusTitle();
  }, [contentKey]);
  // A marked control that did not change the body must not steer a later,
  // unrelated selection into the panel.
  useLayoutEffect(() => {
    keyboardOpen.current = false;
  });
  // Reaching either end disables the arrow that was pressed; hand focus over.
  useLayoutEffect(() => {
    const focused = document.activeElement;
    if (focused !== backButton.current && focused !== forwardButton.current)
      return;
    if (!(focused as HTMLButtonElement).disabled) return;
    const other =
      focused === backButton.current
        ? forwardButton.current
        : backButton.current;
    if (other && !other.disabled) other.focus();
    else focusTitle();
  }, [nav.canGoBack, nav.canGoForward]);
  return (
    <section
      ref={panel}
      className="selection-panel surface"
      aria-label={label}
      onClickCapture={(event) => {
        keyboardOpen.current =
          event.detail === 0 &&
          !!(event.target as HTMLElement).closest("[data-nav]");
      }}
    >
      <div className="inspector-bar">
        <div className="inspector-nav">
          <button
            ref={backButton}
            className="icon-button"
            aria-label={`Geri: ${nav.backLabel}`}
            title={`Geri: ${nav.backLabel}`}
            disabled={!nav.canGoBack}
            onClick={nav.back}
          >
            <ChevronLeft size={17} />
          </button>
          <button
            ref={forwardButton}
            className="icon-button"
            aria-label={`İleri: ${nav.forwardLabel}`}
            title={`İleri: ${nav.forwardLabel}`}
            disabled={!nav.canGoForward}
            onClick={nav.forward}
          >
            <ChevronRight size={17} />
          </button>
        </div>
        <span className="section-caption">{caption}</span>
        <button
          className="icon-button"
          aria-label={closeLabel}
          title={`${closeLabel} (Esc)`}
          onClick={onClose}
        >
          <X size={16} />
        </button>
      </div>
      <div className="inspector-body" ref={body}>
        {children}
      </div>
    </section>
  );
}

function MusicianRow({
  musician,
  value,
  current,
  muted,
  pairWith,
  actions,
}: {
  musician: GraphMusician;
  value: number;
  current?: boolean;
  muted?: boolean;
  /** Turns the value into a link to the concerts shared with this musician. */
  pairWith?: GraphMusician;
  actions: Actions;
}) {
  if (pairWith)
    return (
      <div className="row-split">
        <MusicianRow
          musician={musician}
          value={value}
          current={current}
          muted={muted}
          actions={actions}
        />
        <button
          className="row-value pair-link"
          data-nav
          aria-label={`${pairWith.name} ve ${musician.name}: ${value} ortak konser`}
          title="Birlikte çaldıkları konserler"
          onClick={() => {
            actions.onHover(null);
            actions.onPair(pairWith.id, musician.id);
          }}
        >
          {number(value)}
        </button>
      </div>
    );
  return (
    <button
      className={`row ${muted ? "is-muted" : ""}`}
      data-nav
      aria-current={current ? "true" : undefined}
      title={muted ? "Bu filtrelerde haritada görünmüyor" : undefined}
      onClick={() => {
        actions.onHover(null);
        actions.onMusician(musician.id);
      }}
      onMouseEnter={() => actions.onHover(musician.id)}
      onMouseLeave={() => actions.onHover(null)}
      onFocus={() => actions.onHover(musician.id)}
      onBlur={() => actions.onHover(null)}
    >
      <InstrumentIcon group={musician.group} size={15} />
      <span className="row-name">{musician.name}</span>
      <small className="row-value">{number(value)}</small>
      <ArrowUpRight className="row-arrow" size={14} aria-hidden="true" />
    </button>
  );
}

function EnsembleRow({
  ensemble,
  value,
  actions,
}: {
  ensemble: Ensemble;
  value: number;
  actions: Actions;
}) {
  const members = Object.keys(ensemble.musicians).length;
  return (
    <button
      className="row ensemble-row"
      data-nav
      onClick={() => {
        actions.onPreviewEnsemble(null);
        actions.onEnsemble(ensemble.id);
      }}
      onMouseEnter={() => actions.onPreviewEnsemble(ensemble.id)}
      onMouseLeave={() => actions.onPreviewEnsemble(null)}
      onFocus={() => actions.onPreviewEnsemble(ensemble.id)}
      onBlur={() => actions.onPreviewEnsemble(null)}
    >
      <span className="ensemble-glyph" aria-hidden="true">
        <Users size={14} />
      </span>
      <span className="row-name">
        {ensemble.name}
        <small>{number(members)} müzisyen</small>
      </span>
      <small className="row-value">{number(value)}</small>
      <ArrowUpRight className="row-arrow" size={14} aria-hidden="true" />
    </button>
  );
}

function ListHeading({ title, unit }: { title: string; unit: string }) {
  return (
    <div className="list-heading">
      <h3>{title}</h3>
      <small>{unit}</small>
    </div>
  );
}

const COLLABORATOR_PREVIEW = 8;
const CONCERT_PAGE = 20;

const MONTHS = Array.from({ length: 12 }, (_, i) =>
  new Date(2000, i, 1).toLocaleDateString("tr-TR", { month: "short" }),
);
export const concertDate = (date: string) => {
  const [year, month, day] = date.split("-").map(Number);
  return `${day} ${MONTHS[month - 1]} ${year}`;
};

function ConcertRow({
  index,
  source,
  actions,
}: {
  index: number;
  source: ConcertSource;
  actions: Actions;
}) {
  const [open, setOpen] = useState(false);
  const concert = source.timeline[index];
  const venue = source.venues.get(concert.venue);
  const title =
    (source.details && source.details.titles[index]) ||
    (concert.ensemble && source.ensembleNames.get(concert.ensemble)) ||
    (source.details ? "Konser" : "…");
  const others = source.details?.others[index] ?? [];
  const key = source.details?.keys[index];
  return (
    <div className="concert">
      <button
        className="row concert-row"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
      >
        <time dateTime={concert.date}>{concertDate(concert.date)}</time>
        <span className="row-name">
          {title}
          <small>
            {venue ? `${venue.name} · ${venue.city}` : concert.venue}
            {concert.jam && " · jam"}
          </small>
        </span>
        <ChevronRight
          className="concert-chevron"
          size={14}
          aria-hidden="true"
        />
      </button>
      {open && (
        <div className="concert-lineup">
          {concert.musicians.map((id) => {
            const musician = source.byId.get(id);
            return musician ? (
              <button
                key={id}
                data-nav
                onClick={() => {
                  actions.onHover(null);
                  actions.onMusician(id);
                }}
                onMouseEnter={() => actions.onHover(id)}
                onMouseLeave={() => actions.onHover(null)}
              >
                <InstrumentIcon group={musician.group} size={12} />
                {musician.name}
              </button>
            ) : null;
          })}
          {others.map((name) => (
            <span key={name}>{name}</span>
          ))}
          {key && (
            <a
              href={`https://bizimcaz.com/concert/${encodeURIComponent(key)}`}
              target="_blank"
              rel="noreferrer"
            >
              Bizim Caz <ExternalLink size={11} aria-hidden="true" />
              <span className="sr-only">konser sayfası (yeni sekme)</span>
            </a>
          )}
        </div>
      )}
    </div>
  );
}

function ConcertList({
  title,
  unit,
  concerts,
  source,
  actions,
}: {
  title: string;
  unit: string;
  /** Timeline indices, newest first. */
  concerts: number[];
  source: ConcertSource;
  actions: Actions;
}) {
  const [shown, setShown] = useState(CONCERT_PAGE);
  return (
    <div className="inspector-section">
      <ListHeading title={title} unit={unit} />
      {source.detailsState === "failed" && (
        <button className="text-button" onClick={source.onRetryDetails}>
          Konser başlıkları yüklenemedi. Tekrar dene
        </button>
      )}
      {source.detailsState === "stale" && (
        <p className="list-note">
          Arşiv güncellendi. Konser başlıkları için sayfayı yenile.
        </p>
      )}
      <div className="rows" onMouseLeave={() => actions.onHover(null)}>
        {concerts.slice(0, shown).map((index) => (
          <ConcertRow
            key={index}
            index={index}
            source={source}
            actions={actions}
          />
        ))}
        {!concerts.length && (
          <p className="list-note">Bu filtrelerde konser yok.</p>
        )}
      </div>
      {concerts.length > shown && (
        <button
          className="subtle-button list-more"
          onClick={() => setShown(shown + CONCERT_PAGE * 2)}
        >
          Daha fazla göster ({number(concerts.length - shown)})
        </button>
      )}
    </div>
  );
}

function CareerSummary({
  career,
  source,
  actions,
}: {
  career: Career;
  source: ConcertSource;
  actions: Actions;
}) {
  const peak = Math.max(...career.years);
  const lastYear = career.startYear + career.years.length - 1;
  return (
    <>
      <div className="career">
        <div className="career-span">
          <span>
            İlk <strong>{concertDate(career.first)}</strong>
          </span>
          <span>
            Son <strong>{concertDate(career.last)}</strong>
          </span>
        </div>
        <div
          className="sparkline"
          role="img"
          aria-label={`Yıllara göre konser sayısı, ${career.startYear}–${lastYear}`}
        >
          {career.years.map((count, i) => (
            <i
              key={i}
              title={`${career.startYear + i}: ${count} konser`}
              style={{
                height: `${count ? Math.max(8, (count / peak) * 100) : 0}%`,
              }}
            />
          ))}
        </div>
        {career.years.length > 1 && (
          <div className="sparkline-axis" aria-hidden="true">
            <span>{career.startYear}</span>
            <span>{lastYear}</span>
          </div>
        )}
      </div>
      <div className="inspector-section">
        <ListHeading title="Sık çaldığı mekanlar" unit="Konser" />
        <div className="rows">
          {career.venues.slice(0, 4).map(({ id, count }) => {
            const venue = source.venues.get(id);
            return (
              <button
                key={id}
                className="row"
                title="Haritayı bu mekanla sınırla"
                onClick={() => actions.onVenue(id)}
              >
                <span className="row-name">
                  {venue?.name ?? id}
                  {venue && <small>{venue.city}</small>}
                </span>
                <small className="row-value">{number(count)}</small>
                <ArrowUpRight
                  className="row-arrow"
                  size={14}
                  aria-hidden="true"
                />
              </button>
            );
          })}
        </div>
      </div>
    </>
  );
}

function PairFinder({
  musician,
  nodes,
  actions,
}: {
  musician: GraphMusician;
  nodes: GraphMusician[];
  actions: Actions;
}) {
  const [query, setQuery] = useState("");
  const results = useMemo(
    () =>
      query.trim()
        ? searchAtlas(nodes, [], query, "musician")
            .flatMap((r) => (r.kind === "musician" ? [r.musician] : []))
            .filter((m) => m.id !== musician.id)
            .slice(0, 5)
        : [],
    [nodes, query, musician.id],
  );
  return (
    <div className="inspector-section">
      <ListHeading title="Bağlantı bul" unit="Yol" />
      <div className="venue-search pair-search">
        <Search size={14} aria-hidden="true" />
        <input
          placeholder="Başka bir müzisyen"
          aria-label={`${musician.name} ile bağlantısını bul`}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            // The first result's click carries the keyboard focus handoff.
            if (e.key === "Enter")
              e.currentTarget
                .closest(".inspector-section")
                ?.querySelector<HTMLButtonElement>(".rows [data-nav]")
                ?.click();
          }}
        />
      </div>
      {results.length > 0 && (
        <div className="rows">
          {results.map((other) => (
            <button
              key={other.id}
              className="row"
              data-nav
              onClick={() => {
                actions.onHover(null);
                actions.onPair(musician.id, other.id);
                setQuery("");
              }}
              onMouseEnter={() => actions.onHover(other.id)}
              onMouseLeave={() => actions.onHover(null)}
            >
              <InstrumentIcon group={other.group} size={15} />
              <span className="row-name">{other.name}</span>
              <ArrowLeftRight
                className="row-arrow"
                size={14}
                aria-hidden="true"
              />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export function MusicianInspector({
  musician,
  concerts,
  collaborators,
  ensembles,
  byId,
  projects,
  onRetryProjects,
  history,
  career,
  nodes,
  place,
  source,
  actions,
}: {
  musician: GraphMusician;
  concerts: number;
  collaborators: { id: number; weight: number }[];
  ensembles: Ensemble[];
  byId: Map<number, GraphMusician>;
  projects: ProjectState;
  onRetryProjects: () => void;
  /** This musician's concerts in the current filters, newest first. */
  history: number[];
  career: Career | null;
  /** Musicians that can be paired, for the path finder. */
  nodes: GraphMusician[];
  place: string;
  source: ConcertSource;
  actions: Actions;
}) {
  const [expanded, setExpanded] = useState(false);
  const info = groupInfo(musician.group);
  const shown = expanded
    ? collaborators
    : collaborators.slice(0, COLLABORATOR_PREVIEW);
  return (
    <>
      <div className="inspector-identity">
        <MusicianPortrait key={musician.key} musician={musician} />
        <div>
          <h2 tabIndex={-1}>{musician.name}</h2>
          <button
            className="instrument-chip"
            title={`Haritada tüm ${info.name.toLocaleLowerCase("tr-TR")} müzisyenlerini vurgula`}
            onClick={() => actions.onInstrument(musician.group)}
          >
            <InstrumentIcon group={musician.group} size={14} />
            {info.name}
          </button>
        </div>
      </div>
      <dl className="inspector-stats">
        <div>
          <dt>konser</dt>
          <dd>{number(concerts)}</dd>
        </div>
        <div>
          <dt>müzisyenle bağ</dt>
          <dd>{number(collaborators.length)}</dd>
        </div>
        <div>
          <dt>grup / proje</dt>
          <dd>{projects === "ready" ? number(ensembles.length) : "…"}</dd>
        </div>
      </dl>
      {career && (
        <CareerSummary career={career} source={source} actions={actions} />
      )}

      <div className="inspector-section">
        <ListHeading title="Grupları" unit="Konser" />
        {projects === "loading" && (
          <p className="list-note" aria-live="polite">
            Gruplar yükleniyor…
          </p>
        )}
        {projects === "error" && (
          <button className="text-button" onClick={onRetryProjects}>
            Gruplar yüklenemedi. Tekrar dene
          </button>
        )}
        {projects === "ready" && !ensembles.length && (
          <p className="list-note">Bu dönemde kayıtlı grubu yok.</p>
        )}
        {ensembles.length > 0 && (
          <>
            <div
              className="rows"
              onMouseLeave={() => actions.onPreviewEnsemble(null)}
            >
              {ensembles.map((ensemble) => (
                <EnsembleRow
                  key={ensemble.id}
                  ensemble={ensemble}
                  value={ensemble.musicians[musician.id] ?? 0}
                  actions={actions}
                />
              ))}
            </div>
          </>
        )}
      </div>

      <div className="inspector-section">
        <ListHeading title="En çok birlikte çaldığı" unit="Ortak konser" />
        <div
          className="rows collaborator-rows"
          onMouseLeave={() => actions.onHover(null)}
        >
          {shown.map((c) => {
            const other = byId.get(c.id);
            return other ? (
              <MusicianRow
                key={c.id}
                musician={other}
                value={c.weight}
                pairWith={musician}
                actions={actions}
              />
            ) : null;
          })}
          {!collaborators.length && (
            <p className="list-note">Bu filtrelerde bağlantısı yok.</p>
          )}
        </div>
        {collaborators.length > COLLABORATOR_PREVIEW && (
          <button
            className="subtle-button list-more"
            onClick={() => setExpanded(!expanded)}
          >
            {expanded
              ? "Daha az göster"
              : `Tümünü göster (${number(collaborators.length)})`}
          </button>
        )}
      </div>

      <PairFinder musician={musician} nodes={nodes} actions={actions} />

      <ConcertList
        title="Konserleri"
        unit={place}
        concerts={history}
        source={source}
        actions={actions}
      />
    </>
  );
}

export function PairInspector({
  musician,
  other,
  shared,
  path,
  weightOf,
  place,
  source,
  actions,
}: {
  musician: GraphMusician;
  other: GraphMusician;
  /** Concerts with both musicians in the current filters, newest first. */
  shared: number[];
  /** Shortest path on the visible map, both ends included. */
  path: number[];
  weightOf: (a: number, b: number) => number;
  place: string;
  source: ConcertSource;
  actions: Actions;
}) {
  const person = (m: GraphMusician) => (
    <button
      className="pair-person"
      data-nav
      onClick={() => {
        actions.onHover(null);
        actions.onMusician(m.id);
      }}
      onMouseEnter={() => actions.onHover(m.id)}
      onMouseLeave={() => actions.onHover(null)}
    >
      <InstrumentIcon group={m.group} size={15} />
      {m.name}
    </button>
  );
  return (
    <>
      <h2 tabIndex={-1} className="pair-identity">
        {person(musician)}
        <ArrowLeftRight size={14} role="img" aria-label="ve" />
        {person(other)}
      </h2>
      <dl className="inspector-stats">
        <div>
          <dt>ortak konser</dt>
          <dd>{number(shared.length)}</dd>
        </div>
        <div>
          <dt>adım</dt>
          <dd>{path.length ? number(path.length - 1) : "—"}</dd>
        </div>
        {shared.length > 0 && (
          <div>
            <dt>ilk ortak</dt>
            <dd>
              {source.timeline[shared[shared.length - 1]].date.slice(0, 4)}
            </dd>
          </div>
        )}
      </dl>
      {path.length > 2 && (
        <div className="inspector-section">
          <ListHeading
            title={
              shared.length ? "Haritadaki en kısa yol" : "Aralarındaki yol"
            }
            unit="Ortak konser"
          />
          <div className="rows">
            {path.slice(1).map((id, i) => {
              const from = source.byId.get(path[i])!,
                to = source.byId.get(id)!;
              return (
                <button
                  key={id}
                  className="row"
                  data-nav
                  onClick={() => actions.onPair(from.id, to.id)}
                  onMouseEnter={() => actions.onHover(to.id)}
                  onMouseLeave={() => actions.onHover(null)}
                >
                  <span className="row-name">
                    {from.name} → {to.name}
                  </span>
                  <small className="row-value">
                    {number(weightOf(from.id, to.id))}
                  </small>
                  <ArrowUpRight
                    className="row-arrow"
                    size={14}
                    aria-hidden="true"
                  />
                </button>
              );
            })}
          </div>
        </div>
      )}
      {!path.length && (
        <p className="list-note">Bu filtrelerde aralarında bir yol yok.</p>
      )}
      {shared.length > 0 ? (
        <ConcertList
          title="Birlikte çaldıkları konserler"
          unit={place}
          concerts={shared}
          source={source}
          actions={actions}
        />
      ) : (
        <p className="list-note">Bu filtrelerde birlikte çalmamışlar.</p>
      )}
    </>
  );
}

export function EnsembleInspector({
  ensemble,
  members,
  visibleIds,
  place,
  onFrame,
  onRevealAll,
  history,
  source,
  actions,
}: {
  ensemble: Ensemble;
  members: { member: GraphMusician; concerts: number }[];
  visibleIds: Set<number>;
  place: string;
  onFrame: () => void;
  onRevealAll: () => void;
  /** Concerts billed under this name in the current filters, newest first. */
  history: number[];
  source: ConcertSource;
  actions: Actions;
}) {
  const hidden = members.filter(({ member }) => !visibleIds.has(member.id));
  return (
    <>
      <div className="inspector-identity">
        <div className="ensemble-avatar" aria-hidden="true">
          <Users size={24} />
        </div>
        <div>
          <h2 tabIndex={-1}>{ensemble.name}</h2>
          <p className="inspector-place">{place}</p>
        </div>
      </div>
      <dl className="inspector-stats">
        <div>
          <dt>konser</dt>
          <dd>{number(ensemble.concerts)}</dd>
        </div>
        <div>
          <dt>müzisyen</dt>
          <dd>{number(members.length)}</dd>
        </div>
      </dl>
      <div className="inspector-actions">
        <button className="text-button" onClick={onFrame}>
          <LocateFixed size={14} aria-hidden="true" /> Haritada göster
        </button>
        {hidden.length > 0 && (
          <button className="subtle-button" onClick={onRevealAll}>
            Gizli {number(hidden.length)} kişiyi göster
          </button>
        )}
      </div>
      <div className="inspector-section">
        <ListHeading title="Kadro" unit="Konser" />
        <div
          className="rows roster-rows"
          onMouseLeave={() => actions.onHover(null)}
        >
          {members.map(({ member, concerts }) => (
            <MusicianRow
              key={member.id}
              musician={member}
              value={concerts}
              muted={!visibleIds.has(member.id)}
              actions={actions}
            />
          ))}
        </div>
      </div>
      <ConcertList
        title="Konserleri"
        unit={place}
        concerts={history}
        source={source}
        actions={actions}
      />
    </>
  );
}

export function InstrumentInspector({
  group,
  musicians,
  counts,
  place,
  actions,
}: {
  group: string;
  musicians: GraphMusician[];
  counts: Record<string, number>;
  place: string;
  actions: Actions;
}) {
  const info = groupInfo(group);
  return (
    <>
      <div className="inspector-identity">
        <div
          className="instrument-avatar"
          style={{ color: info.color }}
          aria-hidden="true"
        >
          <InstrumentIcon group={group} size={26} />
        </div>
        <div>
          <h2 tabIndex={-1}>{info.name}</h2>
          <p className="inspector-place" aria-live="polite">
            Haritada {number(musicians.length)} müzisyen vurgulanıyor
          </p>
        </div>
      </div>
      <div className="inspector-section">
        <ListHeading title="En çok konser verenler" unit={place} />
        <div className="rows" onMouseLeave={() => actions.onHover(null)}>
          {musicians.slice(0, 200).map((musician) => (
            <MusicianRow
              key={musician.id}
              musician={musician}
              value={counts[musician.id] ?? 0}
              actions={actions}
            />
          ))}
          {!musicians.length && (
            <p className="list-note">Bu görünümde müzisyen yok.</p>
          )}
        </div>
      </div>
    </>
  );
}
