import { useEffect, useRef, useState } from "react";
import type { CSSProperties, PointerEvent as ReactPointerEvent } from "react";
import {
  ArrowUpRight,
  ChevronDown,
  ChevronUp,
  Compass,
  Pause,
  Play,
  RotateCcw,
  Waves,
} from "lucide-react";
import { monthLabel, monthValue, parseMonth } from "./chronology";
import type { DateRange } from "./chronology";
import { number } from "./types";
import { playbackStep } from "./playback";
import type { ArrivalSchedule } from "./playback";

interface Props {
  bounds: DateRange;
  range: DateRange;
  cursor: number;
  replayFrom: number;
  arrivals: ArrivalSchedule;
  histogram: number[];
  musicians: number;
  edges: number;
  concerts: number;
  calculating: boolean;
  playing: boolean;
  livePhysics: boolean;
  collapsed: boolean;
  onCollapsedChange: (collapsed: boolean) => void;
  onExperienceChange: (live: boolean) => void;
  onPlayingChange: (playing: boolean) => void;
  onRange: (range: DateRange) => void;
  onCursor: (cursor: number) => void;
}

function MonthInput({
  label,
  value,
  min,
  max,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  onChange: (month: number) => void;
}) {
  const [draft, setDraft] = useState(() => monthValue(value));
  useEffect(() => setDraft(monthValue(value)), [value]);
  return (
    <input
      type="month"
      aria-label={label}
      min={monthValue(min)}
      max={monthValue(max)}
      value={draft}
      onChange={(event) => {
        setDraft(event.target.value);
        const month = parseMonth(event.target.value);
        if (month !== null) onChange(Math.max(min, Math.min(max, month)));
      }}
      onBlur={() => setDraft(monthValue(value))}
    />
  );
}

