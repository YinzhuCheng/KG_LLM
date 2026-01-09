import { Parser } from "n3";
import { AppGraph, GraphEdge, GraphNode } from "../graph/types";
import { NS } from "./exporters";

export function importGraphJson(text: string): AppGraph {
  const obj = JSON.parse(text);
  if (obj?.graph?.nodes && obj?.graph?.edges) return obj.graph as AppGraph;
  if (obj?.nodes && obj?.edges) return obj as AppGraph;
  throw new Error("JSON 格式不匹配（期望 {graph:{nodes,edges}} 或 {nodes,edges}）");
}

export async function importGraphTurtle(text: string): Promise<AppGraph> {
  const parser = new Parser();
  const quads = parser.parse(text);

  const nodes = new Map<string, Partial<GraphNode>>();
  const edges: GraphEdge[] = [];

  const decodeNodeId = (uri: string) => {
    const prefix = `${NS.base}node:`;
    if (!uri.startsWith(prefix)) return null;
    return decodeURIComponent(uri.slice(prefix.length));
  };

  const isKgPred = (uri: string) => uri.startsWith(NS.base);

  for (const q of quads) {
    const s = q.subject.value;
    const p = q.predicate.value;
    const o = q.object;

    const sid = decodeNodeId(s);
    if (!sid) continue;

    const n = nodes.get(sid) ?? { id: sid };
    nodes.set(sid, n);

    if (p === `${NS.rdf}type` && o.termType === "NamedNode" && o.value.startsWith(NS.base)) {
      const t = o.value.slice(NS.base.length);
      (n as any).type = t;
    } else if (p === `${NS.rdfs}label` && o.termType === "Literal") {
      (n as any).title = o.value;
    } else if (p === `${NS.base}content` && o.termType === "Literal") {
      (n as any).content = o.value;
    } else if (p === `${NS.base}sourceFile` && o.termType === "Literal") {
      (n as any).source = { ...(n as any).source, file: o.value };
    } else if (p === `${NS.base}latexLabel` && o.termType === "Literal") {
      (n as any).source = { ...(n as any).source, latexLabel: o.value };
    } else if (isKgPred(p) && o.termType === "NamedNode") {
      const rel = p.slice(NS.base.length);
      const tid = decodeNodeId(o.value);
      if (tid) edges.push({ type: rel as any, source: sid, target: tid });
    }
  }

  const finalNodes: GraphNode[] = [];
  for (const [id, partial] of nodes.entries()) {
    if (!partial.type || !partial.title) {
      finalNodes.push({ id, type: (partial.type as any) ?? "Conclusion", title: partial.title ?? id, content: partial.content as any, source: partial.source as any });
    } else {
      finalNodes.push(partial as GraphNode);
    }
  }

  return { nodes: finalNodes, edges };
}

