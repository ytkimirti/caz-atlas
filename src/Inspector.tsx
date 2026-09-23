import { useLayoutEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import {
  ArrowUpRight,
  ChevronLeft,
  ChevronRight,
  LocateFixed,
  Users,
  X,
} from "lucide-react";
import InstrumentIcon from "./InstrumentIcon";
import MusicianPortrait from "./MusicianPortrait";
import { groupInfo, number } from "./types";
import type { Ensemble, GraphMusician } from "./types";

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
}
type ProjectState = "ready" | "loading" | "error";

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
  // A row opened from the keyboard is replaced by the new body; land on its title.
  const body = useRef<HTMLDivElement>(null);
  const backButton = useRef<HTMLButtonElement>(null);
  const forwardButton = useRef<HTMLButtonElement>(null);
  const focusTitle = () =>
    panel.current?.querySelector<HTMLElement>("h2")?.focus({
      preventScroll: true,
    });
  useLayoutEffect(() => {
    body.current?.scrollTo({ top: 0 });
    if (!keyboardOpen.current) return;
    keyboardOpen.current = false;
    if (!panel.current?.contains(document.activeElement)) focusTitle();
  }, [contentKey]);
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
          !!(event.target as HTMLElement).closest(".row");
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
  actions,
}: {
  musician: GraphMusician;
  value: number;
  current?: boolean;
  muted?: boolean;
  actions: Actions;
}) {
  return (
    <button
      className={`row ${muted ? "is-muted" : ""}`}
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

export function MusicianInspector({
  musician,
  concerts,
  collaborators,
  ensembles,
  byId,
  projects,
  onRetryProjects,
  actions,
}: {
  musician: GraphMusician;
  concerts: number;
  collaborators: { id: number; weight: number }[];
  ensembles: Ensemble[];
  byId: Map<number, GraphMusician>;
  projects: ProjectState;
  onRetryProjects: () => void;
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
  actions,
}: {
  ensemble: Ensemble;
  members: { member: GraphMusician; concerts: number }[];
  visibleIds: Set<number>;
  place: string;
  onFrame: () => void;
  onRevealAll: () => void;
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
