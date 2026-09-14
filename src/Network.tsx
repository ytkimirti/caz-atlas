import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
} from "react";
import type { Atlas, Edge, Ensemble } from "./types";
import type { LayoutEngine, LayoutStatus, ViewMode } from "./layout-options";
import type { LayoutResponse } from "./layout";
import { project3D, sceneBounds } from "./projection";
import type { Point3D } from "./projection";
import { groupInfo } from "./types";
import { adjacency, edgeKey, pathEdges } from "./graph";
import { clusterBounds, ensembleClusters } from "./ensembles";

export interface NetworkHandle {
  retryLayout: () => void;
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
  ensembles: Ensemble[];
  ensembleEdges: Edge[];
  showEnsembles: boolean;
  selected: number | null;
  hovered: number | null;
  path: number[];
  labels: boolean;
  instrument: string;
  engine: LayoutEngine;
  mode: ViewMode;
  spacing: number;
  resolution: number;
  onLayoutStatus: (status: LayoutStatus) => void;
  onSelect: (id: number | null) => void;
  onHover: (id: number | null) => void;
}

const Network = forwardRef<NetworkHandle, Props>(function Network(props, ref) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const previousPositions = useRef(new Map<number, Point3D>());
  const neighbors = useMemo(() => adjacency(props.data), [props.data]);
  const connectionStrengths = useMemo(() => {
    const ties =
      props.selected === null ? [] : (neighbors.get(props.selected) ?? []);
    const maxWeight = ties.reduce((max, tie) => Math.max(max, tie.weight), 1);
    return new Map(
      ties.map((tie) => [tie.id, Math.sqrt(tie.weight / maxWeight)]),
    );
  }, [neighbors, props.selected]);
  const edgesByKey = useMemo(
    () =>
      new Map(props.data.edges.map((e) => [edgeKey(e.source, e.target), e])),
    [props.data],
  );
  const clusters = useMemo(
    () =>
      ensembleClusters(
        props.ensembles,
        props.ensembleEdges,
        new Set(props.data.nodes.map((n) => n.id)),
      ),
    [props.ensembles, props.ensembleEdges, props.data],
  );
  const derived = {
    ...props,
    neighbors,
    connectionStrengths,
    edgesByKey,
    clusters,
  };
  const state = useRef(derived);
  state.current = derived;
  const api = useRef<NetworkHandle>({
    fit() {},
    zoom() {},
    focus() {},
    retryLayout() {},
  });
  const invalidate = useRef(() => {});
  useImperativeHandle(
    ref,
    () => ({
      fit: () => api.current.fit(),
      retryLayout: () => api.current.retryLayout(),
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
      props.instrument,
      props.edges,
      props.data,
      props.counts,
      props.ensembles,
      props.showEnsembles,
    ],
  );

  useEffect(() => {
    const canvas = canvasRef.current!;
    const ctx = canvas.getContext("2d")!;
    const nodes = props.layoutData.nodes;
    const positions = new Map(
      nodes.map((n) => [
        n.id,
        previousPositions.current.get(n.id) ?? { x: n.x, y: n.y },
      ]),
    );
    const spatial = props.mode === "3d";
    let scene = sceneBounds(positions.values());
    let yaw = 0.35,
      pitch = -0.2;
    const projected = new Map<number, ReturnType<typeof project3D>>();
    function updateProjection() {
      projected.clear();
      for (const [id, p] of positions)
        projected.set(
          id,
          spatial
            ? project3D(p, scene.center, scene.radius, yaw, pitch)
            : { x: p.x, y: p.y, depth: 0, scale: 1 },
        );
    }
    updateProjection();
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
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
    type View = { zoom: number; x: number; y: number };
    let camera: { from: View; to: View; start: number } | null = null;
    let hoverId: number | null = null;
    const pointers = new Map<number, { x: number; y: number }>();
    let startX = 0,
      startY = 0,
      moved = false,
      pinched = false;

    function point(id: number) {
      const p = projected.get(id)!;
      return { x: p.x * zoom + panX, y: p.y * zoom + panY };
    }
    function radius(id: number) {
      return Math.max(
        0.75,
        Math.min(
          9,
          (2 + Math.log2(1 + (state.current.counts[id] || 1)) * 0.5) *
            Math.sqrt(zoom) *
            (projected.get(id)?.scale ?? 1),
        ),
      );
    }
    function markerRadius(id: number) {
      const s = state.current;
      if (id === s.selected) return Math.max(8, radius(id) + 2);
      const strength = s.connectionStrengths.get(id);
      if (strength !== undefined)
        return (
          (3 + 5 * strength) *
          Math.max(0.75, Math.min(1.25, Math.sqrt(zoom))) *
          (projected.get(id)?.scale ?? 1)
        );
      if (s.path.includes(id)) return Math.max(4.5, radius(id) + 2);
      return radius(id);
    }
    function invalidateFrame() {
      if (!frame && !disposed) frame = requestAnimationFrame(draw);
    }
    function moveView(to: View, animate: boolean) {
      // Large graphs avoid repeated canvas work. Wheel and touch stay direct.
      if (animate && !reducedMotion.matches && nodes.length <= 2000) {
        camera = {
          from: { zoom, x: panX, y: panY },
          to,
          start: performance.now(),
        };
      } else {
        camera = null;
        zoom = to.zoom;
        panX = to.x;
        panY = to.y;
      }
      invalidateFrame();
    }
    function fit(animate = false) {
      if (!width || !height) return;
      if (!nodes.length) {
        invalidateFrame();
        return;
      }
      let minX = Infinity,
        minY = Infinity,
        maxX = -Infinity,
        maxY = -Infinity;
      for (const p of projected.values()) {
        minX = Math.min(minX, p.x);
        maxX = Math.max(maxX, p.x);
        minY = Math.min(minY, p.y);
        maxY = Math.max(maxY, p.y);
      }
      const availableWidth = width - (width > 700 ? 120 : 42);
      const availableHeight = height - (width > 700 ? 160 : 230);
      const nextZoom = Math.max(
        0.025,
        Math.min(
          2,
          availableWidth / (maxX - minX || 1),
          availableHeight / (maxY - minY || 1),
        ),
      );
      moveView(
        {
          zoom: nextZoom,
          x: width / 2 - ((minX + maxX) / 2) * nextZoom,
          y: height / 2 + 20 - ((minY + maxY) / 2) * nextZoom,
        },
        animate,
      );
    }
    function clearHover() {
      hoverId = null;
      state.current.onHover(null);
      canvas.style.cursor = "grab";
      invalidateFrame();
    }
    function zoomAt(factor: number, x = width / 2, y = height / 2) {
      camera = null;
      const next = Math.max(0.025, Math.min(12, zoom * factor));
      panX = x - ((x - panX) * next) / zoom;
      panY = y - ((y - panY) * next) / zoom;
      zoom = next;
      clearHover();
    }
    api.current = {
      retryLayout: () => startLayout(),
      fit: () => {
        clearHover();
        yaw = 0.35;
        pitch = -0.2;
        updateProjection();
        fit(true);
      },
      zoom: (factor) => {
        const base = camera?.to ?? { zoom, x: panX, y: panY };
        const next = Math.max(0.025, Math.min(12, base.zoom * factor));
        moveView(
          {
            zoom: next,
            x: width / 2 - ((width / 2 - base.x) * next) / base.zoom,
            y: height / 2 - ((height / 2 - base.y) * next) / base.zoom,
          },
          true,
        );
        clearHover();
      },
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
    let worker: Worker | null = null;
    let generation = 0;
    function startLayout() {
      const currentGeneration = ++generation;
      worker?.terminate();
      worker = null;
      const setStatus = (status: LayoutStatus) => {
        canvas.dataset.layout = status;
        canvas.setAttribute("aria-busy", String(status === "pending"));
        state.current.onLayoutStatus(status);
      };
      canvas.dataset.engine = spatial ? "ngraph" : props.engine;
      if (!nodes.length) {
        setStatus("ready");
        return;
      }
      setStatus("pending");
      let settled = false;
      const active = () =>
        !disposed && !settled && generation === currentGeneration;
      const fallback = () => {
        if (!active()) return;
        settled = true;
        worker?.terminate();
        worker = null;
        // Keep the currently visible positions and camera, including cached layouts.
        setStatus("fallback");
        invalidateFrame();
      };
      try {
        worker = new Worker(new URL("./layout.worker.ts", import.meta.url), {
          type: "module",
        });
        worker.onmessage = (event: MessageEvent<LayoutResponse>) => {
          if (!active()) return;
          if (event.data.status === "fallback") {
            fallback();
            return;
          }
          for (const node of event.data.positions)
            positions.set(node.id, { x: node.x, y: node.y, z: node.z });
          previousPositions.current = new Map(positions);
          scene = sceneBounds(positions.values());
          updateProjection();
          settled = true;
          worker?.terminate();
          worker = null;
          setStatus("ready");
          fit();
          if (state.current.selected !== null)
            api.current.focus(state.current.selected);
        };
        worker.onerror = (event) => {
          event.preventDefault();
          fallback();
        };
        worker.onmessageerror = fallback;
        worker.postMessage({
          nodes: nodes.map((n) => ({
            id: n.id,
            count: props.layoutCounts[n.id] || 0,
          })),
          edges: props.layoutData.edges,
          engine: props.engine,
          mode: props.mode,
          spacing: props.spacing,
          resolution: props.resolution,
        });
      } catch {
        fallback();
      }
    }
    startLayout();
    void document.fonts.ready.then(invalidateFrame);

    function hit(x: number, y: number) {
      let id: number | null = null,
        nearest = Infinity,
        front = -Infinity;
      for (const n of state.current.data.nodes) {
        const p = point(n.id),
          distance = Math.hypot(p.x - x, p.y - y);
        const depth = projected.get(n.id)!.depth;
        if (
          distance <= Math.max(7, markerRadius(n.id) + 3) &&
          (spatial ? depth > front : distance < nearest)
        ) {
          front = depth;
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
      camera = null;
      canvas.focus({ preventScroll: true });
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
        if (spatial && !event.shiftKey) {
          yaw += (p.x - old.x) * 0.006;
          pitch = Math.max(
            -Math.PI / 2,
            Math.min(Math.PI / 2, pitch + (p.y - old.y) * 0.006),
          );
          updateProjection();
        } else {
          panX += p.x - old.x;
          panY += p.y - old.y;
        }
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
    function keydown(event: KeyboardEvent) {
      if (
        !spatial ||
        !["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(event.key)
      )
        return;
      event.preventDefault();
      camera = null;
      const dx =
        event.key === "ArrowLeft" ? -1 : event.key === "ArrowRight" ? 1 : 0;
      const dy =
        event.key === "ArrowUp" ? -1 : event.key === "ArrowDown" ? 1 : 0;
      if (event.shiftKey) {
        panX += dx * 30;
        panY += dy * 30;
      } else {
        yaw += dx * 0.12;
        pitch = Math.max(
          -Math.PI / 2,
          Math.min(Math.PI / 2, pitch + dy * 0.12),
        );
        updateProjection();
      }
      clearHover();
    }
    canvas.addEventListener("keydown", keydown);
    canvas.addEventListener("pointerdown", down);
    canvas.addEventListener("pointermove", move);
    canvas.addEventListener("pointerup", up);
    canvas.addEventListener("pointercancel", cancel);
    canvas.addEventListener("pointerleave", clearHover);
    canvas.addEventListener("wheel", wheel, { passive: false });

    function draw(now: number) {
      frame = 0;
      if (camera) {
        const progress = reducedMotion.matches
          ? 1
          : Math.min(1, (now - camera.start) / 160);
        const eased = 1 - (1 - progress) ** 3;
        zoom = camera.from.zoom + (camera.to.zoom - camera.from.zoom) * eased;
        panX = camera.from.x + (camera.to.x - camera.from.x) * eased;
        panY = camera.from.y + (camera.to.y - camera.from.y) * eased;
        if (progress === 1) camera = null;
        else invalidateFrame();
      }
      canvas.dataset.animating = String(camera !== null);
      canvas.dataset.zoom = String(zoom);
      const s = state.current;
      const { neighbors, edgesByKey, clusters } = s;
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
      const focus = s.selected;
      const connected = new Set(
        focus === null
          ? []
          : [focus, ...(neighbors.get(focus) || []).map((n) => n.id)],
      );
      const routeNodes = new Set(s.path),
        routeEdges = pathEdges(s.path);
      const highlighted = new Set(
        s.data.nodes
          .filter((node) => node.group === s.instrument)
          .map((node) => node.id),
      );
      const emphasized = new Set([...connected, ...routeNodes]);
      if (s.selected !== null) emphasized.add(s.selected);
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
        // Scale shared concert counts without letting a frequent tie dominate.
        // Paint stronger ties last so they remain clear at crossings.
        for (const edge of focusEdges.sort((a, b) => a.weight - b.weight)) {
          const other = edge.source === focus ? edge.target : edge.source;
          const strength = s.connectionStrengths.get(other)!;
          lines(
            [edge],
            `rgba(40, 100, 77, ${0.25 + 0.7 * strength})`,
            0.7 + 3.3 * strength,
          );
        }
      }
      if (routeEdges.size)
        lines(
          [...routeEdges].map((key) => edgesByKey.get(key)!).filter(Boolean),
          "#b64e31",
          3.2,
        );
      // Draw collaborators last so their larger markers stay above the graph.
      const drawOrder = [
        ...nodes.filter((n) => !emphasized.has(n.id) && !highlighted.has(n.id)),
        ...nodes.filter((n) => highlighted.has(n.id) && !emphasized.has(n.id)),
        ...nodes
          .filter((n) => emphasized.has(n.id))
          .sort((a, b) => {
            const priority = (id: number) =>
              id === s.selected
                ? 3
                : routeNodes.has(id)
                  ? 2
                  : (s.connectionStrengths.get(id) ?? 0);
            return priority(a.id) - priority(b.id);
          }),
      ];
      if (spatial)
        drawOrder.sort(
          (a, b) => projected.get(a.id)!.depth - projected.get(b.id)!.depth,
        );
      for (const node of drawOrder) {
        const alpha = opacity.get(node.id) || 0;
        if (!alpha) continue;
        const projection = projected.get(node.id)!;
        ctx.globalAlpha =
          alpha *
          (spatial ? 0.65 + 0.35 * (projection.depth / scene.radius) : 1);
        const p = point(node.id),
          r = markerRadius(node.id) * (0.5 + alpha * 0.5);
        const strength = s.connectionStrengths.get(node.id);
        if (p.x < -20 || p.y < -20 || p.x > width + 20 || p.y > height + 20)
          continue;
        const special = node.id === s.selected || node.id === s.hovered;
        if (emphasized.has(node.id)) {
          ctx.beginPath();
          ctx.arc(
            p.x,
            p.y,
            r + (strength === undefined ? 2.5 : 1 + 1.5 * strength),
            0,
            Math.PI * 2,
          );
          ctx.fillStyle = "#fafaf6";
          ctx.fill();
        }
        ctx.beginPath();
        ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
        ctx.fillStyle =
          routeNodes.has(node.id) && s.path.length > 1
            ? "#b64e31"
            : strength !== undefined
              ? `rgba(40, 100, 77, ${0.35 + 0.65 * strength})`
              : emphasized.has(node.id)
                ? "#28644d"
                : groupInfo(node.group).color;
        ctx.fill();
        if (spatial && r > 1.5) {
          const light = ctx.createRadialGradient(
            p.x - r * 0.35,
            p.y - r * 0.4,
            0,
            p.x,
            p.y,
            r,
          );
          light.addColorStop(0, "#ffffff80");
          light.addColorStop(0.5, "#ffffff00");
          light.addColorStop(1, "#172a2630");
          ctx.fillStyle = light;
          ctx.fill();
        }
        if (highlighted.has(node.id)) {
          ctx.beginPath();
          ctx.arc(p.x, p.y, r + 5, 0, Math.PI * 2);
          ctx.strokeStyle = "#fafaf6";
          ctx.lineWidth = 4;
          ctx.stroke();
          ctx.strokeStyle = groupInfo(node.group).color;
          ctx.lineWidth = 2;
          ctx.stroke();
        }
        if (special) {
          ctx.beginPath();
          ctx.arc(p.x, p.y, r + 3.5, 0, Math.PI * 2);
          ctx.strokeStyle = node.id === s.selected ? "#252c27" : "#527b68";
          ctx.lineWidth = 2;
          ctx.stroke();
        }
      }
      ctx.globalAlpha = 1;
      const occupied: { x: number; y: number; w: number; h: number }[] = [];
      // Give the active people first choice of space, then their strongest ties.
      // Selecting a hub must share the same finite budget as every other view.
      const collaborators =
        focus === null
          ? []
          : [...(neighbors.get(focus) ?? [])].sort(
              (a, b) =>
                b.weight - a.weight ||
                (s.counts[b.id] ?? 0) - (s.counts[a.id] ?? 0) ||
                a.id - b.id,
            );
      const orderedIds = new Set([
        ...(s.hovered === null ? [] : [s.hovered]),
        ...(s.selected === null ? [] : [s.selected]),
        ...s.path,
        ...collaborators.map((n) => n.id),
        ...(focus === null && s.hovered === null && s.labels
          ? ranked
              .filter((node) => !s.instrument || highlighted.has(node.id))
              .map((node) => node.id)
          : []),
      ]);
      const labelLimit =
        focus === null ? (width > 700 ? 20 : 8) : width > 700 ? 12 : 6;
      const visibleLabels: {
        id: number;
        x: number;
        y: number;
        w: number;
        h: number;
      }[] = [];
      const byId = new Map(s.data.nodes.map((n) => [n.id, n]));
      for (const id of orderedIds) {
        if (visibleLabels.length >= labelLimit) break;
        const n = byId.get(id);
        if (!n) continue;
        const special = emphasized.has(id);
        const p = point(id),
          r = markerRadius(id);
        if (p.x < 16 || p.x > width - 16 || p.y < 60 || p.y > height - 55)
          continue;
        ctx.globalAlpha = opacity.get(id) || 0;
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
          const best = candidates.find((candidate) => overlap(candidate) === 0);
          if (!best) continue;
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
        visibleLabels.push({ id, x, y, w, h: 18 });
      }
      ctx.globalAlpha = 1;
      if (animating) invalidateFrame();
      canvas.dataset.animating = String(animating || camera !== null);
      canvas.dataset.visibleNodes = String(s.data.nodes.length);
      canvas.dataset.musicianLabels = JSON.stringify(visibleLabels);
      const visibleEnsembles: string[] = [];
      if (s.showEnsembles) {
        const labeledMembers = new Set<number>();
        const markerBounds = s.data.nodes.map((node) => {
          const p = point(node.id);
          const r = markerRadius(node.id) + 7;
          return { x: p.x - r, y: p.y - r, w: r * 2, h: r * 2 };
        });
        for (const { ensemble, members } of clusters) {
          if (visibleEnsembles.length >= (width > 700 ? 2 : 1)) break;
          if (members.some((id) => labeledMembers.has(id))) continue;
          const bounds = clusterBounds(members, point, width, height);
          if (!bounds) continue;
          ctx.font =
            '500 10px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
          let name = ensemble.name;
          const maxWidth = Math.min(160, width - 60);
          while (ctx.measureText(name).width > maxWidth && name.length > 1)
            name = name.slice(0, -2).trimEnd() + "…";
          const w = ctx.measureText(name).width + 8,
            h = 16;
          const centerX = (bounds.left + bounds.right) / 2;
          const spots = [
            { x: centerX - w / 2, y: bounds.top - 28 },
            { x: centerX - w / 2, y: bounds.bottom + 30 },
          ];
          // Skip crowded hints instead of displacing them away from the group.
          const best = spots.find(
            ({ x, y }) =>
              x >= 8 &&
              x + w <= width - 8 &&
              y >= 90 &&
              y + h <= height - 75 &&
              ![...occupied, ...markerBounds].some(
                (b) =>
                  x < b.x + b.w && x + w > b.x && y < b.y + b.h && y + h > b.y,
              ),
          );
          if (!best) continue;
          const { x, y } = best;
          occupied.push({ x: x - 6, y: y - 6, w: w + 12, h: h + 12 });
          ctx.fillStyle = "#fafaf6ed";
          ctx.fillRect(x, y, w, h);
          ctx.textAlign = "center";
          ctx.fillStyle = "#7b876e";
          ctx.fillText(name, x + w / 2, y + 11);
          visibleEnsembles.push(ensemble.name);
          members.forEach((id) => labeledMembers.add(id));
        }
      }
      canvas.dataset.ensembles = JSON.stringify(visibleEnsembles);
      // Expose the rendered state for interaction checks.
      canvas.dataset.visibleEdges = String(s.edges.length);
      canvas.dataset.highlighted = [...highlighted].join(",");
      canvas.dataset.view = `${zoom},${panX},${panY}`;
      canvas.dataset.rotation = `${yaw},${pitch}`;
      canvas.dataset.depth = String(spatial ? scene.radius : 0);
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
      worker?.terminate();
      canvas.removeEventListener("keydown", keydown);
      canvas.removeEventListener("pointerdown", down);
      canvas.removeEventListener("pointermove", move);
      canvas.removeEventListener("pointerup", up);
      canvas.removeEventListener("pointercancel", cancel);
      canvas.removeEventListener("pointerleave", clearHover);
      canvas.removeEventListener("wheel", wheel);
      invalidate.current = () => {};
    };
  }, [
    props.layoutData,
    props.layoutCounts,
    props.engine,
    props.mode,
    props.spacing,
    props.resolution,
  ]);

  return (
    <canvas
      ref={canvasRef}
      className="network-canvas"
      role="img"
      tabIndex={0}
      data-mode={props.mode}
      aria-describedby={props.mode === "3d" ? "spatial-help" : undefined}
      aria-label={`${props.data.nodes.length} müzisyenin ${props.mode.toUpperCase()} bağlantı grafı. Hover ile bağlantıları, seçimden sonra hover ile en kısa yolu görün. Klavye ile seçim için aramayı kullanın.`}
    />
  );
});
export default Network;
