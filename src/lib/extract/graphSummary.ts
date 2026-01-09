import { AppGraph } from "../graph/types";

export function summarizeGraphForLlm(graph: AppGraph, maxNodes = 120) {
  // Provide a compact id/type/title/label list for cross-chunk linking.
  const nodes = graph.nodes.slice(0, maxNodes);
  const lines = nodes.map((n) => {
    const label = typeof n.source?.latexLabel === "string" ? ` label=${n.source.latexLabel}` : "";
    return `- ${n.id} | ${n.type} | ${truncate(n.title, 80)}${label}`;
  });
  const edges = graph.edges.slice(0, 80).map((e) => `- (${e.type}) ${e.source} -> ${e.target}`);
  return [`nodes(${graph.nodes.length}) showing ${nodes.length}:`, ...lines, "", `edges(${graph.edges.length}) showing ${edges.length}:`, ...edges]
    .join("\n")
    .trim();
}

function truncate(s: string, n: number) {
  if (s.length <= n) return s;
  return s.slice(0, n - 1) + "…";
}

