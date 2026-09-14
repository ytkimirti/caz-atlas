import { useEffect, useRef, useState } from "react";
import type { CSSProperties, PointerEvent as ReactPointerEvent } from "react";
import { ArrowUpRight, Pause, Play, RotateCcw } from "lucide-react";
import { monthIndex, monthLabel, monthValue } from "./chronology";
import type { DateRange } from "./chronology";
import { number } from "./types";

interface Props {
  bounds: DateRange;
  range: DateRange;
  cursor: number;
  histogram: number[];
  musicians: number;
  edges: number;
  concerts: number;
  onRange: (range: DateRange) => void;
  onCursor: (cursor: number) => void;
}

export default function Timeline({
  bounds,
  range,
  cursor,
  histogram,
  musicians,
  edges,
  concerts,
  onRange,
  onCursor,
}: Props) {
  const [playing, setPlaying] = useState(false);
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
  const step = Math.max(1, Math.round((range[1] - range[0]) / 100));
  useEffect(() => {
    if (!playing) return;
    if (cursor >= range[1]) {
      setPlaying(false);
      return;
    }
    const timer = window.setTimeout(
      () => onCursor(Math.min(range[1], cursor + step)),
      300 / speed,
    );
    return () => window.clearTimeout(timer);
  }, [playing, cursor, range, speed, step, onCursor]);
  useEffect(() => {
    const pause = () => {
      if (document.hidden) setPlaying(false);
    };
    document.addEventListener("visibilitychange", pause);
    return () => document.removeEventListener("visibilitychange", pause);
  }, []);
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
  return (
    <section
      className={`timeline ${playing ? "is-playing" : ""}`}
      aria-label="Zaman çizelgesi"
      style={{ "--play-duration": `${300 / speed}ms` } as CSSProperties}
    >
      <div className="timeline-heading">
        <div className="timeline-title">
          <span className="timeline-eyebrow">
            <i /> ZAMAN İÇİNDE CAZ
          </span>
          <span className="timeline-explainer">
            Birlikte çaldıkça büyüyen bir ağ.
          </span>
        </div>
        <div className="timeline-stats">
          <span>
            <strong>{number(musicians)}</strong> müzisyen
          </span>
          <span>
            <strong>{number(edges)}</strong> güçlü bağ
          </span>
          <span title="Seçilen mekan ve tarihlerde arşivlenen konserler">
            <strong>{number(concerts)}</strong> konser
          </span>
        </div>
      </div>
      <div className="timeline-main">
        <div className="timeline-transport">
          <button
            className="timeline-play"
            aria-label={
              playing ? "Oynatmayı duraklat" : "Ağın büyümesini oynat"
            }
            disabled={range[0] === range[1]}
            onClick={() => {
              if (!playing && cursor >= range[1]) onCursor(range[0]);
              setPlaying(!playing);
            }}
          >
            {playing ? (
              <Pause size={19} fill="currentColor" />
            ) : (
              <Play size={19} fill="currentColor" />
            )}
          </button>
          <div className="timeline-now">
            <strong>{Math.floor(cursor / 12)}</strong>
            <span>
              {monthLabel(cursor).split(" ")[0]} <b>·</b>{" "}
              {playing
                ? "Oynatılıyor"
                : cursor < range[1]
                  ? "Duraklatıldı"
                  : "Keşfet"}
            </span>
          </div>
          <button
            className="timeline-speed"
            aria-label="Oynatma hızı"
            title="Oynatma hızını değiştir"
            onClick={() => setSpeed(speed === 4 ? 0.5 : speed * 2)}
          >
            {speed}×
          </button>
        </div>
        <div className="timeline-chart-wrap">
          <div
            className={`timeline-chart ${range[0] === range[1] ? "is-collapsed" : ""}`}
            ref={track}
            onPointerDown={(event) => {
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
              <span key={i}>{Math.floor(month / 12)}</span>
            ))}
          </div>
        </div>
      </div>
      <div className="timeline-bottom">
        <div className="timeline-dates">
          <input
            type="month"
            aria-label="Başlangıç tarihi"
            min={monthValue(bounds[0])}
            max={monthValue(range[1])}
            value={monthValue(range[0])}
            onChange={(e) => {
              if (e.target.value)
                updateRange([
                  Math.max(
                    bounds[0],
                    Math.min(range[1], monthIndex(e.target.value)),
                  ),
                  range[1],
                ]);
            }}
          />
          <span>→</span>
          <input
            type="month"
            aria-label="Bitiş tarihi"
            min={monthValue(range[0])}
            max={monthValue(bounds[1])}
            value={monthValue(range[1])}
            onChange={(e) => {
              if (e.target.value)
                updateRange([
                  range[0],
                  Math.max(
                    range[0],
                    Math.min(bounds[1], monthIndex(e.target.value)),
                  ),
                ]);
            }}
          />
        </div>
        <div className="timeline-presets">
          {[5, 10].map((years) => (
            <button
              key={years}
              onClick={() =>
                updateRange([
                  Math.max(bounds[0], bounds[1] - years * 12 + 1),
                  bounds[1],
                ])
              }
            >
              Son {years} yıl
            </button>
          ))}
          <button
            aria-label="Tüm tarihleri göster"
            onClick={() => updateRange([...bounds])}
          >
            <RotateCcw size={11} /> Tümü
          </button>
        </div>
        <span className="timeline-help">
          Çizgide gezin · Uçları sürükle, aralık seç
        </span>
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
