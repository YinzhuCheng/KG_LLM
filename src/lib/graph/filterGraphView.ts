import { AppGraph, GraphEdge, GraphNode } from "./types";

export type ViewFilters = {
  showExamples: boolean;
  showExercises: boolean;
  showIsolated: boolean;
};

export function filterGraphView(graph: AppGraph, view: ViewFilters): AppGraph {
  let nodes = graph.nodes;
  let edges = graph.edges;

  const hideTypes = new Set<string>();
  if (!view.showExamples) hideTypes.add("Example");
  if (!view.showExercises) hideTypes.add("Exercise");

  if (hideTypes.size) {
    const keepNodeIds = new Set(nodes.filter((n) => !hideTypes.has(n.type)).map((n) => n.id));
    nodes = nodes.filter((n) => keepNodeIds.has(n.id));
    edges = edges.filter((e) => keepNodeIds.has(e.source) && keepNodeIds.has(e.target));
  }

  if (!view.showIsolated) {
    const degree = new Map<string, number>();
    for (const n of nodes) degree.set(n.id, 0);
    for (const e of edges) {
      degree.set(e.source, (degree.get(e.source) ?? 0) + 1);
      degree.set(e.target, (degree.get(e.target) ?? 0) + 1);
    }
    const keepNodeIds = new Set(nodes.filter((n) => (degree.get(n.id) ?? 0) > 0).map((n) => n.id));
    nodes = nodes.filter((n) => keepNodeIds.has(n.id));
    edges = edges.filter((e) => keepNodeIds.has(e.source) && keepNodeIds.has(e.target));
  }

  return { nodes: nodes as GraphNode[], edges: edges as GraphEdge[] };
}

