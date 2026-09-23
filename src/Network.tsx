import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
} from "react";
import type { GraphData, Edge, Ensemble } from "./types";
import type { LayoutStatus, ViewMode } from "./layout-options";
import type { LayoutRequest, LayoutResponse, Position } from "./layout";
import { cacheLayout, cachedLayout, layoutKey } from "./layout-cache";
import { expandPlaybackView, frameNeighborhood, orbitRadius } from "./camera";
import type { Viewport } from "./camera";
import { project3D, sceneBounds } from "./projection";
import type { Point3D } from "./projection";
import { groupInfo, groups } from "./types";
import { adjacency, edgeKey, pathEdges } from "./graph";
import { findRegions, shortName, wrapName } from "./regions";
import type { Region } from "./regions";
import { LivePhysicsClient } from "./live-physics-client";

export interface NetworkHandle {
  retryLayout: () => void;
  fit: () => void;
  zoom: (factor: number) => void;
  focus: (id: number) => void;
  /** Re-frame the camera on `frameIds`. */
  frameGroup: () => void;
}
interface Props {
  data: GraphData;
  layoutData: GraphData;
  layoutCounts: Record<string, number>;
  edges: Edge[];
  counts: Record<string, number>;
  ensembles: Ensemble[];
  showEnsembles: boolean;
  selected: number | null;
  hovered: number | null;
  path: number[];
  labels: boolean;
  instrument: string;
  /** Members drawn with a halo and rings: a previewed or selected group. */
  highlightedIds: number[];
  /** Name of the highlighted group, shown when it lies off screen. */
  highlightLabel: string | null;
  /** Members the camera frames whenever this list changes. */
  frameIds: number[];
  mode: ViewMode;
  spacing: number;
  resolution: number;
  livePhysics: boolean;
  onLayoutStatus: (status: LayoutStatus) => void;
  onSelect: (id: number | null) => void;
  onHover: (id: number | null) => void;
  onSelectEnsemble: (id: string) => void;
  onHoverEnsemble: (id: string | null) => void;
}

