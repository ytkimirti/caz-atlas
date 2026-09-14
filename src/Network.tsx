import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from "react";
import type { Atlas, Mode, Musician } from "./types";
import { groupInfo, groups, number } from "./types";
import { adjacency, edgeKey, pathEdges } from "./graph";
export interface NetworkHandle {
  fit: () => void;
  zoom: (factor: number) => void;
  export: () => void;
  focus: (id: number) => void;
}
interface Props {
  data: Atlas;
  mode: Mode;
  selected: number | null;
  instrument: string | null;
  labels: boolean;
  playing: boolean;
  path: number[];
  onSelect: (id: number | null) => void;
  onZoom: (zoom: number) => void;
}
const Network = forwardRef<NetworkHandle, Props>(function Network(props, ref) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const state = useRef(props);
  state.current = props;
  const api = useRef<NetworkHandle>({
    fit() {},
    zoom() {},
    export() {},
    focus() {},
  });
  const invalidate = useRef(() => {});
  const [hover, setHover] = useState<{
    node: Musician;
    x: number;
    y: number;
  } | null>(null);
  useImperativeHandle(
    ref,
    () => ({
      fit: () => api.current.fit(),
      zoom: (f) => api.current.zoom(f),
      export: () => api.current.export(),
      focus: (id) => api.current.focus(id),
    }),
    [],
  );
  useEffect(() => {
    invalidate.current();
  }, [
    props.mode,
    props.selected,
    props.instrument,
    props.labels,
    props.playing,
    props.path,
  ]);
  useEffect(() => {
    const canvas = canvasRef.current!,
      ctx = canvas.getContext("2d")!;
    const nodes = props.data.nodes,
      byId = new Map(nodes.map((n, i) => [n.id, i]));
    const neighbors = adjacency(props.data);
    const links = props.data.edges.map((e) => ({
      ...e,
      a: byId.get(e.source)!,
      b: byId.get(e.target)!,
    }));
    const ordered = nodes
      .map((_, i) => i)
      .sort((a, b) => nodes[b].degree - nodes[a].degree);
    const colors = nodes.map((n) => groupInfo(n.group).color);
    const positions = nodes.map((n) =>
      props.mode === "islands"
        ? { x: n.islandX * 1.16, y: n.islandY }
        : props.mode === "record"
          ? { x: n.recordX, y: n.recordY }
          : { x: n.x * 1.3, y: n.y },
    );
    const reducedMotion = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;
    let width = 0,
      height = 0,
      ratio = 1,
      zoom = 1,
      panX = 0,
      panY = 0,
      dirty = true,
      frame = 0,
      previous = 0;
    let currentMode = state.current.mode,
      lastSelected: number | null = null,
      active = new Set<number>(),
      currentPath: number[] = [],
      highlightedEdges = new Set<string>();
    let hoverId: number | null = null,
      dragged: number | null = null,
      moved = false,
      downX = 0,
      downY = 0;
    const pointers = new Map<number, { x: number; y: number }>();
    let pinchDistance = 0;
    function point(index: number) {
      return {
        x: positions[index].x * zoom + panX,
        y: positions[index].y * zoom + panY,
      };
    }
    function target(n: Musician) {
      const mode = state.current.mode;
      return mode === "islands"
        ? { x: n.islandX * 1.16, y: n.islandY }
        : mode === "record"
          ? { x: n.recordX, y: n.recordY }
          : { x: n.x * 1.3, y: n.y };
    }
    function fit() {
      let minX = Infinity,
        maxX = -Infinity,
        minY = Infinity,
        maxY = -Infinity;
      for (const n of nodes) {
        const p = target(n);
        minX = Math.min(minX, p.x);
        maxX = Math.max(maxX, p.x);
        minY = Math.min(minY, p.y);
        maxY = Math.max(maxY, p.y);
      }
      zoom = Math.max(
        0.04,
        Math.min(
          (width - 70) / (maxX - minX || 1),
          (height - 90) / (maxY - minY || 1),
        ),
      );
      panX = width / 2 - ((minX + maxX) / 2) * zoom;
      panY = height / 2 - ((minY + maxY) / 2) * zoom;
      dirty = true;
      state.current.onZoom(zoom);
    }
    function zoomAt(factor: number, x = width / 2, y = height / 2) {
      const next = Math.max(0.035, Math.min(9, zoom * factor));
      panX = x - ((x - panX) * next) / zoom;
      panY = y - ((y - panY) * next) / zoom;
      zoom = next;
      dirty = true;
      state.current.onZoom(zoom);
    }
    api.current = {
      fit,
      zoom: zoomAt,
      focus(id) {
        const index = byId.get(id);
        if (index === undefined) return;
        zoom = Math.max(zoom, 1.1);
        panX = width * 0.42 - positions[index].x * zoom;
        panY = height / 2 - positions[index].y * zoom;
        dirty = true;
        state.current.onZoom(zoom);
      },
      export() {
        const out = document.createElement("canvas");
        out.width = canvas.width;
        out.height = canvas.height + 64 * ratio;
        const c = out.getContext("2d")!;
        c.fillStyle = "#0b0e12";
        c.fillRect(0, 0, out.width, out.height);
        c.drawImage(canvas, 0, 0);
        c.scale(ratio, ratio);
        c.fillStyle = "#d8f58a";
        c.font = "bold 18px sans-serif";
        c.fillText("caz atlası", 25, height + 30);
        c.fillStyle = "#a7acb5";
        c.font = "11px sans-serif";
        c.fillText(
          `${number(nodes.length)} müzisyen · ${number(links.length)} bağlantı · Kaynak: bizimcaz.com`,
          150,
          height + 30,
        );
        const link = document.createElement("a");
        link.download = "caz-atlasi.png";
        link.href = out.toDataURL("image/png");
        link.click();
      },
    };
    const observer = new ResizeObserver(() => {
      const bounds = canvas.getBoundingClientRect();
      width = bounds.width;
      height = bounds.height;
      ratio = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.round(width * ratio);
      canvas.height = Math.round(height * ratio);
      fit();
    });
    observer.observe(canvas);
    invalidate.current = () => {
      dirty = true;
    };
    void document.fonts.ready.then(() => {
      dirty = true;
    });
    function hit(x: number, y: number) {
      let index: number | null = null,
        nearest = 64;
      for (let i = 0; i < nodes.length; i++) {
        const p = point(i),
          distance = (p.x - x) ** 2 + (p.y - y) ** 2;
        if (distance < nearest) {
          nearest = distance;
          index = i;
        }
      }
      return index;
    }
    function local(event: PointerEvent | WheelEvent) {
      const r = canvas.getBoundingClientRect();
      return { x: event.clientX - r.left, y: event.clientY - r.top };
    }
    function down(event: PointerEvent) {
      const p = local(event);
      pointers.set(event.pointerId, p);
      canvas.setPointerCapture(event.pointerId);
      downX = p.x;
      downY = p.y;
      moved = false;
      dragged = hit(p.x, p.y);
      setHover(null);
      if (pointers.size === 2) {
        dragged = null;
        const [a, b] = [...pointers.values()];
        pinchDistance = Math.hypot(a.x - b.x, a.y - b.y);
      }
    }
    function move(event: PointerEvent) {
      const p = local(event),
        old = pointers.get(event.pointerId);
      if (old) {
        if (Math.hypot(p.x - downX, p.y - downY) > 4) moved = true;
        pointers.set(event.pointerId, p);
        if (pointers.size > 1) {
          const [a, b] = [...pointers.values()],
            distance = Math.hypot(a.x - b.x, a.y - b.y);
          if (pinchDistance)
            zoomAt(distance / pinchDistance, (a.x + b.x) / 2, (a.y + b.y) / 2);
          pinchDistance = distance;
        } else if (dragged !== null && moved) {
          positions[dragged].x += (p.x - old.x) / zoom;
          positions[dragged].y += (p.y - old.y) / zoom;
        } else {
          panX += p.x - old.x;
          panY += p.y - old.y;
        }
        dirty = true;
        return;
      }
      const index = hit(p.x, p.y),
        id = index === null ? null : nodes[index].id;
      canvas.style.cursor = id !== null ? "pointer" : "grab";
      if (hoverId !== id) {
        hoverId = id;
        dirty = true;
        setHover(
          index === null
            ? null
            : {
                node: nodes[index],
                x: Math.min(width - 230, Math.max(8, p.x + 16)),
                y: Math.max(8, Math.min(height - 85, p.y - 50)),
              },
        );
      }
    }
    function up(event: PointerEvent) {
      const p = local(event);
      if (!moved && pointers.size === 1) {
        const index = hit(p.x, p.y);
        state.current.onSelect(index === null ? null : nodes[index].id);
      }
      pointers.delete(event.pointerId);
      dragged = null;
      pinchDistance = 0;
      dirty = true;
    }
    function cancel(event: PointerEvent) {
      pointers.delete(event.pointerId);
      dragged = null;
      pinchDistance = 0;
      moved = true;
    }
    function leave() {
      hoverId = null;
      setHover(null);
      dirty = true;
    }
    function wheel(event: WheelEvent) {
      event.preventDefault();
      const p = local(event);
      zoomAt(Math.exp(-event.deltaY * 0.0015), p.x, p.y);
    }
    canvas.addEventListener("pointerdown", down);
    canvas.addEventListener("pointermove", move);
    canvas.addEventListener("pointerup", up);
    canvas.addEventListener("pointercancel", cancel);
    canvas.addEventListener("pointerleave", leave);
    canvas.addEventListener("wheel", wheel, { passive: false });
    let transition = 0;
    function draw(time: number) {
      frame = requestAnimationFrame(draw);
      const s = state.current;
      if (s.mode !== currentMode) {
        currentMode = s.mode;
        transition = reducedMotion ? 1 : 65;
        fit();
      }
      if (lastSelected !== s.selected) {
        lastSelected = s.selected;
        active = new Set(
          s.selected === null
            ? []
            : [
                s.selected,
                ...(neighbors.get(s.selected) || []).map((n) => n.id),
              ],
        );
        dirty = true;
      }
      if (currentPath !== s.path) {
        currentPath = s.path;
        highlightedEdges = pathEdges(s.path);
        dirty = true;
      }
      if (!dirty && !transition && (!s.playing || reducedMotion)) return;
      if (s.playing && !dirty && time - previous < 33) return;
      previous = time;
      if (transition) {
        for (let i = 0; i < nodes.length; i++) {
          const t = target(nodes[i]);
          positions[i].x += (t.x - positions[i].x) * (reducedMotion ? 1 : 0.13);
          positions[i].y += (t.y - positions[i].y) * (reducedMotion ? 1 : 0.13);
        }
        transition--;
      }
      dirty = false;
      ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
      ctx.clearRect(0, 0, width, height);
      const selected = s.selected !== null,
        hasPath = s.path.length > 0;
      const isActive = (n: Musician) =>
        (!selected || active.has(n.id)) &&
        (!s.instrument || n.group === s.instrument) &&
        (!hasPath || s.path.includes(n.id));
      if (s.mode === "record") {
        ctx.save();
        ctx.translate(panX, panY);
        ctx.strokeStyle = "#b6c6d014";
        ctx.lineWidth = 1;
        for (let r = 180; r < 1200; r += 90) {
          ctx.beginPath();
          ctx.arc(0, 0, r * zoom, 0, Math.PI * 2);
          ctx.stroke();
        }
        ctx.beginPath();
        ctx.arc(0, 0, 110 * zoom, 0, Math.PI * 2);
        ctx.fillStyle = "#d8f58a15";
        ctx.fill();
        ctx.fillStyle = "#d8f58a";
        ctx.textAlign = "center";
        ctx.font = '600 10px "Space Grotesk", sans-serif';
        ctx.fillText("SIDE A", 0, -3);
        ctx.font = '9px "DM Sans", sans-serif';
        ctx.fillText("33⅓ RPM", 0, 12);
        ctx.restore();
      }
      // Batch every edge into a single path. All relationships remain on the canvas.
      ctx.beginPath();
      ctx.strokeStyle =
        selected || hasPath || s.instrument
          ? "#8194af0a"
          : s.mode === "record"
            ? "#91a4b908"
            : "#7895b615";
      ctx.lineWidth = 0.55;
      for (const e of links) {
        const a = point(e.a),
          b = point(e.b);
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(b.x, b.y);
      }
      ctx.stroke();
      if (selected || hasPath) {
        ctx.beginPath();
        ctx.strokeStyle = "#d8f58a85";
        ctx.lineWidth = hasPath ? 2 : 0.95;
        for (const e of links)
          if (
            hasPath
              ? highlightedEdges.has(edgeKey(e.source, e.target))
              : e.source === s.selected || e.target === s.selected
          ) {
            const a = point(e.a),
              b = point(e.b);
            ctx.moveTo(a.x, a.y);
            ctx.lineTo(b.x, b.y);
          }
        ctx.stroke();
      }
      if (s.mode === "islands") {
        ctx.textAlign = "center";
        ctx.font = '500 11px "DM Sans", sans-serif';
        groups.forEach((g, i) => {
          const theta = (i / groups.length) * Math.PI * 2 - Math.PI / 2;
          ctx.fillStyle = g.color;
          ctx.fillText(
            g.name.toLocaleUpperCase("tr-TR"),
            Math.cos(theta) * 780 * 1.16 * zoom + panX,
            Math.sin(theta) * 780 * zoom + panY - 265 * zoom - 10,
          );
        });
      }
      for (let i = nodes.length - 1; i >= 0; i--) {
        const n = nodes[i],
          p = point(i);
        if (p.x < -20 || p.y < -20 || p.x > width + 20 || p.y > height + 20)
          continue;
        const lit = isActive(n),
          isSelected =
            n.id === s.selected ||
            n.id === hoverId ||
            (hasPath && s.path.includes(n.id));
        let r = Math.max(
          0.65,
          Math.min(12, (2.4 + Math.sqrt(n.degree) * 0.55) * zoom),
        );
        if (isSelected) r = Math.max(4.5, r);
        ctx.globalAlpha = lit ? (n.degree ? 0.94 : 0.53) : 0.13;
        if (isSelected || (lit && n.degree > 250 && zoom > 0.2)) {
          ctx.beginPath();
          ctx.arc(p.x, p.y, r + 4, 0, Math.PI * 2);
          ctx.fillStyle = colors[i] + "16";
          ctx.fill();
        }
        ctx.beginPath();
        ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
        ctx.fillStyle = isSelected ? "#e1f7ae" : colors[i];
        ctx.fill();
        if (isSelected) {
          ctx.beginPath();
          ctx.arc(p.x, p.y, r + 4, 0, Math.PI * 2);
          ctx.strokeStyle = "#d8f58a";
          ctx.lineWidth = 0.8;
          ctx.stroke();
        }
      }
      ctx.globalAlpha = 1;
      if (s.playing && !reducedMotion) {
        for (let i = 0; i < Math.min(90, links.length); i++) {
          const e = links[(i * 127) % links.length],
            a = point(e.a),
            b = point(e.b),
            phase = (time * 0.00017 + i * 0.071) % 1;
          ctx.beginPath();
          ctx.arc(
            a.x + (b.x - a.x) * phase,
            a.y + (b.y - a.y) * phase,
            1.8,
            0,
            Math.PI * 2,
          );
          ctx.fillStyle = "#e3f9bc";
          ctx.fill();
        }
      }
      const occupied: { x: number; y: number; w: number; h: number }[] = [];
      const labelOrder = [
        ...new Set([
          ...(s.selected !== null ? [byId.get(s.selected)!] : []),
          ...(hoverId !== null ? [byId.get(hoverId)!] : []),
          ...s.path.map((id) => byId.get(id)!),
          ...ordered,
        ]),
      ];
      let labelCount = 0;
      for (const i of labelOrder) {
        const n = nodes[i];
        if (!n) continue;
        const special =
          n.id === s.selected || n.id === hoverId || s.path.includes(n.id);
        if (
          !special &&
          (!s.labels || !isActive(n) || (!n.degree && zoom < 1.5))
        )
          continue;
        if (!special && labelCount > Math.min(140, 18 + zoom * 30)) continue;
        const p = point(i),
          r = Math.max(2, (2.4 + Math.sqrt(n.degree) * 0.55) * zoom);
        if (p.x < 20 || p.x > width - 50 || p.y < 20 || p.y > height - 25)
          continue;
        ctx.font = `${special ? "600" : "450"} ${special ? 12 : 10}px "DM Sans", sans-serif`;
        const w = ctx.measureText(n.name).width + 12,
          x = p.x - w / 2,
          y = p.y + r + 5;
        if (
          !special &&
          occupied.some(
            (b) =>
              x < b.x + b.w && x + w > b.x && y < b.y + b.h && y + 17 > b.y,
          )
        )
          continue;
        occupied.push({ x: x - 4, y: y - 3, w: w + 8, h: 25 });
        ctx.fillStyle = "#0b0e12d9";
        ctx.beginPath();
        ctx.roundRect(x, y, w, 17, 4);
        ctx.fill();
        ctx.fillStyle = special ? "#e6f8c1" : "#bcc5d1";
        ctx.textAlign = "center";
        ctx.fillText(n.name, p.x, y + 12);
        labelCount++;
      }
    }
    frame = requestAnimationFrame(draw);
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      canvas.removeEventListener("pointerdown", down);
      canvas.removeEventListener("pointermove", move);
      canvas.removeEventListener("pointerup", up);
      canvas.removeEventListener("pointercancel", cancel);
      canvas.removeEventListener("pointerleave", leave);
      canvas.removeEventListener("wheel", wheel);
    };
  }, [props.data]);
  return (
    <>
      <canvas
        ref={canvasRef}
        className="network-canvas"
        aria-label={`${number(props.data.nodes.length)} müzisyen ve ${number(props.data.edges.length)} bağlantının etkileşimli grafı. Müzisyenleri arama kutusundan veya arşivden de seçebilirsiniz.`}
        role="img"
      />
      {hover && (
        <div className="graph-tooltip" style={{ left: hover.x, top: hover.y }}>
          <span
            className="color-dot"
            style={{ background: groupInfo(hover.node.group).color }}
          />
          <strong>{hover.node.name}</strong>
          <small>
            {groupInfo(hover.node.group).name} · {number(hover.node.degree)}{" "}
            bağlantı
          </small>
        </div>
      )}
    </>
  );
});
export default Network;
