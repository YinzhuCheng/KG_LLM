import { AppGraph, EntityType, GraphEdge, GraphNode, RelationType } from "../graph/types";
import { LatexChunk } from "../latex/chunkLatex";

export type ExtractResult = {
  nodes: GraphNode[];
  edges: GraphEdge[];
};

const ENV_MAP: Record<string, EntityType> = {
  theorem: "Theorem",
  lemma: "Lemma",
  corollary: "Corollary",
  definition: "Definition",
  axiom: "Axiom",
  proposition: "Proposition",
  conclusion: "Conclusion"
};

export function heuristicExtractFromChunk(args: {
  chunk: LatexChunk;
  selectedEntities: EntityType[];
  selectedRelations: RelationType[];
  knownLabelToNodeId: Map<string, string>;
}): ExtractResult {
  const { chunk, selectedEntities, selectedRelations, knownLabelToNodeId } = args;
  const nodes: GraphNode[] = [];
  const edges: GraphEdge[] = [];

  // 0) Create a "section node" as Conclusion (used for Contains relations)
  const sectionNodeId = `sec:${chunk.sectionPath.join(" / ")}`;
  if (selectedEntities.includes("Conclusion")) {
    nodes.push({
      id: sectionNodeId,
      type: "Conclusion",
      title: chunk.sectionPath.slice(1).join(" / ") || chunk.title,
      content: "",
      source: { file: chunk.file, sectionPath: chunk.sectionPath }
    });
  }

  // 1) Extract theorem-like environments
  const envNodes = extractEnvironments(chunk, selectedEntities, knownLabelToNodeId);
  nodes.push(...envNodes);

  // 2) Extract display math as Formula
  if (selectedEntities.includes("Formula")) {
    const formulas = extractFormulas(chunk, knownLabelToNodeId);
    nodes.push(...formulas);
  }

  // 3) Contains edges from section -> extracted nodes
  if (selectedRelations.includes("Contains")) {
    for (const n of nodes) {
      if (n.id === sectionNodeId) continue;
      if (sectionNodeId.startsWith("sec:") && nodes.find((x) => x.id === sectionNodeId)) {
        edges.push({ type: "Contains", source: sectionNodeId, target: n.id, meta: { chunkId: chunk.id } });
      }
    }
  }

  // 4) DependsOn edges by \ref/\eqref
  if (selectedRelations.includes("DependsOn")) {
    const refs = extractRefs(chunk.text);
    const sourceCandidates = nodes.filter((n) => n.id !== sectionNodeId);
    for (const src of sourceCandidates) {
      for (const ref of refs) {
        const targetId = knownLabelToNodeId.get(ref);
        if (targetId && targetId !== src.id) {
          edges.push({
            type: "DependsOn",
            source: src.id,
            target: targetId,
            evidence: `reference: ${ref}`,
            meta: { chunkId: chunk.id }
          });
        }
      }
    }
  }

  // 5) DerivedFrom edges by "from" patterns (very light heuristic)
  if (selectedRelations.includes("DerivedFrom")) {
    const derived = /derived\s+from\s+(\\ref\{([^}]+)\})/gi;
    const matches = [...chunk.text.matchAll(derived)];
    if (matches.length) {
      const sourceCandidates = nodes.filter((n) => n.id !== sectionNodeId);
      for (const src of sourceCandidates) {
        for (const m of matches) {
          const label = m[2];
          const targetId = knownLabelToNodeId.get(label);
          if (targetId && targetId !== src.id) {
            edges.push({
              type: "DerivedFrom",
              source: src.id,
              target: targetId,
              evidence: m[0],
              meta: { chunkId: chunk.id }
            });
          }
        }
      }
    }
  }

  return { nodes: dedupeNodes(nodes), edges: dedupeEdges(edges) };
}

function extractEnvironments(chunk: LatexChunk, selectedEntities: EntityType[], knownLabelToNodeId: Map<string, string>) {
  const out: GraphNode[] = [];
  const re = /\\begin\{(theorem|lemma|corollary|definition|axiom|proposition|conclusion)\}([\s\S]*?)\\end\{\1\}/gi;
  let idx = 0;
  for (const m of chunk.text.matchAll(re)) {
    const env = (m[1] ?? "").toLowerCase();
    const type = ENV_MAP[env];
    if (!type || !selectedEntities.includes(type)) continue;
    const body = (m[2] ?? "").trim();
    const label = extractFirstLabel(body);
    const title = extractOptionalTitleFromBegin(m[0]) ?? `${type} ${idx + 1}`;
    const id = label ? `tex:${label}` : `${chunk.id}:${env}:${idx}`;
    idx++;
    const node: GraphNode = {
      id,
      type,
      title,
      content: body,
      source: { file: chunk.file, latexLabel: label ?? undefined, sectionPath: chunk.sectionPath }
    };
    out.push(node);
    if (label) knownLabelToNodeId.set(label, id);
  }
  return out;
}

function extractFormulas(chunk: LatexChunk, knownLabelToNodeId: Map<string, string>) {
  const out: GraphNode[] = [];
  const patterns = [
    /\\begin\{equation\}([\s\S]*?)\\end\{equation\}/gi,
    /\\begin\{align\}([\s\S]*?)\\end\{align\}/gi,
    /\$\$([\s\S]*?)\$\$/g,
    /\\\[([\s\S]*?)\\\]/g
  ];
  let idx = 0;
  for (const re of patterns) {
    for (const m of chunk.text.matchAll(re)) {
      const body = (m[1] ?? "").trim();
      if (!body) continue;
      const label = extractFirstLabel(body);
      const id = label ? `tex:${label}` : `${chunk.id}:formula:${idx++}`;
      const title = label ? `Formula (${label})` : `Formula ${idx}`;
      out.push({
        id,
        type: "Formula",
        title,
        content: body,
        source: { file: chunk.file, latexLabel: label ?? undefined, sectionPath: chunk.sectionPath }
      });
      if (label) knownLabelToNodeId.set(label, id);
    }
  }
  return out;
}

function extractFirstLabel(s: string) {
  const m = s.match(/\\label\{([^}]+)\}/);
  return m ? m[1].trim() : null;
}

function extractOptionalTitleFromBegin(envBlock: string) {
  // support \begin{theorem}[Name]
  const m = envBlock.match(/\\begin\{[a-zA-Z*]+\}\s*\[([^\]]+)\]/);
  return m ? m[1].trim() : null;
}

function extractRefs(s: string) {
  const refs = new Set<string>();
  for (const m of s.matchAll(/\\(eqref|ref|autoref|cref)\{([^}]+)\}/g)) {
    refs.add(m[2].trim());
  }
  return [...refs.values()];
}

function dedupeNodes(nodes: GraphNode[]) {
  const map = new Map<string, GraphNode>();
  for (const n of nodes) {
    const prev = map.get(n.id);
    map.set(n.id, prev ? { ...prev, ...n, meta: { ...prev.meta, ...n.meta } } : n);
  }
  return [...map.values()];
}

function dedupeEdges(edges: GraphEdge[]) {
  const key = (e: GraphEdge) => `${e.source}::${e.type}::${e.target}::${String(e.meta?.chunkId ?? "")}`;
  const map = new Map<string, GraphEdge>();
  for (const e of edges) map.set(key(e), e);
  return [...map.values()];
}