// Ties by shared concerts: one, two or three, four to nine, ten or more.
const EDGE_TIERS = 4;
function edgeTier(weight: number) {
  return weight >= 10 ? 3 : weight >= 4 ? 2 : weight >= 2 ? 1 : 0;
}
// Zoomed out, single gigs fade into the background and frequent partnerships
// carry the structure. Zoomed in, every tie reads at similar strength.
const EDGE_STYLE = [
  { far: [0.06, 0.45], near: [0.3, 0.7], rgb: "178, 180, 170" },
  { far: [0.1, 0.55], near: [0.34, 0.8], rgb: "160, 166, 154" },
  { far: [0.18, 0.7], near: [0.4, 1], rgb: "132, 146, 130" },
  { far: [0.3, 0.9], near: [0.5, 1.2], rgb: "96, 124, 106" },
];
// Screen radius below which a named shape is too small to label.
const REGION_MIN_RADIUS = 18;
// Screen length in pixels beyond which a tie is drawn at reduced opacity.
const LONG_EDGE = 180;
const LONG_EDGE_ALPHA = 0.25;
// Ties crossing most of the screen say little about the groups they cross.
const SPANNING_EDGE = 600;
const SPANNING_EDGE_ALPHA = 0.1;
const edgeStyles = new Map<number, { color: string; width: number }>();
function edgeStyle(tier: number, zoom: number) {
  // Quantized so a zoom gesture reuses a handful of style strings.
  const step = Math.round(
    Math.max(0, Math.min(1, Math.log(zoom / 0.12) / Math.log(1 / 0.12))) * 20,
  );
  const key = tier * 32 + step;
  let style = edgeStyles.get(key);
  if (!style) {
    const t = step / 20,
      { far, near, rgb } = EDGE_STYLE[tier];
    style = {
      color: `rgba(${rgb}, ${(far[0] + (near[0] - far[0]) * t).toFixed(3)})`,
      width: far[1] + (near[1] - far[1]) * t,
    };
    edgeStyles.set(key, style);
  }
  return style;
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
  // These indexes depend on graph/selection changes, not camera or physics frames.
  const visible = useMemo(
    () => new Set(props.data.nodes.map((n) => n.id)),
    [props.data],
  );
  const byId = useMemo(
    () => new Map(props.data.nodes.map((n) => [n.id, n])),
    [props.data],
  );
  const visibleEdges = useMemo(
    () => new Set(props.edges.map((e) => edgeKey(e.source, e.target))),
    [props.edges],
  );
  const emphasis = useMemo(() => {
    const connected = new Set(
      props.selected === null
        ? []
        : [
            props.selected,
            ...(neighbors.get(props.selected) ?? []).map((n) => n.id),
          ],
    );
    const routeNodes = new Set(props.path);
    const routeEdges = pathEdges(props.path);
    const groupMembers = new Set(props.highlightedIds);
    const highlighted = new Set(
      props.data.nodes
        .filter(
          (node) =>
            groupMembers.has(node.id) || node.group === props.instrument,
        )
        .map((node) => node.id),
    );
    return {
      connected,
      routeNodes,
      routeEdges,
      groupMembers,
      highlighted,
      emphasized: new Set([...connected, ...routeNodes]),
    };
  }, [
    props.selected,
    neighbors,
    props.path,
    props.highlightedIds,
    props.data,
    props.instrument,
  ]);
  const drawOrder = useMemo(() => {
    const { emphasized, highlighted, routeNodes } = emphasis;
    const nodes = props.layoutData.nodes;
    const priority = (id: number) =>
      id === props.selected
        ? 3
        : routeNodes.has(id)
          ? 2
          : (connectionStrengths.get(id) ?? 0);
    return [
      ...nodes.filter((n) => !emphasized.has(n.id) && !highlighted.has(n.id)),
      ...nodes.filter((n) => highlighted.has(n.id) && !emphasized.has(n.id)),
      ...nodes
        .filter((n) => emphasized.has(n.id))
        .sort((a, b) => priority(a.id) - priority(b.id)),
    ];
  }, [props.layoutData, props.selected, emphasis, connectionStrengths]);
  const derived = {
    ...props,
    neighbors,
    connectionStrengths,
    edgesByKey,
    visible,
    byId,
    visibleEdges,
    ...emphasis,
    drawOrder,
  };
  const state = useRef(derived);
  state.current = derived;
  const api = useRef<NetworkHandle>({
    fit() {},
    zoom() {},
    focus() {},
    frameGroup() {},
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
      frameGroup: () => api.current.frameGroup(),
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
      props.highlightedIds,
      props.highlightLabel,
      props.frameIds,
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
        previousPositions.current.get(n.id) ?? {
          x: n.x,
          y: n.y,
          z: props.mode === "3d" ? Math.sin(n.id * 1.618) * 120 : 0,
        },
      ]),
    );
    const spatial = props.mode === "3d";
    let physics: LivePhysicsClient | null = null;
    let physicsData = props.data;
    let positionedData: Props["data"] | null = null;
    const births = new Map<number, number>();
    let physicsRunning = false;
    let autoFrame = props.livePhysics;
    let scene = sceneBounds(positions.values());
    let pivot: Point3D = { ...scene.center };
    let projectionRadius = scene.radius;
    let yawVelocity = 0,
      pitchVelocity = 0,
      orbitTime = 0;
    let yaw = 0.35,
      pitch = -0.2;
    const projected = new Map<number, ReturnType<typeof project3D>>();
    // Typed mirrors of the projection for the per-frame edge and marker passes.
    const nodeIndex = new Map(nodes.map((n, i) => [n.id, i]));
    const projX = new Float64Array(nodes.length),
      projY = new Float64Array(nodes.length);
    const palette = groups.map((g) => g.color);
    const byColor = palette.map((color) =>
      Int32Array.from(
        nodes.flatMap((n, i) =>
          groupInfo(n.group).color === color ? [i] : [],
        ),
      ),
    );
    const plain = new Uint8Array(nodes.length);
    function updateProjection() {
      const nextRadius = orbitRadius(scene, pivot);
      projectionRadius = props.livePhysics
        ? Math.max(projectionRadius, nextRadius)
        : nextRadius;
      projected.clear();
      for (const [id, p] of positions) {
        const q = spatial
          ? project3D(p, pivot, projectionRadius, yaw, pitch)
          : { x: p.x, y: p.y, depth: 0, scale: 1 };
        projected.set(id, q);
        const i = nodeIndex.get(id);
        if (i === undefined) continue;
        projX[i] = q.x;
        projY[i] = q.y;
      }
    }
    updateProjection();
    const opacity = new Map(props.data.nodes.map((n) => [n.id, 1]));
    let edgeCache: {
      edges: Edge[];
      a: Int32Array;
      b: Int32Array;
      offsets: Int32Array;
    } | null = null;
    // Endpoint indexes grouped by weight tier, rebuilt when the tie set changes.
    function edgeArrays(edges: Edge[]) {
      if (edgeCache?.edges === edges) return edgeCache;
      const offsets = new Int32Array(EDGE_TIERS + 1);
      for (const e of edges) offsets[edgeTier(e.weight) + 1]++;
      for (let t = 0; t < EDGE_TIERS; t++) offsets[t + 1] += offsets[t];
      const fill = offsets.slice(0, EDGE_TIERS);
      const a = new Int32Array(edges.length),
        b = new Int32Array(edges.length);
      for (const e of edges) {
        const k = fill[edgeTier(e.weight)]++;
        a[k] = nodeIndex.get(e.source) ?? -1;
        b[k] = nodeIndex.get(e.target) ?? -1;
      }
      edgeCache = { edges, a, b, offsets };
      return edgeCache;
    }
    function setEdgeStyle(tier: number, zoom: number) {
      const style = edgeStyle(tier, zoom);
      ctx.strokeStyle = style.color;
      ctx.lineWidth = style.width;
    }
    const animatedEdges = new Map(
      props.edges.map((edge) => [
        edgeKey(edge.source, edge.target),
        { edge, alpha: 1 },
      ]),
    );
    let fadeNodes: Set<number> | null = null,
      fadeEdges: Set<string> | null = null,
      fading = true;
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
    type View = { zoom: number; x: number; y: number; pivot: Point3D };
    let camera: {
      from: View;
      to: View;
      start: number;
      duration: number;
    } | null = null;
    let hoverId: number | null = null;
    // Named map regions from the last frame; their names open the group.
    let regionHits: {
      id: string;
      x: number;
      y: number;
      w: number;
      h: number;
      members: number[];
    }[] = [];
    let hoverRegion: string | null = null;
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
    function moveView(
      target: Omit<View, "pivot"> & { pivot?: Point3D },
      animate: boolean,
      duration = spatial ? 380 : 160,
    ) {
      const to = { ...target, pivot: target.pivot ?? { ...pivot } };
      yawVelocity = pitchVelocity = 0;
      // Large graphs avoid repeated canvas work. Wheel and touch stay direct.
      if (
        animate &&
        !reducedMotion.matches &&
        (props.livePhysics || spatial || nodes.length <= 2000)
      ) {
        camera = {
          from: { zoom, x: panX, y: panY, pivot: { ...pivot } },
          to,
          start: performance.now(),
          duration,
        };
      } else {
        camera = null;
        zoom = to.zoom;
        panX = to.x;
        panY = to.y;
        pivot = to.pivot;
        updateProjection();
      }
      invalidateFrame();
    }
    function fit(animate = false, targetPivot?: Point3D) {
      if (!width || !height) return;
      if (!nodes.length) {
        invalidateFrame();
        return;
      }
      let minX = Infinity,
        minY = Infinity,
        maxX = -Infinity,
        maxY = -Infinity;
      const roster = new Set(state.current.frameIds);
      const activeIds = props.livePhysics
        ? new Set(state.current.data.nodes.map((node) => node.id))
        : null;
      const rosterPoints = [...positions.entries()].filter(
        ([id]) =>
          (!roster.size || roster.has(id)) && (!activeIds || activeIds.has(id)),
      );
      if (!rosterPoints.length) return;
      if (roster.size > 2) {
        // Drop strays far from the roster's center so the core fills the view.
        const mid = (values: number[]) =>
          [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)];
        const cx = mid(rosterPoints.map(([, p]) => p.x)),
          cy = mid(rosterPoints.map(([, p]) => p.y));
        const reach =
          mid(rosterPoints.map(([, p]) => Math.hypot(p.x - cx, p.y - cy))) * 3;
        if (reach > 0) {
          const core = rosterPoints.filter(
            ([, p]) => Math.hypot(p.x - cx, p.y - cy) <= reach,
          );
          if (core.length >= 2) rosterPoints.splice(0, Infinity, ...core);
        }
      }
      const points =
        spatial && targetPivot
          ? rosterPoints.map(([, p]) =>
              project3D(
                p,
                targetPivot,
                orbitRadius(scene, targetPivot),
                yaw,
                pitch,
              ),
            )
          : rosterPoints.map(([id]) => projected.get(id)!).filter(Boolean);
      let pointCount = 0;
      for (const p of points) {
        pointCount++;
        minX = Math.min(minX, p.x);
        maxX = Math.max(maxX, p.x);
        minY = Math.min(minY, p.y);
        maxY = Math.max(maxY, p.y);
      }
      if (!pointCount) return;
      const viewport =
        roster.size || props.livePhysics ? focusViewport() : null;
      const availableWidth = viewport
        ? Math.max(48, viewport.right - viewport.left - 40)
        : width - (width > 700 ? 120 : 42);
      // The overview uses the full canvas. Controls float above it.
      const topInset = viewport ? viewport.top + 20 : 32;
      const bottomInset = viewport ? height - viewport.bottom + 20 : 32;
      const availableHeight = Math.max(48, height - topInset - bottomInset);
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
          pivot: targetPivot,
          x:
            (viewport ? (viewport.left + viewport.right) / 2 : width / 2) -
            ((minX + maxX) / 2) * nextZoom,
          y:
            (topInset + height - bottomInset) / 2 -
            ((minY + maxY) / 2) * nextZoom,
        },
        animate,
      );
    }
    let viewportCache: Viewport | null = null;
    function invalidateViewport() {
      viewportCache = null;
      invalidateFrame();
    }
    function focusViewport(): Viewport {
      if (viewportCache) return viewportCache;
      const viewport = {
        left: 28,
        top:
          (parseFloat(
            getComputedStyle(canvas).getPropertyValue("--header-height"),
          ) || 132) + 16,
        right: width - 28,
        bottom: height - 30,
      };
      const canvasBounds = canvas.getBoundingClientRect();
      const timeline =
        canvas.parentElement?.querySelector<HTMLElement>(".timeline");
      if (timeline)
        viewport.bottom = Math.min(
          viewport.bottom,
          timeline.getBoundingClientRect().top - canvasBounds.top - 16,
        );
      for (const selector of [
        ".layout-controls",
        ".filter-panel",
        ".selection-panel",
        ".instrument-legend",
      ]) {
        const element =
          canvas.parentElement?.querySelector<HTMLElement>(selector);
        if (!element || !element.getClientRects().length) continue;
        const box = element.getBoundingClientRect();
        if (selector === ".instrument-legend") {
          viewport.bottom = Math.min(
            viewport.bottom,
            box.top - canvasBounds.top - 12,
          );
        } else if (width > 700) {
          if (box.left < width / 2)
            viewport.left = Math.max(
              viewport.left,
              box.right - canvasBounds.left + 24,
            );
          else
            viewport.right = Math.min(
              viewport.right,
              box.left - canvasBounds.left - 24,
            );
        } else if (selector === ".selection-panel") {
          viewport.bottom = Math.min(
            viewport.bottom,
            box.top - canvasBounds.top - 12,
          );
        }
      }
      viewportCache = viewport;
      return viewport;
    }
    function focusNeighborhood(id: number, animate = true) {
      const target = positions.get(id);
      if (!target || !width || !height) return;
      const ids = [
        id,
        ...(state.current.neighbors.get(id) ?? []).map((n) => n.id),
      ];
      const points = ids
        .map((id) => positions.get(id))
        .filter((p): p is Point3D => !!p);
      moveView(
        frameNeighborhood(
          points,
          target,
          orbitRadius(scene, target),
          yaw,
          pitch,
          focusViewport(),
        ),
        animate,
      );
    }
    function revealMusician(id: number, animate = true) {
      if (!positions.has(id) || !width || !height) return;
      const viewport = focusViewport();
      const screen = point(id);
      if (
        screen.x >= viewport.left + 16 &&
        screen.x <= viewport.right - 16 &&
        screen.y >= viewport.top + 16 &&
        screen.y <= viewport.bottom - 16
      )
        return;
      moveView(
        {
          zoom,
          x: panX + (viewport.left + viewport.right) / 2 - screen.x,
          y: panY + (viewport.top + viewport.bottom) / 2 - screen.y,
        },
        animate,
      );
    }
    function stopMovement() {
      autoFrame = false;
      // Finish moving the orbit center without moving the selected point on screen
      // when a new gesture interrupts a focus transition.
      if (spatial && camera && state.current.selected !== null) {
        const id = state.current.selected;
        const target = positions.get(id);
        if (target) {
          const screen = point(id);
          pivot = target;
          updateProjection();
          panX = screen.x;
          panY = screen.y;
        }
      }
      camera = null;
      yawVelocity = pitchVelocity = 0;
    }
    function clearHover() {
      hoverId = null;
      state.current.onHover(null);
      if (hoverRegion !== null) {
        hoverRegion = null;
        state.current.onHoverEnsemble(null);
      }
      canvas.style.cursor = "grab";
      invalidateFrame();
    }
    function zoomAt(factor: number, x = width / 2, y = height / 2) {
      stopMovement();
      const next = Math.max(0.025, Math.min(12, zoom * factor));
      panX = x - ((x - panX) * next) / zoom;
      panY = y - ((y - panY) * next) / zoom;
      zoom = next;
      clearHover();
    }
    api.current = {
      retryLayout: () => startLayout(),
      fit: () => {
        autoFrame = props.livePhysics;
        clearHover();
        yaw = 0.35;
        pitch = -0.2;
        if (spatial && state.current.selected !== null) {
          focusNeighborhood(state.current.selected);
        } else {
          updateProjection();
          fit(true, scene.center);
        }
      },
      zoom: (factor) => {
        autoFrame = false;
        const base = camera?.to ?? { zoom, x: panX, y: panY, pivot };
        const next = Math.max(0.025, Math.min(12, base.zoom * factor));
        const x =
          spatial && state.current.selected !== null ? base.x : width / 2;
        const y =
          spatial && state.current.selected !== null ? base.y : height / 2;
        moveView(
          {
            zoom: next,
            x: x - ((x - base.x) * next) / base.zoom,
            y: y - ((y - base.y) * next) / base.zoom,
            pivot: base.pivot,
          },
          true,
        );
        clearHover();
      },
      frameGroup() {
        if (!state.current.frameIds.length) return;
        stopMovement();
        clearHover();
        updateProjection();
        fit(true, scene.center);
      },
      focus(id) {
        if (spatial) {
          focusNeighborhood(id);
          clearHover();
          return;
        }
        revealMusician(id);
        clearHover();
      },
    };
    invalidate.current = invalidateViewport;
    const observer = new ResizeObserver(() => {
      viewportCache = null;
      const bounds = canvas.getBoundingClientRect();
      width = bounds.width;
      height = bounds.height;
      ratio = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.round(width * ratio);
      canvas.height = Math.round(height * ratio);
      if (spatial && state.current.selected !== null)
        focusNeighborhood(state.current.selected, false);
      else {
        fit();
        if (state.current.selected !== null)
          revealMusician(state.current.selected, false);
      }
    });
    observer.observe(canvas);
    const panels = new ResizeObserver(invalidateViewport);
    const panelRoot = canvas.parentElement!;
    const panelSelector =
      ".selection-panel, .instrument-legend, .timeline, .filter-panel, .layout-controls";
    function observePanels() {
      panels.disconnect();
      for (const panel of panelRoot.querySelectorAll(panelSelector))
        panels.observe(panel);
      invalidateViewport();
    }
    // CSS translation changes a panel's bounds without resizing its box.
    function finishPanelAnimation(event: Event) {
      if (
        event.target instanceof Element &&
        event.target.matches(panelSelector)
      )
        invalidateViewport();
    }
    panelRoot.addEventListener("animationend", finishPanelAnimation);
    panelRoot.addEventListener("animationcancel", finishPanelAnimation);
    const panelChanges = new MutationObserver(observePanels);
    panelChanges.observe(panelRoot, { childList: true });
    observePanels();
    // Named shapes on the map, found from settled positions. Recomputed after
    // the layout, the visible graph or the ensemble list changes.
    let regions: (Region & { label: string; index: Int32Array })[] = [];
    let regionSource: {
      data: GraphData;
      ensembles: Ensemble[];
      stamp: number;
    } | null = null;
    let regionStamp = 0,
      regionStampAt = 0,
      regionTimer = 0,
      regionCost = 0;
    function refreshRegions() {
      const s = state.current;
      if (
        regionTimer ||
        (regionSource?.data === s.data &&
          regionSource.ensembles === s.ensembles &&
          regionSource.stamp === regionStamp)
      )
        return;
      // Scrubbing the timeline or live playback keeps the previous names for
      // a moment, so detection stays a small share of the frame budget.
      regionTimer = window.setTimeout(
        () => {
          regionTimer = 0;
          if (disposed) return;
          const s = state.current;
          const started = performance.now();
          const points = [];
          for (const n of s.data.nodes) {
            const p = positions.get(n.id);
            if (p) points.push({ id: n.id, x: p.x, y: p.y, z: p.z ?? 0 });
          }
          regionSource = {
            data: s.data,
            ensembles: s.ensembles,
            stamp: regionStamp,
          };
          regions = findRegions(points, s.ensembles, s.data.edges).map(
            (region) => ({
              ...region,
              label: shortName(region.name),
              index: Int32Array.from(
                region.members.flatMap((id) => {
                  const i = nodeIndex.get(id);
                  return i === undefined ? [] : [i];
                }),
              ),
            }),
          );
          regionCost = performance.now() - started;
          invalidateFrame();
        },
        regions.length ? Math.max(300, regionCost * 20) : 0,
      );
    }
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
      if (props.livePhysics) {
        setStatus("ready");
        physics?.dispose();
        startPhysics();
        invalidateFrame();
        return;
      }
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
      const request: LayoutRequest = {
        nodes: nodes.map((n) => ({
          id: n.id,
          count: props.layoutCounts[n.id] || 0,
        })),
        edges: props.layoutData.edges,
        mode: props.mode,
        spacing: props.spacing,
        resolution: props.resolution,
      };
      const key = layoutKey(request);
      const apply = (result: Position[]) => {
        for (const node of result)
          positions.set(node.id, { x: node.x, y: node.y, z: node.z });
        previousPositions.current = new Map(positions);
        regionStamp++;
        scene = sceneBounds(positions.values());
        pivot = { ...scene.center };
        updateProjection();
        settled = true;
        worker?.terminate();
        worker = null;
        setStatus("ready");
        fit();
        if (state.current.selected !== null)
          api.current.focus(state.current.selected);
      };
      const cached = cachedLayout(key);
      if (cached) {
        apply(cached);
        return;
      }
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
          cacheLayout(key, event.data.positions);
          apply(event.data.positions);
        };
        worker.onerror = (event) => {
          event.preventDefault();
          fallback();
        };
        worker.onmessageerror = fallback;
        worker.postMessage(request);
      } catch {
        fallback();
      }
    }
    startLayout();
    void document.fonts.ready.then(invalidateViewport);

    function focusPriority(id: number) {
      const s = state.current;
      return id === s.selected
        ? 2
        : s.connectionStrengths.has(id) || s.path.includes(id)
          ? 1
          : 0;
    }
    function hit(x: number, y: number) {
      let id: number | null = null,
        nearest = Infinity,
        front = -Infinity,
        insideMarker = false,
        priority = -1;
      for (const n of state.current.data.nodes) {
        const p = point(n.id),
          distance = Math.hypot(p.x - x, p.y - y);
        const depth = projected.get(n.id)!.depth;
        const radius = markerRadius(n.id);
        const inside = distance <= radius;
        // A nearby node's enlarged touch target must not steal a direct marker hit.
        if (
          distance <= Math.max(7, radius + 3) &&
          (spatial
            ? (inside && !insideMarker) ||
              (inside === insideMarker &&
                (focusPriority(n.id) > priority ||
                  (focusPriority(n.id) === priority && depth > front)))
            : distance < nearest)
        ) {
          insideMarker = inside;
          front = depth;
          priority = focusPriority(n.id);
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
    function regionAt(x: number, y: number) {
      return (
        regionHits.find(
          (r) => x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h,
        )?.id ?? null
      );
    }
    function updateHover(x: number, y: number) {
      const id = hit(x, y);
      if (id !== hoverId) {
        hoverId = id;
        state.current.onHover(id);
        invalidateFrame();
      }
      const region = id === null ? regionAt(x, y) : null;
      if (region !== hoverRegion) {
        hoverRegion = region;
        state.current.onHoverEnsemble(region);
        invalidateFrame();
      }
      canvas.style.cursor = id === null && region === null ? "grab" : "pointer";
    }
    function down(event: PointerEvent) {
      if (event.button !== 0) return;
      stopMovement();
      canvas.focus({ preventScroll: true });
      const p = local(event);
      pointers.set(event.pointerId, p);
      canvas.setPointerCapture(event.pointerId);
      if (pointers.size === 1) {
        startX = p.x;
        startY = p.y;
        moved = false;
        pinched = false;
        orbitTime = event.timeStamp;
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
        yawVelocity = pitchVelocity = 0;
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
          const elapsed = Math.max(
            8,
            Math.min(40, event.timeStamp - orbitTime),
          );
          yawVelocity = ((p.x - old.x) * 0.0045) / elapsed;
          pitchVelocity = ((p.y - old.y) * 0.0045) / elapsed;
          orbitTime = event.timeStamp;
          yaw += (p.x - old.x) * 0.0045;
          pitch = Math.max(
            -Math.PI / 2,
            Math.min(Math.PI / 2, pitch + (p.y - old.y) * 0.0045),
          );
          updateProjection();
        } else {
          yawVelocity = pitchVelocity = 0;
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
      if (!moved && !pinched && pointers.size === 1) {
        const id = hit(p.x, p.y);
        const region = id === null ? regionAt(p.x, p.y) : null;
        if (spatial && id !== null && id === state.current.selected)
          focusNeighborhood(id);
        if (region !== null) state.current.onSelectEnsemble(region);
        else state.current.onSelect(id);
      }
      if (event.timeStamp - orbitTime > 80) yawVelocity = pitchVelocity = 0;
      pointers.delete(event.pointerId);
      if (canvas.hasPointerCapture(event.pointerId))
        canvas.releasePointerCapture(event.pointerId);
      if (event.pointerType !== "touch" && !moved) updateHover(p.x, p.y);
      else clearHover();
    }
    function cancel(event: PointerEvent) {
      pointers.delete(event.pointerId);
      stopMovement();
      moved = true;
      clearHover();
    }
    function wheel(event: WheelEvent) {
      event.preventDefault();
      autoFrame = false;
      const p = local(event);
      const delta =
        event.deltaY *
        (event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? height : 1);
      if (!spatial) {
        zoomAt(Math.exp(-delta * 0.0015), p.x, p.y);
        return;
      }
      const base = camera?.to ?? { zoom, x: panX, y: panY, pivot };
      const next = Math.max(
        0.025,
        Math.min(12, base.zoom * Math.exp(-delta * 0.0015)),
      );
      const x = state.current.selected !== null ? base.x : p.x;
      const y = state.current.selected !== null ? base.y : p.y;
      moveView(
        {
          zoom: next,
          x: x - ((x - base.x) * next) / base.zoom,
          y: y - ((y - base.y) * next) / base.zoom,
          pivot: base.pivot,
        },
        true,
      );
      clearHover();
    }
    function keydown(event: KeyboardEvent) {
      if (
        !spatial ||
        !["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(event.key)
      )
        return;
      event.preventDefault();
      stopMovement();
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

    let selection = props.selected;
    let viewportKey = "";
    let rosterKey = "";
    function startPhysics() {
      try {
        physics = new LivePhysicsClient(
          new Map(positions),
          spatial,
          props.spacing,
          (added) => {
            if (disposed) return;
            positionedData = physicsData;
            if (!motion.matches && !document.hidden)
              for (const id of added) births.set(id, performance.now());
            scene = sceneBounds(positions.values());
            updateProjection();
            invalidateFrame();
          },
          physicsFailure,
        );
        physicsData = state.current.data;
        physics.sync(physicsData.nodes, physicsData.edges, positions, false);
      } catch {
        physicsFailure();
      }
    }
    function physicsFailure() {
      physics?.dispose();
      physics = null;
      if (disposed) return;
      canvas.dataset.layout = "fallback";
      canvas.setAttribute("aria-busy", "false");
      state.current.onLayoutStatus("fallback");
      invalidateFrame();
    }
    function draw(now: number) {
      frame = 0;
      const s = state.current;
      const running = !!physics && !document.hidden;
      if (!running && physicsRunning) {
        physics?.pause();
        camera = null;
        births.clear();
      }
      if (physics && physicsData !== s.data) {
        physics.sync(s.data.nodes, s.data.edges, positions);
        physicsData = s.data;
      }
      if (physics && running) {
        physics.advance(physicsRunning ? now - lastFrame : 1000 / 60);
        if (
          autoFrame &&
          positionedData === s.data &&
          !pointers.size &&
          s.selected === null &&
          !camera
        ) {
          const expanded = expandPlaybackView(
            { zoom, x: panX, y: panY },
            s.data.nodes.map((n) => projected.get(n.id)!),
            focusViewport(),
          );
          if (expanded) moveView(expanded, !motion.matches, 1400);
        }
        invalidateFrame();
      }
      physicsRunning = running;
      if (running && now - regionStampAt > 2500) {
        regionStamp++;
        regionStampAt = now;
      }
      canvas.dataset.physics = physics
        ? running
          ? "running"
          : "paused"
        : "off";
      canvas.dataset.physicsTicks = String(physics?.ticks ?? 0);
      canvas.dataset.physicsSample = JSON.stringify(
        s.data.nodes
          .slice(0, 8)
          .map((n) => ({ id: n.id, ...positions.get(n.id) })),
      );
      const nextViewportKey = JSON.stringify(focusViewport());
      const nextRosterKey = state.current.frameIds.join(",");
      if (
        selection !== state.current.selected ||
        viewportKey !== nextViewportKey ||
        rosterKey !== nextRosterKey
      ) {
        const selectionChanged = selection !== state.current.selected;
        viewportKey = nextViewportKey;
        rosterKey = nextRosterKey;
        selection = state.current.selected;
        if (selection !== null) {
          if (spatial) focusNeighborhood(selection);
          else revealMusician(selection);
        } else if (rosterKey) {
          stopMovement();
          fit(true, scene.center);
        } else if (spatial && selectionChanged) {
          stopMovement();
          fit(true, scene.center);
        }
      }
      const elapsed = Math.min(40, now - (lastFrame || now - 16));
      if (
        spatial &&
        !pointers.size &&
        !camera &&
        !motion.matches &&
        Math.hypot(yawVelocity, pitchVelocity) > 0.00002
      ) {
        yaw += yawVelocity * elapsed;
        pitch = Math.max(
          -Math.PI / 2,
          Math.min(Math.PI / 2, pitch + pitchVelocity * elapsed),
        );
        const damping = Math.exp(-elapsed / 100);
        yawVelocity *= damping;
        pitchVelocity *= damping;
        updateProjection();
        invalidateFrame();
      }
      if (camera) {
        const progress = reducedMotion.matches
          ? 1
          : Math.max(0, Math.min(1, (now - camera.start) / camera.duration));
        const eased = 1 - (1 - progress) ** 3;
        zoom = camera.from.zoom + (camera.to.zoom - camera.from.zoom) * eased;
        panX = camera.from.x + (camera.to.x - camera.from.x) * eased;
        panY = camera.from.y + (camera.to.y - camera.from.y) * eased;
        if (spatial) {
          pivot = {
            x:
              camera.from.pivot.x +
              (camera.to.pivot.x - camera.from.pivot.x) * eased,
            y:
              camera.from.pivot.y +
              (camera.to.pivot.y - camera.from.pivot.y) * eased,
            z:
              (camera.from.pivot.z ?? 0) +
              ((camera.to.pivot.z ?? 0) - (camera.from.pivot.z ?? 0)) * eased,
          };
          updateProjection();
        }
        if (progress === 1) {
          zoom = camera.to.zoom;
          panX = camera.to.x;
          panY = camera.to.y;
          pivot = camera.to.pivot;
          updateProjection();
          camera = null;
        } else invalidateFrame();
      }
      canvas.dataset.animating = String(camera !== null);
      canvas.dataset.zoom = String(zoom);
      const {
        neighbors,
        edgesByKey,
        visible,
        visibleEdges,
        byId,
        connected,
        routeNodes,
        routeEdges,
        groupMembers,
        highlighted,
        emphasized,
      } = s;
      const delta = motion.matches
        ? 1
        : Math.min(32, now - (lastFrame || now - 16)) / 300;
      lastFrame = now;
      // Fades only run after the visible graph changes; a settled graph skips
      // per-edge bookkeeping, which dominated frame time with every tie shown.
      if (fadeNodes !== visible || fadeEdges !== visibleEdges) {
        fadeNodes = visible;
        fadeEdges = visibleEdges;
        fading = true;
        for (const edge of s.edges) {
          const key = edgeKey(edge.source, edge.target);
          if (!animatedEdges.has(key))
            animatedEdges.set(key, { edge, alpha: 0 });
        }
      }
      let animating = false;
      if (fading) {
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
        for (const [key, item] of animatedEdges) {
          const target = visibleEdges.has(key) ? 1 : 0;
          item.alpha =
            target > item.alpha
              ? Math.min(target, item.alpha + delta)
              : Math.max(target, item.alpha - delta);
          if (item.alpha !== target) animating = true;
          if (!item.alpha && !target) animatedEdges.delete(key);
        }
        fading = animating;
      }
      ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
      ctx.clearRect(0, 0, width, height);
      const focus = s.selected;
      // Inlined projection: no per-edge allocations on large graphs.
      function line(e: Edge) {
        const a = projected.get(e.source),
          b = projected.get(e.target);
        if (!a || !b) return;
        const ax = a.x * zoom + panX,
          ay = a.y * zoom + panY,
          bx = b.x * zoom + panX,
          by = b.y * zoom + panY;
        if (
          (ax < 0 && bx < 0) ||
          (ay < 0 && by < 0) ||
          (ax > width && bx > width) ||
          (ay > height && by > height)
        )
          return;
        ctx.moveTo(ax, ay);
        ctx.lineTo(bx, by);
      }
      function lines(edges: Edge[], color: string, lineWidth: number) {
        ctx.beginPath();
        ctx.strokeStyle = color;
        ctx.lineWidth = lineWidth;
        for (const e of edges) line(e);
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
      if (!fading) {
        // Settled graph: index-based segments, one stroke per weight tier.
        // Screen-spanning ties are dimmed so they do not veil the groups.
        const { a, b, offsets } = edgeArrays(s.edges);
        const long = LONG_EDGE * LONG_EDGE,
          spanning = SPANNING_EDGE * SPANNING_EDGE;
        for (let tier = 0; tier < EDGE_TIERS; tier++) {
          const from = offsets[tier],
            to = offsets[tier + 1];
          if (from === to) continue;
          setEdgeStyle(tier, zoom);
          const far = new Path2D(),
            across = new Path2D();
          ctx.beginPath();
          for (let k = from; k < to; k++) {
            const i = a[k],
              j = b[k];
            if (i < 0 || j < 0) continue;
            const ax = projX[i] * zoom + panX,
              ay = projY[i] * zoom + panY,
              bx = projX[j] * zoom + panX,
              by = projY[j] * zoom + panY;
            if (
              (ax < 0 && bx < 0) ||
              (ay < 0 && by < 0) ||
              (ax > width && bx > width) ||
              (ay > height && by > height)
            )
              continue;
            // Sub-pixel ties are hidden under their markers anyway.
            const dx = bx - ax,
              dy = by - ay;
            const length = dx * dx + dy * dy;
            if (length < 1) continue;
            if (length > long) {
              const path = length > spanning ? across : far;
              path.moveTo(ax, ay);
              path.lineTo(bx, by);
              continue;
            }
            ctx.moveTo(ax, ay);
            ctx.lineTo(bx, by);
          }
          ctx.stroke();
          ctx.globalAlpha = LONG_EDGE_ALPHA;
          ctx.stroke(far);
          ctx.globalAlpha = SPANNING_EDGE_ALPHA;
          ctx.stroke(across);
          ctx.globalAlpha = 1;
        }
      } else {
        // Fading ties batch by tier and a quantized opacity.
        const batches = new Map<number, Edge[]>();
        for (const { edge, alpha } of animatedEdges.values()) {
          if (alpha === 0) continue;
          const key =
            edgeTier(edge.weight) * 16 + Math.max(1, Math.round(alpha * 8));
          const batch = batches.get(key);
          if (batch) batch.push(edge);
          else batches.set(key, [edge]);
        }
        for (const key of [...batches.keys()].sort((x, y) => x - y)) {
          setEdgeStyle(key >> 4, zoom);
          ctx.globalAlpha = (key & 15) / 8;
          ctx.beginPath();
          for (const edge of batches.get(key)!) line(edge);
          ctx.stroke();
        }
      }
      ctx.globalAlpha = 1;
      // A short pulse follows newly formed ties, attached to the moving bodies.
      if (running && !motion.matches) {
        ctx.strokeStyle = "#4e927b";
        ctx.lineWidth = 1.2;
        let pulses = 0;
        for (const { edge, alpha } of animatedEdges.values()) {
          if (alpha >= 1 || alpha <= 0 || pulses++ >= 100) continue;
          const a = point(edge.source),
            b = point(edge.target);
          ctx.globalAlpha = Math.sin(alpha * Math.PI) * 0.7;
          ctx.beginPath();
          ctx.moveTo(a.x, a.y);
          ctx.lineTo(a.x + (b.x - a.x) * alpha, a.y + (b.y - a.y) * alpha);
          ctx.stroke();
        }
        ctx.globalAlpha = 1;
      }
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
      const drawOrder = spatial
        ? [...s.drawOrder].sort(
            (a, b) =>
              focusPriority(a.id) - focusPriority(b.id) ||
              projected.get(a.id)!.depth - projected.get(b.id)!.depth,
          )
        : s.drawOrder;
      const regionBoxes: { x: number; y: number; w: number; h: number }[] = [];
      const namedRegions: {
        id: string;
        memberIds: number[];
        lines: string[];
        x: number;
        y: number;
        w: number;
        size: number;
        alpha: number;
        cx: number;
        cy: number;
        r: number;
        members: number;
      }[] = [];
      const visibleEnsembles: string[] = [];
      if (s.showEnsembles) {
        refreshRegions();
        const viewport = focusViewport();
        const side = Math.min(width, height);
        const candidates: {
          region: (typeof regions)[number];
          x: number;
          y: number;
          r: number;
        }[] = [];
        for (const region of regions) {
          let sx = 0,
            sy = 0,
            count = 0;
          for (const i of region.index) {
            if (!visible.has(nodes[i].id)) continue;
            sx += projX[i];
            sy += projY[i];
            count++;
          }
          if (count < 3) continue;
          const x = (sx / count) * zoom + panX,
            y = (sy / count) * zoom + panY;
          if (
            x < viewport.left ||
            x > viewport.right ||
            y < viewport.top ||
            y > viewport.bottom
          )
            continue;
          let r = 0;
          for (const i of region.index)
            if (visible.has(nodes[i].id))
              r = Math.max(
                r,
                Math.hypot(
                  projX[i] * zoom + panX - x,
                  projY[i] * zoom + panY - y,
                ),
              );
          if (r < REGION_MIN_RADIUS) continue;
          if (
            spatial &&
            focus !== null &&
            !region.members.some((id) => connected.has(id))
          )
            continue;
          candidates.push({ region, x, y, r });
        }
        // The largest shapes on screen are named first, like countries on a
        // map; smaller ensembles appear as zooming makes room for them.
        candidates.sort((a, b) => b.r - a.r);
        for (const { region, x, y, r } of candidates) {
          // 3D projections stack shapes on top of each other; fewer names read.
          if (visibleEnsembles.length >= (width > 700 && !spatial ? 14 : 6))
            break;
          // Fade in as the shape grows, out once it fills the screen.
          const fade =
            Math.min(1, (r - REGION_MIN_RADIUS) / 6) *
            Math.max(0, Math.min(1, (0.85 * side - r) / (0.35 * side)));
          if (fade < 0.05) continue;
          const size = Math.round(Math.max(11, Math.min(30, 8 + r * 0.075)));
          ctx.font = `600 ${size}px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif`;
          const lines = wrapName(
            region.label,
            Math.max(110, Math.min(width - 60, r * 2.2, size * 16)),
            (text) => ctx.measureText(text).width,
          );
          const lineHeight = size * 1.15;
          const w =
              Math.max(...lines.map((line) => ctx.measureText(line).width)) +
              size * 0.6,
            h = lines.length * lineHeight + size * 0.2;
          // Shapes with room carry their name in the middle; small ones above
          // or below, so the name never hides the few markers it describes.
          const spots = [
            ...(r >= 30 ? [{ x: x - w / 2, y: y - h / 2 }] : []),
            { x: x - w / 2, y: y - r - h - 4 },
            { x: x - w / 2, y: y + r + 4 },
          ];
          const spot = spots.find(
            (c) =>
              c.x >= viewport.left &&
              c.x + w <= viewport.right &&
              c.y >= viewport.top &&
              c.y + h <= viewport.bottom &&
              !regionBoxes.some(
                (b) =>
                  c.x < b.x + b.w &&
                  c.x + w > b.x &&
                  c.y < b.y + b.h &&
                  c.y + h > b.y,
              ),
          );
          if (!spot) continue;
          regionBoxes.push({
            x: spot.x - 4,
            y: spot.y - 4,
            w: w + 8,
            h: h + 8,
          });
          namedRegions.push({
            id: region.id,
            memberIds: region.members,
            lines,
            ...spot,
            w,
            size,
            alpha: fade * (focus === null ? 1 : 0.5),
            cx: x,
            cy: y,
            r,
            members: region.index.length,
          });
          visibleEnsembles.push(region.name);
        }
        // A faint wash under each named shape shows where it begins and ends.
        for (const { cx, cy, r, alpha, members } of namedRegions) {
          if (r < 30 || members < 8) continue;
          const wash = ctx.createRadialGradient(
            cx,
            cy,
            r * 0.3,
            cx,
            cy,
            r * 1.15,
          );
          wash.addColorStop(0, "rgba(40, 100, 77, 0.07)");
          wash.addColorStop(0.75, "rgba(40, 100, 77, 0.05)");
          wash.addColorStop(1, "rgba(40, 100, 77, 0)");
          ctx.globalAlpha = alpha;
          ctx.fillStyle = wash;
          ctx.beginPath();
          ctx.arc(cx, cy, r * 1.15, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.globalAlpha = 1;
      }
      regionHits = namedRegions.map(
        ({ id, memberIds, x, y, w, lines, size }) => ({
          id,
          members: memberIds,
          x,
          y,
          w,
          h: lines.length * size * 1.15 + size * 0.2,
        }),
      );
      // A previewed group glows under its markers, so its place on the map
      // reads at a glance. Off screen, a pointer at the edge leads to it.
      const haloIds = groupMembers.size
        ? groupMembers
        : hoverRegion !== null
          ? new Set(regionHits.find((r) => r.id === hoverRegion)?.members)
          : null;
      let haloRing: { x: number; y: number; r: number } | null = null;
      if (haloIds?.size) {
        const glow = Math.max(9, Math.min(26, 15 * Math.sqrt(zoom)));
        const xs: number[] = [],
          ys: number[] = [];
        ctx.beginPath();
        for (const id of haloIds) {
          const p = visible.has(id) ? projected.get(id) : undefined;
          if (!p) continue;
          const x = p.x * zoom + panX,
            y = p.y * zoom + panY;
          xs.push(x);
          ys.push(y);
          ctx.moveTo(x + glow, y);
          ctx.arc(x, y, glow, 0, Math.PI * 2);
        }
        ctx.fillStyle = "rgba(199, 141, 82, 0.22)";
        ctx.fill();
        if (xs.length) {
          // A ring around the core of the roster; strays keep their glow.
          const mid = (values: number[]) =>
            [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)];
          const x = mid(xs),
            y = mid(ys);
          const distances = xs
            .map((px, i) => Math.hypot(px - x, ys[i] - y))
            .sort((a, b) => a - b);
          const r =
            Math.max(
              distances[Math.floor((distances.length - 1) * 0.85)],
              glow,
            ) + 14;
          haloRing = { x, y, r };
          ctx.beginPath();
          ctx.arc(x, y, r, 0, Math.PI * 2);
          ctx.fillStyle = "rgba(199, 141, 82, 0.07)";
          ctx.fill();
          ctx.setLineDash([5, 4]);
          ctx.strokeStyle = "#c78d52";
          ctx.lineWidth = 1.5;
          ctx.stroke();
          ctx.setLineDash([]);
        }
      }
      // Unemphasized, fully faded-in markers share one fill per color.
      // Tiny ones become squares of equal area, which rasterize faster.
      plain.fill(0);
      if (!spatial)
        for (let color = 0; color < palette.length; color++) {
          ctx.beginPath();
          let any = false;
          const counts = s.counts,
            grow = Math.sqrt(zoom);
          for (const i of byColor[color]) {
            const id = nodes[i].id;
            if (
              opacity.get(id) !== 1 ||
              (emphasized.size && emphasized.has(id)) ||
              (highlighted.size && highlighted.has(id)) ||
              id === s.hovered ||
              (births.size && births.has(id))
            )
              continue;
            plain[i] = 1;
            const x = projX[i] * zoom + panX,
              y = projY[i] * zoom + panY;
            if (x < -20 || y < -20 || x > width + 20 || y > height + 20)
              continue;
            // radius() without the 3D scale lookup.
            const r = Math.max(
              0.75,
              Math.min(9, (2 + Math.log2(1 + (counts[id] || 1)) * 0.5) * grow),
            );
            if (r < 1.25) {
              const half = r * 0.886;
              ctx.rect(x - half, y - half, half * 2, half * 2);
            } else {
              ctx.moveTo(x + r, y);
              ctx.arc(x, y, r, 0, Math.PI * 2);
            }
            any = true;
          }
          if (!any) continue;
          ctx.fillStyle = palette[color];
          ctx.fill();
        }
      for (const node of drawOrder) {
        if (plain[nodeIndex.get(node.id)!]) continue;
        const alpha = opacity.get(node.id) || 0;
        if (!alpha) continue;
        const projection = projected.get(node.id)!;
        ctx.globalAlpha =
          alpha *
          (spatial
            ? emphasized.has(node.id)
              ? 1
              : 0.65 + 0.35 * (projection.depth / projectionRadius)
            : 1);
        const p = point(node.id),
          r = markerRadius(node.id) * (0.5 + alpha * 0.5);
        const strength = s.connectionStrengths.get(node.id);
        if (p.x < -20 || p.y < -20 || p.x > width + 20 || p.y > height + 20)
          continue;
        const special = node.id === s.selected || node.id === s.hovered;
        const born = births.get(node.id);
        if (born !== undefined) {
          const age = (now - born) / 900;
          if (age >= 1) births.delete(node.id);
          else {
            const alpha = ctx.globalAlpha;
            ctx.globalAlpha *= (1 - age) * 0.55;
            ctx.beginPath();
            ctx.arc(p.x, p.y, r + 3 + age * 17, 0, Math.PI * 2);
            ctx.strokeStyle = groupInfo(node.group).color;
            ctx.lineWidth = 1.3;
            ctx.stroke();
            ctx.globalAlpha = alpha;
          }
        }
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
      // Group names sit above the markers; only musician boxes cover them.
      if (namedRegions.length) {
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.lineJoin = "round";
        ctx.strokeStyle = "rgba(250, 250, 246, 0.92)";
        ctx.fillStyle = "#2c4a3b";
        for (const { lines, x, y, w, size, alpha } of namedRegions) {
          ctx.globalAlpha = alpha;
          ctx.font = `600 ${size}px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif`;
          ctx.lineWidth = Math.max(3, size * 0.32);
          lines.forEach((line, k) => {
            const ly = y + size * 0.1 + size * 1.15 * (k + 0.5);
            ctx.strokeText(line, x + w / 2, ly);
            ctx.fillText(line, x + w / 2, ly);
          });
        }
        ctx.globalAlpha = 1;
        ctx.textBaseline = "alphabetic";
      }
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
              .filter(
                (node) =>
                  (!s.instrument && !groupMembers.size) ||
                  highlighted.has(node.id),
              )
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
        const overlaps = (b: (typeof occupied)[number]) =>
          x < b.x + b.w && x + w > b.x && y < b.y + b.h && y + 18 > b.y;
        // Group names outrank everyone but the active people.
        if (occupied.some(overlaps) || (!special && regionBoxes.some(overlaps)))
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
      if (haloRing && s.highlightLabel) {
        const v = focusViewport();
        const inset = 36;
        const offscreen =
          haloRing.x < v.left + inset ||
          haloRing.x > v.right - inset ||
          haloRing.y < v.top + inset ||
          haloRing.y > v.bottom - inset;
        ctx.font = `600 12px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif`;
        const label =
          s.highlightLabel.length > 32
            ? s.highlightLabel.slice(0, 31) + "…"
            : s.highlightLabel;
        const cx = (v.left + v.right) / 2,
          cy = (v.top + v.bottom) / 2;
        const dx = haloRing.x - cx,
          dy = haloRing.y - cy;
        const w = ctx.measureText(label).width + (offscreen ? 40 : 22),
          h = 26;
        let x: number, y: number;
        if (offscreen) {
          const t = Math.min(
            dx
              ? Math.max(0, (v.right - v.left) / 2 - inset) / Math.abs(dx)
              : Infinity,
            dy
              ? Math.max(0, (v.bottom - v.top) / 2 - inset) / Math.abs(dy)
              : Infinity,
          );
          x = cx + dx * t - w / 2;
          y = cy + dy * t - h / 2;
        } else {
          // Name the ring just above its top edge.
          x = haloRing.x - w / 2;
          y = haloRing.y - haloRing.r - h - 6;
          if (y < v.top) y = haloRing.y + haloRing.r + 6;
        }
        x = Math.max(v.left, Math.min(v.right - w, x));
        y = Math.max(v.top, Math.min(v.bottom - h, y));
        ctx.beginPath();
        ctx.roundRect(x, y, w, h, 13);
        ctx.fillStyle = offscreen ? "#fff" : "#fdf7f0";
        ctx.fill();
        ctx.strokeStyle = "#c78d52";
        ctx.lineWidth = 1.2;
        ctx.stroke();
        if (offscreen) {
          ctx.save();
          ctx.translate(x + 16, y + h / 2);
          ctx.rotate(Math.atan2(dy, dx));
          ctx.beginPath();
          ctx.moveTo(6, 0);
          ctx.lineTo(-4, -5);
          ctx.lineTo(-4, 5);
          ctx.closePath();
          ctx.fillStyle = "#b5773f";
          ctx.fill();
          ctx.restore();
        }
        ctx.fillStyle = "#6b4520";
        ctx.textAlign = "left";
        ctx.textBaseline = "middle";
        ctx.fillText(label, x + (offscreen ? 29 : 11), y + h / 2 + 0.5);
        ctx.textBaseline = "alphabetic";
      }
      if (animating) invalidateFrame();
      canvas.dataset.animating = String(
        running ||
          animating ||
          camera !== null ||
          (spatial &&
            !motion.matches &&
            Math.hypot(yawVelocity, pitchVelocity) > 0.00002),
      );
      canvas.dataset.visibleNodes = String(s.data.nodes.length);
      canvas.dataset.musicianLabels = JSON.stringify(visibleLabels);
      canvas.dataset.ensembles = JSON.stringify(visibleEnsembles);
      // Expose the rendered state for interaction checks.
      canvas.dataset.visibleEdges = String(s.edges.length);
      canvas.dataset.highlighted = [...highlighted].join(",");
      canvas.dataset.view = `${zoom},${panX},${panY}`;
      canvas.dataset.rotation = `${yaw},${pitch}`;
      canvas.dataset.pivot = `${pivot.x},${pivot.y},${pivot.z ?? 0}`;
      canvas.dataset.focusedNodes =
        spatial && focus !== null ? [...connected].join(",") : "";
      canvas.dataset.depth = String(spatial ? scene.radius : 0);
      canvas.dataset.focus = focus === null ? "" : String(focus);
      canvas.dataset.path = s.path.join(",");
      canvas.dataset.selectedPosition =
        s.selected !== null && positions.has(s.selected)
          ? `${point(s.selected).x},${point(s.selected).y}`
          : "";
    }
    document.addEventListener("visibilitychange", invalidateFrame);
    invalidateFrame();
    return () => {
      disposed = true;
      previousPositions.current = new Map(positions);
      physics?.dispose();
      document.removeEventListener("visibilitychange", invalidateFrame);
      cancelAnimationFrame(frame);
      clearTimeout(regionTimer);
      observer.disconnect();
      panels.disconnect();
      panelChanges.disconnect();
      panelRoot.removeEventListener("animationend", finishPanelAnimation);
      panelRoot.removeEventListener("animationcancel", finishPanelAnimation);
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
    props.mode,
    props.spacing,
    props.resolution,
    props.livePhysics,
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
