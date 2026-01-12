import { AppGraph, EntityType, GraphEdge, GraphNode, RelationType } from "../graph/types";

export type PruneStats = {
  droppedNodeIds: string[];
  droppedEdgeCount: number;
};

const IMPORTANT_RELATIONS: RelationType[] = ["Proves", "DependsOn", "DerivedFrom", "EquivalentTo", "Uses", "AssistsIn", "AppliesTo"];

export function pruneGraphForCleanliness(graph: AppGraph): { graph: AppGraph; stats: PruneStats } {
  const nodes = graph.nodes ?? [];
  const edges = graph.edges ?? [];

  const byId = new Map(nodes.map((n) => [n.id, n] as const));
  const deg = new Map<string, { important: number; any: number }>();
  const inc = (id: string, important: boolean) => {
    const d = deg.get(id) ?? { important: 0, any: 0 };
    d.any++;
    if (important) d.important++;
    deg.set(id, d);
  };

  for (const e of edges) {
    const important = IMPORTANT_RELATIONS.includes(e.type);
    // ignore Contains for "importance"
    if (e.source) inc(e.source, important);
    if (e.target) inc(e.target, important);
  }

  const shouldDrop = (n: GraphNode) => {
    // Only aggressively prune Formula nodes for now (highest noise).
    if (n.type !== "Formula") return false;

    const label = typeof n.source?.latexLabel === "string" ? n.source.latexLabel : null;
    if (label || n.id.startsWith("tex:")) return false; // anchored formula

    const d = deg.get(n.id) ?? { important: 0, any: 0 };
    if (d.important > 0) return false; // participates in meaningful relations

    const title = (n.title ?? "").trim();
    const content = (n.content ?? "").trim();

    // Drop common "template" probability/statistics formulas unless explicitly anchored.
    if (looksLikeTemplateFormula(content) || looksLikeTemplateFormula(title)) return true;

    // Drop "problem-indexed" objects: Omega_5, E_7, A_{12} etc (very often exercise-local).
    if (looksProblemIndexed(content) || looksProblemIndexed(title)) return true;

    // Drop short, isolated display math (likely a step or local convention).
    if (content.length < 120) return true;

    return false;
  };

  const droppedNodeIds: string[] = [];
  const keptNodes: GraphNode[] = [];
  for (const n of nodes) {
    if (!n || typeof n.id !== "string") continue;
    if (shouldDrop(n)) {
      droppedNodeIds.push(n.id);
      byId.delete(n.id);
      continue;
    }
    keptNodes.push(n);
  }

  const keptIdSet = new Set(keptNodes.map((n) => n.id));
  const keptEdges: GraphEdge[] = [];
  let droppedEdgeCount = 0;
  for (const e of edges) {
    if (!keptIdSet.has(e.source) || !keptIdSet.has(e.target)) {
      droppedEdgeCount++;
      continue;
    }
    keptEdges.push(e);
  }

  return { graph: { nodes: keptNodes, edges: keptEdges }, stats: { droppedNodeIds, droppedEdgeCount } };
}

function looksLikeTemplateFormula(s: string) {
  const t = (s ?? "").replace(/\s+/g, " ").trim();
  if (!t) return false;

  // Probabilities / pmf/pdf generic templates
  if (/P\s*\(\s*[A-Za-z]\\?[_A-Za-z0-9]*\s*=\s*[A-Za-z0-9_{}\\]+\s*\)\s*=\s*p\s*\(/.test(t)) return true;
  if (/P\\left\(\s*[A-Za-z]\\?[_A-Za-z0-9]*\s*=\s*[A-Za-z0-9_{}\\]+\s*\\right\)\s*=\s*p\\left\(/.test(t)) return true;
  if (/\bf_?[A-Za-z]\s*\(\s*[A-Za-z]\s*\)/.test(t)) return true; // f_X(x), f(x)
  if (/p_?[A-Za-z]\s*\(\s*[A-Za-z]\s*\)/.test(t)) return true; // p_X(x), p(x)

  // Domain templates: (-infty, infty), x: -\infty < x < \infty
  if (/\\infty/.test(t) && /-\s*\\infty/.test(t) && /<\s*[A-Za-z]/.test(t)) return true;

  return false;
}

function looksProblemIndexed(s: string) {
  const t = (s ?? "").replace(/\s+/g, "").trim();
  if (!t) return false;

  // Omega_5, \Omega_{5}, A_12, E_{7} etc
  if (/\\Omega_\{?\d+\}?/.test(t)) return true;
  if (/[A-Za-z]_\{?\d+\}?/.test(t) && t.length <= 25) return true;
  return false;
}

