import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
} from "react";
import type { Atlas, Edge } from "./types";
import { groupInfo } from "./types";
import { adjacency, edgeKey, pathEdges } from "./graph";

export interface NetworkHandle {
  fit: () => void;
  zoom: (factor: number) => void;
  focus: (id: number) => void;
}
interface Props {
  data: Pick<Atlas, "nodes" | "edges">;
  layoutData: Pick<Atlas, "nodes" | "edges">;
  layoutCounts: Record<string, number>;
  edges: Edge[];
  counts: Record<string, number>;
  selected: number | null;
  hovered: number | null;
  path: number[];
  labels: boolean;
  onSelect: (id: number | null) => void;
  onHover: (id: number | null) => void;
}

const Network = forwardRef<NetworkHandle, Props>(function Network(props, ref) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const neighbors = useMemo(() => adjacency(props.data), [props.data]);
  const edgesByKey = useMemo(
    () =>
      new Map(props.data.edges.map((e) => [edgeKey(e.source, e.target), e])),
    [props.data],
  );
  const derived = { ...props, neighbors, edgesByKey };
  const state = useRef(derived);
  state.current = derived;
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
      props.data,
      props.counts,
    ],
  );

  useEffect(() => {
    const canvas = canvasRef.current!;
    const ctx = canvas.getContext("2d")!;
    const nodes = props.layoutData.nodes;
    const positions = new Map(nodes.map((n) => [n.id, { x: n.x, y: n.y }]));
    const opacity = new Map(props.data.nodes.map((n) => [n.id, 1]));
    const animatedEdges = new Map(
      props.edges.map((edge) => [
        edgeKey(edge.source, edge.target),
        { edge, alpha: 1 },
      ]),
    );
    const motion = window.matchMedia("(prefers-reduced-motion: reduce)");
    let lastFrame = 0;
    const ranked = [...nodes].sort(
      (a, b) =>
        (props.layoutCounts[b.id] || b.degree) -
        (props.layoutCounts[a.id] || a.degree),
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
      nodes: nodes.map((n) => ({
        id: n.id,
        count: props.layoutCounts[n.id] || 0,
      })),
      edges: props.layoutData.edges,
    });
    void document.fonts.ready.then(invalidateFrame);

    function hit(x: number, y: number) {
      let id: number | null = null,
        nearest = Infinity;
      for (const n of state.current.data.nodes) {
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

    function draw(now: number) {
      frame = 0;
      const s = state.current;
      const { neighbors, edgesByKey } = s;
      const visible = new Set(s.data.nodes.map((n) => n.id));
      const delta = motion.matches
        ? 1
        : Math.min(32, now - (lastFrame || now - 16)) / 300;
      lastFrame = now;
      let animating = false;
      for (const node of nodes) {
        const target = visible.has(node.id) ? 1 : 0,
          current = opacity.get(node.id) || 0;
        const next =
          target > current
            ? Math.min(target, current + delta)
            : Math.max(target, current - delta);
        opacity.set(node.id, next);
        if (next !== target) animating = true;
      }
      const visibleEdges = new Set(
        s.edges.map((e) => edgeKey(e.source, e.target)),
      );
      for (const edge of s.edges) {
        const key = edgeKey(edge.source, edge.target);
        if (!animatedEdges.has(key)) animatedEdges.set(key, { edge, alpha: 0 });
      }
      for (const [key, item] of animatedEdges) {
        const target = visibleEdges.has(key) ? 1 : 0;
        item.alpha =
          target > item.alpha
            ? Math.min(target, item.alpha + delta)
            : Math.max(target, item.alpha - delta);
        if (item.alpha !== target) animating = true;
        if (!item.alpha && !target) animatedEdges.delete(key);
      }
      ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
      ctx.clearRect(0, 0, width, height);
      const focus = s.hovered ?? s.selected;
      const routeNodes = new Set(s.path),
        routeEdges = pathEdges(s.path);
      function line(e: Edge) {
        if (!positions.has(e.source) || !positions.has(e.target)) return;
        const a = point(e.source),
          b = point(e.target);
        if (
          (a.x < 0 && b.x < 0) ||
          (a.y < 0 && b.y < 0) ||
          (a.x > width && b.x > width) ||
          (a.y > height && b.y > height)
        )
          return;
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(b.x, b.y);
      }
      function lines(edges: Edge[], color: string, lineWidth: number) {
        ctx.beginPath();
        ctx.strokeStyle = color;
        ctx.lineWidth = lineWidth;
        for (const e of edges) line(e);
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
      ctx.beginPath();
      ctx.strokeStyle = "#b8b9b080";
      ctx.lineWidth = 0.7;
      for (const { edge, alpha } of animatedEdges.values())
        if (alpha === 1) line(edge);
      ctx.stroke();
      for (const { edge, alpha } of animatedEdges.values()) {
        if (alpha === 1 || alpha === 0) continue;
        ctx.globalAlpha = alpha;
        ctx.beginPath();
        line(edge);
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
      if (focus !== null) {
        const focusEdges = (neighbors.get(focus) || []).map((n) =>
          edgesByKey.get(edgeKey(focus, n.id))!,
        );
        lines(focusEdges, s.path.length > 1 ? "#527b6850" : "#527b6890", 1);
      }
      if (routeEdges.size)
        lines(
          [...routeEdges].map((key) => edgesByKey.get(key)!).filter(Boolean),
          "#b64e31",
          2.4,
        );
      for (const node of nodes) {
        const alpha = opacity.get(node.id) || 0;
        if (!alpha) continue;
        ctx.globalAlpha = alpha;
        const p = point(node.id),
          r = radius(node.id) * (0.5 + alpha * 0.5);
        if (p.x < -20 || p.y < -20 || p.x > width + 20 || p.y > height + 20)
          continue;
        const special = node.id === s.selected || node.id === s.hovered;
        ctx.beginPath();
        ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
        ctx.fillStyle =
          routeNodes.has(node.id) && s.path.length > 1
            ? "#b64e31"
            : groupInfo(node.group).color;
        ctx.fill();
        if (special) {
          ctx.beginPath();
          ctx.arc(p.x, p.y, r + 3.5, 0, Math.PI * 2);
          ctx.strokeStyle = node.id === s.selected ? "#252c27" : "#527b68";
          ctx.lineWidth = 1.2;
          ctx.stroke();
        }
      }
      ctx.globalAlpha = 1;
      const occupied: { x: number; y: number; w: number; h: number }[] = [];
      const orderedIds = new Set([
        ...(s.hovered === null ? [] : [s.hovered]),
        ...(s.selected === null ? [] : [s.selected]),
        ...s.path,
        ...ranked.map((n) => n.id),
      ]);
      const byId = new Map(s.data.nodes.map((n) => [n.id, n]));
      let labels = 0;
      for (const id of orderedIds) {
        const n = byId.get(id);
        if (!n) continue;
        const special =
          id === s.selected || id === s.hovered || routeNodes.has(id);
        if (
          !special &&
          (!s.labels ||
            labels >
              (width > 700 ? Math.min(65, 14 + zoom * 26) : 10 + zoom * 12))
        )
          continue;
        const p = point(id),
          r = radius(id);
        if (p.x < 16 || p.x > width - 16 || p.y < 60 || p.y > height - 55)
          continue;
        ctx.globalAlpha = opacity.get(id) || 0;
        ctx.font = `${special ? 600 : 400} ${special ? 12 : 11}px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif`;
        const w = ctx.measureText(n.name).width + 10;
        const x = Math.max(4, Math.min(width - w - 4, p.x - w / 2)),
          y = p.y + r + 5;
        if (
          !special &&
          occupied.some(
            (b) =>
              x < b.x + b.w && x + w > b.x && y < b.y + b.h && y + 18 > b.y,
          )
        )
          continue;
        occupied.push({ x: x - 5, y: y - 5, w: w + 10, h: 28 });
        ctx.fillStyle = "#fafaf6ed";
        ctx.fillRect(x, y, w, 18);
        ctx.fillStyle =
          routeNodes.has(id) && s.path.length > 1
            ? "#a8442b"
            : special
              ? "#252c27"
              : "#686e65";
        ctx.textAlign = "center";
        ctx.fillText(n.name, x + w / 2, y + 13);
        labels++;
      }
      ctx.globalAlpha = 1;
      if (animating) invalidateFrame();
      canvas.dataset.animating = String(animating);
      canvas.dataset.visibleNodes = String(s.data.nodes.length);
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
  }, [props.layoutData, props.layoutCounts]);

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
