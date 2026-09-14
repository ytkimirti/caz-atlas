import { LivePhysics } from "./live-physics";
import type { Point3D } from "./projection";
import type { Edge } from "./types";

export type PhysicsRequest =
  | {
      type: "init";
      anchors: [number, Point3D][];
      spatial: boolean;
      spacing: number;
    }
  | {
      type: "step";
      revision: number;
      elapsed: number;
      graph?: { nodes: { id: number }[]; edges: Edge[] };
      seedNew: boolean;
    };
export interface PhysicsResponse {
  revision: number;
  positions: Float64Array;
  added: number[];
  ticks: number;
}

let world: LivePhysics;
let positions: Map<number, Point3D>;
let ids: number[] = [];
self.onmessage = (event: MessageEvent<PhysicsRequest>) => {
  const request = event.data;
  if (request.type === "init") {
    world?.dispose();
    positions = new Map(request.anchors);
    world = new LivePhysics(
      new Map(request.anchors),
      request.spatial,
      request.spacing,
    );
    return;
  }
  const added = request.graph
    ? world.sync(
        request.graph.nodes,
        request.graph.edges,
        positions,
        request.seedNew,
      )
    : [];
  if (request.graph) ids = request.graph.nodes.map((n) => n.id);
  if (request.elapsed > 0) world.advance(request.elapsed, positions);
  else world.pause();
  const packed = new Float64Array(ids.length * 4);
  ids.forEach((id, i) => {
    const p = positions.get(id)!;
    packed.set([id, p.x, p.y, p.z ?? 0], i * 4);
  });
  const response: PhysicsResponse = {
    revision: request.revision,
    positions: packed,
    added: request.seedNew ? added : [],
    ticks: world.ticks,
  };
  self.postMessage(response, { transfer: [packed.buffer] });
};
