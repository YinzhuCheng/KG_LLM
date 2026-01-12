import { AppGraph } from "./types";

export function buildCytoscapeElements(graph: AppGraph) {
  const nodes = graph.nodes.map((n) => ({
    data: {
      id: n.id,
      label: `${n.type}: ${n.title}`,
      type: n.type,
      title: n.title,
      content: n.content ?? "",
      ...n.meta
    }
  }));
  const edges = graph.edges.map((e, idx) => ({
    data: {
      id: e.id ?? `${e.source}-${e.type}-${e.target}-${idx}`,
      source: e.source,
      target: e.target,
      label: e.type,
      type: e.type,
      evidence: e.evidence ?? ""
    }
  }));
  return [...nodes, ...edges];
}

