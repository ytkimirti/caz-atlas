import {
  forceCollide,
  forceLink,
  forceManyBody,
  forceSimulation,
  forceX,
  forceY,
} from "d3-force";
import type { SimulationNodeDatum } from "d3-force";
import type { Edge } from "./types";

interface LayoutNode extends SimulationNodeDatum {
  id: number;
  count: number;
}
interface LayoutRequest {
  nodes: LayoutNode[];
  edges: Edge[];
}

self.onmessage = (event: MessageEvent<LayoutRequest>) => {
  const { nodes, edges } = event.data;
  nodes.sort((a, b) => b.count - a.count || a.id - b.id);
  // Deterministic initialization keeps repeated filters reproducible.
  nodes.forEach((node, i) => {
    const r = Math.sqrt(i) * 19;
    node.x = Math.cos(i * 2.3999632297) * r;
    node.y = Math.sin(i * 2.3999632297) * r;
  });
  // Layout uses each person's three strongest ties, including one-sided ties.
  // This keeps quieter musicians near their collaborators without drawing a hub.
  const degree = new Map<number, number>();
  const links = [...edges]
    .sort(
      (a, b) =>
        b.weight - a.weight || a.source - b.source || a.target - b.target,
    )
    .filter((edge) => {
      const a = degree.get(edge.source) || 0,
        b = degree.get(edge.target) || 0;
      degree.set(edge.source, a + 1);
      degree.set(edge.target, b + 1);
      return a < 3 || b < 3;
    });
  const simulation = forceSimulation(nodes)
    .force(
      "link",
      forceLink<LayoutNode, Edge>(links)
        .id((n) => n.id)
        .distance(45)
        .strength(0.22),
    )
    .force("charge", forceManyBody<LayoutNode>().strength(-65).distanceMax(500))
    .force("x", forceX(0).strength(0.012))
    .force("y", forceY(0).strength(0.012))
    .force("collision", forceCollide<LayoutNode>(11).iterations(2))
    .stop();
  simulation.tick(nodes.length > 5000 ? 160 : 240);
  self.postMessage(nodes.map((n) => ({ id: n.id, x: n.x!, y: n.y! })));
};
