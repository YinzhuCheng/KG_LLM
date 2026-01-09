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
  example: "Example",
  exercise: "Exercise",
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

  // add structured fields for Example/Exercise but keep content intact in the same node
  for (const n of envNodes) {
    if (n.type === "Example" || n.type === "Exercise") {
      const parts = splitExampleExercise(n.content ?? "");
      if (parts) {
        n.meta = { ...(n.meta ?? {}), problem: parts.problem, solution: parts.solution, answer: parts.answer };
      }
    }
  }

  // 1.1) Bind Example/Exercise to nearest previous core node (best-effort)
  const coreTypes: EntityType[] = ["Theorem", "Lemma", "Corollary", "Definition", "Axiom", "Proposition", "Conclusion", "Formula"];
  let lastCore: GraphNode | null = null;
  for (const n of envNodes) {
    if (coreTypes.includes(n.type) && n.type !== "Example" && n.type !== "Exercise") lastCore = n;
    if ((n.type === "Example" || n.type === "Exercise") && lastCore) {
      if (n.type === "Exercise" && selectedRelations.includes("AppliesTo")) {
        edges.push({ type: "AppliesTo", source: n.id, target: lastCore.id, meta: { chunkId: chunk.id } });
      } else if (selectedRelations.includes("AssistsIn")) {
        edges.push({ type: "AssistsIn", source: n.id, target: lastCore.id, meta: { chunkId: chunk.id } });
      }
    }
  }

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
  const re = /\\begin\{(theorem|lemma|corollary|definition|example|exercise|axiom|proposition|conclusion)\}([\s\S]*?)\\end\{\1\}/gi;
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
  const exRanges = getExampleExerciseRanges(chunk.text);
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
      // Avoid splitting formulas out of Example/Exercise unless labeled.
      const matchIndex = (m as any).index as number | undefined;
      if (!label && typeof matchIndex === "number" && isWithinRanges(matchIndex, exRanges)) {
        continue;
      }
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

function splitExampleExercise(content: string) {
  const c = (content ?? "").trim();
  if (!c) return null;
  const solEnv = c.match(/\\begin\{solution\}([\s\S]*?)\\end\{solution\}/i);
  const ansEnv = c.match(/\\begin\{answer\}([\s\S]*?)\\end\{answer\}/i);
  if (solEnv || ansEnv) {
    const solution = solEnv?.[1]?.trim() ?? "";
    const answer = ansEnv?.[1]?.trim() ?? "";
    const problem = c.replace(solEnv?.[0] ?? "", "").replace(ansEnv?.[0] ?? "", "").trim();
    return { problem, solution, answer };
  }
  const idxSol = c.search(/\n\s*(解答|解|证明)\s*[:：]?\s*\n/);
  const idxAns = c.search(/\n\s*(答案)\s*[:：]?\s*\n/);
  if (idxSol >= 0 || idxAns >= 0) {
    const cut = (i: number) => (i >= 0 ? i : c.length);
    const pEnd = Math.min(cut(idxSol), cut(idxAns));
    const problem = c.slice(0, pEnd).trim();
    let solution = "";
    let answer = "";
    if (idxSol >= 0) {
      const solEnd = idxAns >= 0 && idxAns > idxSol ? idxAns : c.length;
      solution = c.slice(idxSol, solEnd).trim();
    }
    if (idxAns >= 0) answer = c.slice(idxAns).trim();
    return { problem, solution, answer };
  }
  return null;
}

function getExampleExerciseRanges(text: string) {
  const ranges: Array<{ start: number; end: number }> = [];
  const re = /\\begin\{(example|exercise)\}[\s\S]*?\\end\{\1\}/gi;
  for (const m of text.matchAll(re)) {
    const idx = (m as any).index as number | undefined;
    if (typeof idx === "number") ranges.push({ start: idx, end: idx + (m[0]?.length ?? 0) });
  }
  return ranges;
}

function isWithinRanges(pos: number, ranges: Array<{ start: number; end: number }>) {
  return ranges.some((r) => pos >= r.start && pos <= r.end);
}

