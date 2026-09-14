import { forwardRef, useEffect, useImperativeHandle, useRef } from "react";
import type { Atlas, Edge, Ensemble } from "./types";
import { groupInfo } from "./types";
import { adjacency, edgeKey, pathEdges } from "./graph";

export interface NetworkHandle {
  fit: () => void;
  zoom: (factor: number) => void;
  focus: (id: number) => void;
}
interface Props {
  data: Pick<Atlas, "nodes" | "edges">;
  edges: Edge[];
  counts: Record<string, number>;
  ensembles: Ensemble[];
  showEnsembles: boolean;
  selected: number | null;
  hovered: number | null;
  path: number[];
  labels: boolean;
  onSelect: (id: number | null) => void;
  onHover: (id: number | null) => void;
}

const Network = forwardRef<NetworkHandle, Props>(function Network(props, ref) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const state = useRef(props);
  state.current = props;
  const api = useRef<NetworkHandle>({ fit() {}, zoom() {}, focus() {} });
  const invalidate = useRef(() => {});
  useImperativeHandle(
    ref,
    () => ({
      fit: () => api.current.fit(),
      zoom: (factor) => api.current.zoom(factor),
      focus: (id) => api.current.focus(id),
    }),
    [],
  );
  useEffect(
    () => invalidate.current(),
    [
      props.selected,
      props.hovered,
      props.path,
      props.labels,
      props.edges,
      props.ensembles,
      props.showEnsembles,
    ],
  );

  useEffect(() => {
    const canvas = canvasRef.current!;
    const ctx = canvas.getContext("2d")!;
    const nodes = props.data.nodes;
    const positions = new Map(nodes.map((n) => [n.id, { x: n.x, y: n.y }]));
    const ensembleMembers = props.ensembles
      .map((ensemble) => ({
        ensemble,
        members: Object.keys(ensemble.musicians)
          .map(Number)
          .filter((id) => positions.has(id)),
      }))
      .filter((item) => item.members.length);
    const neighbors = adjacency(props.data);
    const edgesByKey = new Map(
      props.data.edges.map((e) => [edgeKey(e.source, e.target), e]),
    );
    const ranked = [...nodes].sort(
      (a, b) =>
        (props.counts[b.id] || b.degree) - (props.counts[a.id] || a.degree),
    );
    let width = 0,
      height = 0,
      ratio = 1,
      zoom = 1,
      panX = 0,
      panY = 0,
      frame = 0,
      disposed = false;
    let hoverId: number | null = null;
    const pointers = new Map<number, { x: number; y: number }>();
    let startX = 0,
      startY = 0,
      moved = false,
      pinched = false;

    function point(id: number) {
      const p = positions.get(id)!;
      return { x: p.x * aspect() * zoom + panX, y: p.y * zoom + panY };
    }
    function aspect() {
      return width > 700 ? 1.35 : 0.55;
    }
    function radius(id: number) {
      return Math.max(
        2,
        Math.min(
          9,
          (2 + Math.log2(1 + (state.current.counts[id] || 1)) * 0.5) *
            Math.sqrt(zoom),
        ),
      );
    }
    function invalidateFrame() {
      if (!frame && !disposed) frame = requestAnimationFrame(draw);
    }
    function fit() {
      if (!width || !height) return;
      if (!nodes.length) {
        invalidateFrame();
        return;
      }
      let minX = Infinity,
        minY = Infinity,
        maxX = -Infinity,
        maxY = -Infinity;
      for (const p of positions.values()) {
        minX = Math.min(minX, p.x * aspect());
        maxX = Math.max(maxX, p.x * aspect());
        minY = Math.min(minY, p.y);
        maxY = Math.max(maxY, p.y);
      }
      const availableWidth = width - (width > 700 ? 120 : 42);
      const availableHeight = height - (width > 700 ? 160 : 230);
      zoom = Math.max(
        0.025,
        Math.min(
          2,
          availableWidth / (maxX - minX || 1),
          availableHeight / (maxY - minY || 1),
        ),
      );
      panX = width / 2 - ((minX + maxX) / 2) * zoom;
      panY = height / 2 + 20 - ((minY + maxY) / 2) * zoom;
      invalidateFrame();
    }
    function clearHover() {
      hoverId = null;
      state.current.onHover(null);
      canvas.style.cursor = "grab";
      invalidateFrame();
    }
    function zoomAt(factor: number, x = width / 2, y = height / 2) {
      const next = Math.max(0.025, Math.min(12, zoom * factor));
      panX = x - ((x - panX) * next) / zoom;
      panY = y - ((y - panY) * next) / zoom;
      zoom = next;
      clearHover();
    }
    api.current = {
      fit,
      zoom: zoomAt,
      focus(id) {
        const p = positions.get(id);
        if (!p) return;
        const screen = point(id);
        // Keep the surrounding graph in view so a hovered route stays readable.
        if (
          screen.x < 30 ||
          screen.x > width - 30 ||
          screen.y < 140 ||
          screen.y > height - 100
        )
          fit();
        clearHover();
      },
    };
    invalidate.current = invalidateFrame;
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
    const worker = new Worker(new URL("./layout.worker.ts", import.meta.url), {
      type: "module",
    });
    canvas.dataset.layout = "pending";
    worker.onmessage = (
      event: MessageEvent<{ id: number; x: number; y: number }[]>,
    ) => {
      for (const node of event.data)
        positions.set(node.id, { x: node.x, y: node.y });
      canvas.dataset.layout = "ready";
      fit();
      if (state.current.selected !== null)
        api.current.focus(state.current.selected);
    };
    worker.onerror = () => {
      canvas.dataset.layout = "fallback";
    };
    worker.postMessage({
      nodes: nodes.map((n) => ({ id: n.id, count: props.counts[n.id] || 0 })),
      edges: props.data.edges,
    });
    void document.fonts.ready.then(invalidateFrame);

    function hit(x: number, y: number) {
      let id: number | null = null,
        nearest = Infinity;
      for (const n of nodes) {
        const p = point(n.id),
          distance = Math.hypot(p.x - x, p.y - y);
        if (distance <= Math.max(7, radius(n.id) + 3) && distance < nearest) {
          nearest = distance;
          id = n.id;
        }
      }
      return id;
    }
    function local(event: PointerEvent | WheelEvent) {
      const bounds = canvas.getBoundingClientRect();
      return { x: event.clientX - bounds.left, y: event.clientY - bounds.top };
    }
    function updateHover(x: number, y: number) {
      const id = hit(x, y);
      if (id !== hoverId) {
        hoverId = id;
        state.current.onHover(id);
        invalidateFrame();
      }
      canvas.style.cursor = id === null ? "grab" : "pointer";
    }
    function down(event: PointerEvent) {
      if (event.button !== 0) return;
      const p = local(event);
      pointers.set(event.pointerId, p);
      canvas.setPointerCapture(event.pointerId);
      if (pointers.size === 1) {
        startX = p.x;
        startY = p.y;
        moved = false;
        pinched = false;
      } else {
        pinched = true;
        moved = true;
      }
    }
    function move(event: PointerEvent) {
      const p = local(event),
        old = pointers.get(event.pointerId);
      if (!old) {
        if (event.pointerType !== "touch") updateHover(p.x, p.y);
        return;
      }
      if (pointers.size > 1) {
        const other = [...pointers.entries()].find(
          ([id]) => id !== event.pointerId,
        )![1];
        const before = Math.hypot(old.x - other.x, old.y - other.y);
        const after = Math.hypot(p.x - other.x, p.y - other.y);
        if (before > 0)
          zoomAt(after / before, (old.x + other.x) / 2, (old.y + other.y) / 2);
        panX += (p.x - old.x) / 2;
        panY += (p.y - old.y) / 2;
        pinched = true;
        moved = true;
      } else if (moved || Math.hypot(p.x - startX, p.y - startY) > 4) {
        panX += p.x - old.x;
        panY += p.y - old.y;
        moved = true;
        clearHover();
        canvas.style.cursor = "grabbing";
      }
      pointers.set(event.pointerId, p);
      invalidateFrame();
    }
    function up(event: PointerEvent) {
      if (!pointers.has(event.pointerId)) return;
      const p = local(event);
      if (!moved && !pinched && pointers.size === 1)
        state.current.onSelect(hit(p.x, p.y));
      pointers.delete(event.pointerId);
      if (canvas.hasPointerCapture(event.pointerId))
        canvas.releasePointerCapture(event.pointerId);
      if (event.pointerType !== "touch" && !moved) updateHover(p.x, p.y);
      else clearHover();
    }
    function cancel(event: PointerEvent) {
      pointers.delete(event.pointerId);
      moved = true;
      clearHover();
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
    canvas.addEventListener("pointerleave", clearHover);
    canvas.addEventListener("wheel", wheel, { passive: false });

    function draw() {
      frame = 0;
      const s = state.current;
      ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
      ctx.clearRect(0, 0, width, height);
      const focus = s.hovered ?? s.selected;
      const connected = new Set(
        focus === null
          ? []
          : [focus, ...(neighbors.get(focus) || []).map((n) => n.id)],
      );
      const routeNodes = new Set(s.path),
        routeEdges = pathEdges(s.path);
      const emphasized = new Set([...connected, ...routeNodes]);
      if (s.selected !== null) emphasized.add(s.selected);
      function lines(edges: Edge[], color: string, lineWidth: number) {
        ctx.beginPath();
        ctx.strokeStyle = color;
        ctx.lineWidth = lineWidth;
        for (const e of edges) {
          if (!positions.has(e.source) || !positions.has(e.target)) continue;
          const a = point(e.source),
            b = point(e.target);
          if (
            (a.x < 0 && b.x < 0) ||
            (a.y < 0 && b.y < 0) ||
            (a.x > width && b.x > width) ||
            (a.y > height && b.y > height)
          )
            continue;
          ctx.moveTo(a.x, a.y);
          ctx.lineTo(b.x, b.y);
        }
        ctx.stroke();
      }
      lines(s.edges, "#b8b9b080", 0.7);
      if (focus !== null) {
        const focusEdges = (neighbors.get(focus) || []).map((n) =>
          edgesByKey.get(edgeKey(focus, n.id))!,
        );
        lines(focusEdges, "#28644dd9", 1.8);
      }
      if (routeEdges.size)
        lines(
          [...routeEdges].map((key) => edgesByKey.get(key)!).filter(Boolean),
          "#b64e31",
          3.2,
        );
      // Draw collaborators last so their larger markers stay above the graph.
      const drawOrder = [
        ...nodes.filter((n) => !emphasized.has(n.id)),
        ...nodes.filter((n) => emphasized.has(n.id)),
      ];
      for (const node of drawOrder) {
        const p = point(node.id),
          r = emphasized.has(node.id)
            ? Math.max(4.5, radius(node.id) + 2)
            : radius(node.id);
        if (p.x < -20 || p.y < -20 || p.x > width + 20 || p.y > height + 20)
          continue;
        const special = node.id === s.selected || node.id === s.hovered;
        if (emphasized.has(node.id)) {
          ctx.beginPath();
          ctx.arc(p.x, p.y, r + 2.5, 0, Math.PI * 2);
          ctx.fillStyle = "#fafaf6";
          ctx.fill();
        }
        ctx.beginPath();
        ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
        ctx.fillStyle =
          routeNodes.has(node.id) && s.path.length > 1
            ? "#b64e31"
            : emphasized.has(node.id)
              ? "#28644d"
              : groupInfo(node.group).color;
        ctx.fill();
        if (special) {
          ctx.beginPath();
          ctx.arc(p.x, p.y, r + 3.5, 0, Math.PI * 2);
          ctx.strokeStyle = node.id === s.selected ? "#252c27" : "#527b68";
          ctx.lineWidth = 2;
          ctx.stroke();
        }
      }
      const occupied: { x: number; y: number; w: number; h: number }[] = [];
      const orderedIds = new Set([
        ...ranked.filter((n) => !emphasized.has(n.id)).map((n) => n.id),
        ...(s.hovered === null ? [] : [s.hovered]),
        ...(s.selected === null ? [] : [s.selected]),
        ...s.path,
        ...connected,
      ]);
      const byId = new Map(nodes.map((n) => [n.id, n]));
      let labels = 0;
      for (const id of orderedIds) {
        const n = byId.get(id);
        if (!n) continue;
        const special = emphasized.has(id);
        if (
          !special &&
          (!s.labels ||
            labels >
              (width > 700 ? Math.min(65, 14 + zoom * 26) : 10 + zoom * 12))
        )
          continue;
        const p = point(id),
          r = special ? Math.max(4.5, radius(id) + 2) : radius(id);
        if (p.x < 16 || p.x > width - 16 || p.y < 60 || p.y > height - 55)
          continue;
        ctx.font = `${special ? 600 : 400} ${special ? 12 : 11}px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif`;
        const w = ctx.measureText(n.name).width + 10;
        let x = Math.max(4, Math.min(width - w - 4, p.x - w / 2)),
          y = p.y + r + 5;
        if (special) {
          const candidates = [
            { x, y },
            { x, y: p.y - r - 23 },
            { x: p.x + r + 8, y: p.y - 9 },
            { x: p.x - r - w - 8, y: p.y - 9 },
            { x, y: p.y + r + 27 },
            { x, y: p.y - r - 45 },
          ].map((c) => ({
            x: Math.max(4, Math.min(width - w - 4, c.x)),
            y: Math.max(60, Math.min(height - 75, c.y)),
          }));
          const overlap = (c: { x: number; y: number }) =>
            occupied.reduce(
              (area, b) =>
                area +
                Math.max(0, Math.min(c.x + w, b.x + b.w) - Math.max(c.x, b.x)) *
                  Math.max(
                    0,
                    Math.min(c.y + 18, b.y + b.h) - Math.max(c.y, b.y),
                  ),
              0,
            );
          const best = candidates.reduce((a, b) =>
            overlap(a) <= overlap(b) ? a : b,
          );
          x = best.x;
          y = best.y;
          ctx.beginPath();
          ctx.moveTo(p.x, p.y);
          ctx.lineTo(
            Math.max(x, Math.min(x + w, p.x)),
            Math.max(y, Math.min(y + 18, p.y)),
          );
          ctx.strokeStyle = "#28644d80";
          ctx.lineWidth = 0.8;
          ctx.stroke();
        }
        if (
          !special &&
          occupied.some(
            (b) =>
              x < b.x + b.w && x + w > b.x && y < b.y + b.h && y + 18 > b.y,
          )
        )
          continue;
        occupied.push({ x: x - 5, y: y - 5, w: w + 10, h: 28 });
        ctx.fillStyle = special ? "#fafaf6" : "#fafaf6ed";
        ctx.fillRect(x, y, w, 18);
        ctx.fillStyle =
          routeNodes.has(id) && s.path.length > 1
            ? "#a8442b"
            : special
              ? "#174e38"
              : "#686e65";
        ctx.textAlign = "center";
        ctx.fillText(n.name, x + w / 2, y + 13);
        if (!special) labels++;
      }
      const visibleEnsembles: string[] = [];
      if (s.showEnsembles) {
        const candidates = ensembleMembers
          .map(({ ensemble, members }) => {
            const active = focus !== null && members.includes(focus);
            const visible = members
              .map(point)
              .filter(
                (p) =>
                  p.x > 20 && p.x < width - 20 && p.y > 90 && p.y < height - 75,
              );
            return { ensemble, members, active, visible };
          })
          .filter((item) => item.visible.length >= (item.active ? 1 : 2))
          .sort(
            (a, b) =>
              Number(b.active) - Number(a.active) ||
              b.ensemble.concerts - a.ensemble.concerts ||
              a.ensemble.id.localeCompare(b.ensemble.id),
          )
          .slice(0, 100);
        let activeLabels = 0;
        for (const { ensemble, members, active, visible } of candidates) {
          if (active && activeLabels >= 3) continue;
          if (
            !active &&
            (visibleEnsembles.length >=
              (width > 700 ? (zoom < 0.6 ? 4 : 12) : 4) ||
              visible.length < members.length / 2)
          )
            continue;
          const center = {
            x: visible.reduce((sum, p) => sum + p.x, 0) / visible.length,
            y: visible.reduce((sum, p) => sum + p.y, 0) / visible.length,
          };
          ctx.font =
            '600 12px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
          let name = ensemble.name;
          const maxWidth = Math.min(230, width - 60);
          while (ctx.measureText(name).width > maxWidth && name.length > 1)
            name = name.slice(0, -2).trimEnd() + "…";
          const w = Math.max(110, ctx.measureText(name).width + 24),
            h = 38;
          const spots = [
            { x: center.x - w / 2, y: center.y - h / 2 },
            {
              x: center.x - w / 2,
              y: Math.min(...visible.map((p) => p.y)) - h - 22,
            },
            {
              x: center.x - w / 2,
              y: Math.max(...visible.map((p) => p.y)) + 32,
            },
            { x: center.x - w / 2, y: center.y - 70 },
            { x: center.x - w / 2, y: center.y + 40 },
          ].map((p) => ({
            x: Math.max(8, Math.min(width - w - 8, p.x)),
            y: Math.max(95, Math.min(height - h - 80, p.y)),
          }));
          const overlap = (p: { x: number; y: number }) =>
            occupied.reduce(
              (sum, b) =>
                sum +
                Math.max(0, Math.min(p.x + w, b.x + b.w) - Math.max(p.x, b.x)) *
                  Math.max(
                    0,
                    Math.min(p.y + h, b.y + b.h) - Math.max(p.y, b.y),
                  ),
              0,
            ) +
            nodes.reduce((sum, node) => {
              const n = point(node.id);
              return (
                sum +
                (n.x > p.x - 8 &&
                n.x < p.x + w + 8 &&
                n.y > p.y - 8 &&
                n.y < p.y + h + 8
                  ? 1000
                  : 0)
              );
            }, 0);
          const best = spots.reduce((a, b) =>
            overlap(a) <= overlap(b) ? a : b,
          );
          if (!active && overlap(best) > 0) continue;
          const { x, y } = best;
          if (active) {
            ctx.save();
            ctx.setLineDash([3, 5]);
            ctx.strokeStyle = "#536c5370";
            ctx.lineWidth = 0.9;
            ctx.beginPath();
            for (const id of members) {
              const p = point(id);
              ctx.moveTo(x + w / 2, y + h / 2);
              ctx.lineTo(p.x, p.y);
            }
            ctx.stroke();
            ctx.restore();
            activeLabels++;
          }
          occupied.push({ x: x - 6, y: y - 6, w: w + 12, h: h + 12 });
          ctx.fillStyle = active ? "#e9eee2" : "#f1f3eb";
          ctx.fillRect(x, y, w, h);
          ctx.strokeStyle = active ? "#809472" : "#c9d1bf";
          ctx.lineWidth = 0.8;
          ctx.strokeRect(x, y, w, h);
          ctx.textAlign = "center";
          ctx.fillStyle = "#7b876e";
          ctx.font =
            '500 8px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
          ctx.fillText("GRUP / PROJE", x + w / 2, y + 12);
          ctx.fillStyle = active ? "#315434" : "#536c53";
          ctx.font =
            '600 12px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
          ctx.fillText(name, x + w / 2, y + 28);
          visibleEnsembles.push(ensemble.name);
        }
      }
      canvas.dataset.ensembles = JSON.stringify(visibleEnsembles);
      // Expose the rendered state for interaction checks.
      canvas.dataset.visibleEdges = String(s.edges.length);
      canvas.dataset.focus = focus === null ? "" : String(focus);
      canvas.dataset.path = s.path.join(",");
      canvas.dataset.selectedPosition =
        s.selected !== null && positions.has(s.selected)
          ? `${point(s.selected).x},${point(s.selected).y}`
          : "";
    }
    invalidateFrame();
    return () => {
      disposed = true;
      cancelAnimationFrame(frame);
      observer.disconnect();
      worker.terminate();
      canvas.removeEventListener("pointerdown", down);
      canvas.removeEventListener("pointermove", move);
      canvas.removeEventListener("pointerup", up);
      canvas.removeEventListener("pointercancel", cancel);
      canvas.removeEventListener("pointerleave", clearHover);
      canvas.removeEventListener("wheel", wheel);
      invalidate.current = () => {};
    };
  }, [props.data, props.counts, props.ensembles]);

  return (
    <canvas
      ref={canvasRef}
      className="network-canvas"
      role="img"
      aria-label={`${props.data.nodes.length} müzisyenin bağlantı grafı. Hover ile bağlantıları, seçimden sonra hover ile en kısa yolu görün. Klavye ile seçim için aramayı kullanın.`}
    />
  );
});
export default Network;