export default function Timeline({
  bounds,
  range,
  cursor,
  replayFrom,
  arrivals,
  histogram,
  musicians,
  edges,
  concerts,
  calculating,
  playing,
  livePhysics,
  collapsed,
  onCollapsedChange,
  onExperienceChange,
  onPlayingChange: setPlaying,
  onRange,
  onCursor,
}: Props) {
  const [speed, setSpeed] = useState(1);
  const [hover, setHover] = useState<number | null>(null);
  const track = useRef<HTMLDivElement>(null);
  const drag = useRef<{
    kind: "start" | "end" | "cursor" | "range";
    month: number;
    range: DateRange;
  } | null>(null);
  const span = Math.max(1, bounds[1] - bounds[0]);
  const percent = (month: number) => ((month - bounds[0]) / span) * 100;
  const max = Math.max(1, ...histogram);
  const step = playbackStep(cursor, range[1], arrivals, speed);
  useEffect(() => {
    if (!playing || !livePhysics) return;
    if (cursor >= range[1]) {
      setPlaying(false);
      return;
    }
    if (calculating) return;
    const timer = window.setTimeout(() => onCursor(step.cursor), step.delay);
    return () => window.clearTimeout(timer);
  }, [
    playing,
    livePhysics,
    cursor,
    range,
    step.cursor,
    step.delay,
    onCursor,
    calculating,
    setPlaying,
  ]);
  useEffect(() => {
    const pause = () => {
      if (document.hidden) setPlaying(false);
    };
    document.addEventListener("visibilitychange", pause);
    return () => document.removeEventListener("visibilitychange", pause);
  }, [setPlaying]);
  function updateRange(next: DateRange) {
    setPlaying(false);
    onRange(next);
  }
  function monthAt(event: ReactPointerEvent) {
    const box = track.current!.getBoundingClientRect();
    return Math.max(
      bounds[0],
      Math.min(
        bounds[1],
        Math.round(bounds[0] + ((event.clientX - box.left) / box.width) * span),
      ),
    );
  }
  function startDrag(
    event: ReactPointerEvent,
    kind: "start" | "end" | "cursor" | "range",
  ) {
    if (event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();
    setPlaying(false);
    drag.current = { kind, month: monthAt(event), range: [...range] };
    track.current!.setPointerCapture(event.pointerId);
  }
  function move(event: ReactPointerEvent) {
    const month = monthAt(event);
    setHover(month);
    const active = drag.current;
    if (!active) return;
    if (active.kind === "start") onRange([Math.min(month, range[1]), range[1]]);
    if (active.kind === "end") onRange([range[0], Math.max(month, range[0])]);
    if (active.kind === "cursor")
      onCursor(Math.max(range[0], Math.min(range[1], month)));
    if (active.kind === "range") {
      const delta = Math.max(
        bounds[0] - active.range[0],
        Math.min(bounds[1] - active.range[1], month - active.month),
      );
      onRange([active.range[0] + delta, active.range[1] + delta]);
    }
  }
  function stop(event: ReactPointerEvent) {
    drag.current = null;
    if (track.current?.hasPointerCapture(event.pointerId))
      track.current.releasePointerCapture(event.pointerId);
    setHover(null);
  }
  const ticks = Array.from({ length: 8 }, (_, i) =>
    Math.round(bounds[0] + (span * i) / 7),
  );
  const playButton = livePhysics && (
    <button
      className="timeline-play"
      aria-label={playing ? "Tarihi duraklat" : "Tarihi oynat"}
      title={
        playing
          ? "Tarih akışını duraklat; fizik çalışmaya devam eder"
          : "Tarihi ilerlet; fizik her zaman çalışır"
      }
      aria-pressed={playing}
      disabled={range[0] === range[1]}
      onClick={() => {
        if (!playing && cursor >= range[1])
          onCursor(Math.min(replayFrom, range[1] - 1));
        setPlaying(!playing);
      }}
    >
      {playing ? (
        <Pause size={19} fill="currentColor" />
      ) : (
        <Play size={19} fill="currentColor" />
      )}
    </button>
  );
  const stats = (
    <div className="timeline-stats">
      <span>
        <strong>{number(musicians)}</strong> müzisyen
      </span>
      <span>
        <strong>{number(edges)}</strong> bağ
      </span>
      <span title="Seçilen mekan ve tarihlerde arşivlenen konserler">
        <strong>{number(concerts)}</strong> konser
      </span>
    </div>
  );
  const allDates = range[0] === bounds[0] && range[1] === bounds[1];
  if (collapsed)
    return (
      <section
        className={`timeline is-collapsed ${playing ? "is-playing" : ""}`}
        aria-label="Zaman çizelgesi"
        data-experience={livePhysics ? "live" : "explore"}
      >
        <button
          className="timeline-expand"
          aria-expanded="false"
          onClick={() => onCollapsedChange(false)}
        >
          <ChevronUp size={15} aria-hidden="true" />
          <span className="timeline-expand-label">Zaman</span>
          <strong>
            {allDates && cursor === range[1]
              ? `Tüm arşiv · ${Math.floor(bounds[0] / 12)}–${Math.floor(bounds[1] / 12)}`
              : `${monthLabel(range[0])} – ${monthLabel(cursor)}`}
          </strong>
        </button>
        {playButton}
        {livePhysics && <span className="timeline-live-badge">Canlı</span>}
        {stats}
      </section>
    );
  return (
    <section
      className={`timeline ${playing ? "is-playing" : ""}`}
      aria-label="Zaman çizelgesi"
      data-experience={livePhysics ? "live" : "explore"}
      style={{ "--play-duration": `${step.delay}ms` } as CSSProperties}
    >
      <div className="timeline-heading">
        <div className="experience-switch" role="group" aria-label="Keşif modu">
          <button
            type="button"
            aria-label="Keşfet modu"
            aria-pressed={!livePhysics}
            onClick={() => onExperienceChange(false)}
          >
            <Compass size={13} aria-hidden="true" /> Keşfet
          </button>
          <button
            type="button"
            aria-label="Canlı modu"
            aria-pressed={livePhysics}
            onClick={() => onExperienceChange(true)}
          >
            <Waves size={13} aria-hidden="true" /> Canlı
          </button>
        </div>
        <span
          className={`experience-description ${livePhysics ? "timeline-live" : ""}`}
        >
          {livePhysics
            ? playing
              ? "Fizik canlı · Tarih ilerliyor"
              : "Fizik canlı · Tarih sabit"
            : "Sabit yerleşim · Bir dönem seç, bağlantıları keşfet"}
        </span>
        <button
          className="icon-button timeline-collapse"
          aria-label="Zaman çizelgesini gizle"
          title="Zaman çizelgesini gizle"
          aria-expanded="true"
          onClick={() => onCollapsedChange(true)}
        >
          <ChevronDown size={16} />
        </button>
      </div>
      <div className="timeline-main">
        <div className="timeline-transport">
          {playButton || (
            <span className="timeline-static-icon" aria-hidden="true">
              <Compass size={20} />
            </span>
          )}
          <div className="timeline-now">
            <strong>{Math.floor(cursor / 12)}</strong>
            <span>{monthLabel(cursor).split(" ")[0]}</span>
          </div>
          {livePhysics && (
            <button
              className="timeline-speed"
              aria-label="Oynatma hızı"
              title="Müzisyen yoğunluğuna göre ayarlanan oynatma hızını değiştir"
              onClick={() => setSpeed(speed === 4 ? 0.5 : speed * 2)}
            >
              {speed}×
            </button>
          )}
        </div>
        <div className="timeline-chart-wrap">
          <div
            className={`timeline-chart ${range[0] === range[1] ? "is-collapsed" : ""}`}
            ref={track}
            onPointerDown={(event) => {
              if (event.button !== 0) return;
              startDrag(event, "cursor");
              onCursor(Math.max(range[0], Math.min(range[1], monthAt(event))));
            }}
            onPointerMove={move}
            onPointerUp={stop}
            onPointerCancel={stop}
            onLostPointerCapture={() => {
              drag.current = null;
            }}
            onPointerLeave={() => {
              if (!drag.current) setHover(null);
            }}
          >
            <svg
              className="timeline-bars"
              viewBox={`0 0 ${histogram.length * 3} 64`}
              preserveAspectRatio="none"
              aria-hidden="true"
            >
              {histogram.map((count, i) => (
                <rect
                  key={i}
                  x={i * 3}
                  y={64 - Math.max(1, Math.sqrt(count / max) * 60)}
                  width="2"
                  height={Math.max(1, Math.sqrt(count / max) * 60)}
                  rx="0.7"
                  className={
                    bounds[0] + i >= range[0] && bounds[0] + i <= cursor
                      ? "elapsed"
                      : bounds[0] + i <= range[1] && bounds[0] + i >= range[0]
                        ? "in-range"
                        : ""
                  }
                />
              ))}
            </svg>
            <div
              className="timeline-selection"
              style={{
                left: `${percent(range[0])}%`,
                width: `${percent(range[1]) - percent(range[0])}%`,
              }}
            />
            <div
              className="timeline-range-grip"
              title="Tarih aralığını taşı"
              style={{
                left: `${percent(range[0])}%`,
                width: `${percent(range[1]) - percent(range[0])}%`,
              }}
              onPointerDown={(event) => startDrag(event, "range")}
            />
            {(["start", "end"] as const).map((kind, i) => (
              <button
                key={kind}
                className={`timeline-handle ${kind}`}
                role="slider"
                aria-label={i === 0 ? "Aralık başlangıcı" : "Aralık sonu"}
                aria-valuemin={i === 0 ? bounds[0] : range[0]}
                aria-valuemax={i === 0 ? range[1] : bounds[1]}
                aria-valuenow={range[i]}
                aria-valuetext={monthLabel(range[i])}
                style={{ left: `${percent(range[i])}%` }}
                onPointerDown={(event) => startDrag(event, kind)}
                onKeyDown={(event) => {
                  const delta =
                    event.key === "ArrowRight" || event.key === "ArrowUp"
                      ? 1
                      : event.key === "ArrowLeft" || event.key === "ArrowDown"
                        ? -1
                        : 0;
                  if (!delta && event.key !== "Home" && event.key !== "End")
                    return;
                  event.preventDefault();
                  const min = i === 0 ? bounds[0] : range[0],
                    max = i === 0 ? range[1] : bounds[1];
                  const value =
                    event.key === "Home"
                      ? min
                      : event.key === "End"
                        ? max
                        : Math.max(
                            min,
                            Math.min(
                              max,
                              range[i] + delta * (event.shiftKey ? 12 : 1),
                            ),
                          );
                  updateRange(i === 0 ? [value, range[1]] : [range[0], value]);
                }}
              >
                <span />
              </button>
            ))}
            <div
              className="timeline-playhead"
              style={{ left: `${percent(cursor)}%` }}
              aria-hidden="true"
            >
              <i />
            </div>
            {hover !== null && !drag.current && (
              <div
                className="timeline-tooltip"
                style={{
                  left: `${Math.max(8, Math.min(92, percent(hover)))}%`,
                }}
              >
                {monthLabel(hover)}
                <span>{number(histogram[hover - bounds[0]] || 0)} konser</span>
              </div>
            )}
          </div>
          <div className="timeline-ticks" aria-hidden="true">
            {ticks.map((month, i) => (
              <span key={i} style={{ left: `${percent(month)}%` }}>
                {Math.floor(month / 12)}
              </span>
            ))}
          </div>
        </div>
      </div>
      <div className="timeline-bottom">
        <div className="timeline-dates">
          <MonthInput
            label="Başlangıç tarihi"
            min={bounds[0]}
            max={range[1]}
            value={range[0]}
            onChange={(month) => updateRange([month, range[1]])}
          />
          <span>→</span>
          <MonthInput
            label="Bitiş tarihi"
            min={range[0]}
            max={bounds[1]}
            value={range[1]}
            onChange={(month) => updateRange([range[0], month])}
          />
        </div>
        <div className="timeline-presets">
          <span className="timeline-presets-label">Son</span>
          {[1, 5, 10, 20].map((years) => (
            <button
              key={years}
              aria-label={`Son ${years} yıl`}
              aria-pressed={
                range[0] === Math.max(bounds[0], bounds[1] - years * 12 + 1) &&
                range[1] === bounds[1]
              }
              onClick={() =>
                updateRange([
                  Math.max(bounds[0], bounds[1] - years * 12 + 1),
                  bounds[1],
                ])
              }
            >
              {years} yıl
            </button>
          ))}
          <button
            aria-label="Tüm tarihleri göster"
            aria-pressed={range[0] === bounds[0] && range[1] === bounds[1]}
            onClick={() => updateRange([...bounds])}
          >
            <RotateCcw size={11} /> Tümü
          </button>
        </div>
        {stats}
        <a
          className="timeline-source"
          href="https://bizimcaz.com"
          target="_blank"
          rel="noreferrer"
        >
          Bizim Caz <ArrowUpRight size={11} />
        </a>
      </div>
      <input
        className="timeline-scrubber"
        type="range"
        aria-label="Gösterilen tarih"
        aria-valuetext={monthLabel(cursor)}
        min={range[0]}
        max={range[1]}
        value={cursor}
        onChange={(e) => {
          setPlaying(false);
          onCursor(Number(e.target.value));
        }}
      />
    </section>
  );
}
