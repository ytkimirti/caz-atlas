import type { Point3D } from "./projection";
import type { Edge } from "./types";
import type { PhysicsRequest, PhysicsResponse } from "./live-physics.worker";

/** At most one request is in flight. Slow frames never build a worker backlog. */
export class LivePhysicsClient {
  private worker: Worker;
  private pending = false;
  private revision = 0;
  private graph?: { nodes: { id: number }[]; edges: Edge[] };
  private positions = new Map<number, Point3D>();
  private seedNew = false;
  private elapsed = 0;
  ticks = 0;

  constructor(
    anchors: Map<number, Point3D>,
    spatial: boolean,
    spacing: number,
    onUpdate: (added: number[]) => void,
    onError: () => void,
  ) {
    this.worker = new Worker(
      new URL("./live-physics.worker.ts", import.meta.url),
      { type: "module" },
    );
    this.worker.onmessage = (event: MessageEvent<PhysicsResponse>) => {
      this.pending = false;
      const result = event.data;
      if (result.revision === this.revision) {
        const packed = result.positions;
        for (let i = 0; i < packed.length; i += 4)
          this.positions.set(packed[i], {
            x: packed[i + 1],
            y: packed[i + 2],
            z: packed[i + 3],
          });
        this.ticks = result.ticks;
        onUpdate(result.added);
      }
      if (this.graph) this.send();
    };
    this.worker.onerror = (event) => {
      event.preventDefault();
      this.dispose();
      onError();
    };
    this.worker.onmessageerror = () => {
      this.dispose();
      onError();
    };
    this.post({ type: "init", anchors: [...anchors], spatial, spacing });
  }

  sync(
    nodes: { id: number }[],
    edges: Edge[],
    positions: Map<number, Point3D>,
    seedNew = true,
  ) {
    this.positions = positions;
    this.graph = { nodes: nodes.map(({ id }) => ({ id })), edges };
    this.seedNew = seedNew;
    this.revision++;
    this.send();
  }

  advance(elapsed: number) {
    this.elapsed = Math.min(50, this.elapsed + elapsed);
    this.send();
  }

  private post(request: PhysicsRequest) {
    this.worker.postMessage(request);
  }

  private send() {
    if (this.pending) return;
    this.pending = true;
    this.post({
      type: "step",
      revision: this.revision,
      graph: this.graph,
      seedNew: this.seedNew,
      elapsed: this.elapsed,
    });
    this.graph = undefined;
    this.elapsed = 0;
  }

  pause() {
    this.revision++;
    this.elapsed = 0;
  }

  dispose() {
    this.worker.terminate();
    this.worker.onmessage = null;
    this.pending = true;
  }
}
