import createGraph from "ngraph.graph";
import createLayout from "ngraph.forcelayout";
import type { Link } from "ngraph.graph";
import type { Point3D } from "./projection";
import type { Edge } from "./types";
import { edgeKey } from "./graph";
import { layoutLinks } from "./layout-links";

const STEP_MS = 1000 / 60;

/** One persistent world, advanced by the canvas clock, never by its own timer. */
export class LivePhysics {
  private graph = createGraph();
  private layout;
  private links = new Map<string, Link>();
  private ids = new Set<number>();
  private accumulated = 0;
  private disposed = false;
  ticks = 0;

  constructor(
    private anchors: ReadonlyMap<number, Point3D>,
    private spatial: boolean,
    private spacing = 1,
  ) {
    this.layout = createLayout(this.graph, {
      dimensions: spatial ? 3 : 2,
      springLength: 48 * spacing,
      springCoefficient: 0.0006,
      gravity: -18 * spacing * spacing,
      dragCoefficient: 0.18,
      timeStep: 2,
      theta: 0.9,
    });
    // Gentle tethers keep disconnected communities in the same neighborhood.
    this.layout.simulator.addForce("home", () => {
      for (const id of this.ids) {
        const body = this.layout.getBody(id)!;
        const home = this.anchors.get(id)!;
        const strength = 0.00004 * body.mass;
        body.force.x += (home.x - body.pos.x) * strength;
        body.force.y += (home.y - body.pos.y) * strength;
        if (this.spatial)
          body.force.z! += ((home.z ?? 0) - body.pos.z!) * strength;
      }
    });
  }

  sync(
    nodes: { id: number }[],
    edges: Edge[],
    positions: Map<number, Point3D>,
    seedNew = true,
  ): number[] {
    if (this.disposed) return [];
    const next = new Set(nodes.map((n) => n.id));
    const springs = layoutLinks(
      nodes.map((n) => ({ ...n, count: 0 })),
      edges,
    );
    const keys = new Set(springs.map((e) => edgeKey(e.source, e.target)));
    for (const [key, link] of this.links) {
      if (keys.has(key)) continue;
      this.graph.removeLink(link);
      this.links.delete(key);
    }
    for (const id of this.ids) {
      if (next.has(id)) continue;
      this.graph.removeNode(id);
      this.ids.delete(id);
    }
    const neighbors = new Map<number, number[]>();
    for (const edge of springs) {
      for (const [a, b] of [
        [edge.source, edge.target],
        [edge.target, edge.source],
      ]) {
        if (!neighbors.has(a)) neighbors.set(a, []);
        neighbors.get(a)!.push(b);
      }
    }
    const added: number[] = [];
    for (const { id } of nodes) {
      if (this.ids.has(id)) continue;
      const home = this.anchors.get(id);
      if (!home) continue;
      const friends = seedNew
        ? (neighbors.get(id) ?? []).filter((friend) => this.ids.has(friend))
        : [];
      let origin = positions.get(id) ?? home;
      if (friends.length) {
        origin = { x: 0, y: 0, z: 0 };
        for (const friend of friends) {
          const p = this.layout.getNodePosition(friend);
          origin.x += p.x / friends.length;
          origin.y += p.y / friends.length;
          origin.z! += (p.z ?? 0) / friends.length;
        }
        const angle = id * 2.3999632297;
        origin.x += Math.cos(angle) * 22 * this.spacing;
        origin.y += Math.sin(angle) * 22 * this.spacing;
        if (this.spatial) origin.z! += Math.sin(id * 1.618) * 22 * this.spacing;
      }
      this.graph.addNode(id);
      this.layout.setNodePosition(id, origin.x, origin.y, origin.z ?? 0);
      this.ids.add(id);
      positions.set(id, { ...this.layout.getNodePosition(id) });
      added.push(id);
    }
    for (const edge of springs) {
      const key = edgeKey(edge.source, edge.target);
      let link = this.links.get(key);
      if (!link) {
        link = this.graph.addLink(edge.source, edge.target);
        this.links.set(key, link);
      }
      // Concert counts change spring tension without resetting momentum.
      this.layout.getSpring(link).coefficient =
        0.0006 * Math.min(2.5, 1 + Math.log2(1 + edge.weight) * 0.2);
    }
    return added;
  }

  advance(elapsed: number, positions: Map<number, Point3D>): boolean {
    if (this.disposed || !this.ids.size) return false;
    // Fixed physical time at 60 Hz, with bounded catch-up after slow frames.
    this.accumulated = Math.min(
      STEP_MS * 3,
      this.accumulated + Math.max(0, elapsed),
    );
    let changed = false;
    while (this.accumulated + 1e-6 >= STEP_MS) {
      this.layout.step();
      this.accumulated = Math.max(0, this.accumulated - STEP_MS);
      this.ticks++;
      changed = true;
    }
    if (changed)
      for (const id of this.ids)
        positions.set(id, { ...this.layout.getNodePosition(id) });
    return changed;
  }

  pause() {
    this.accumulated = 0;
  }

  dispose() {
    this.disposed = true;
    this.layout.dispose();
  }
}
