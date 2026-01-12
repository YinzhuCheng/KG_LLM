import { AppGraph } from "../graph/types";
import { LatexChunk } from "../latex/chunkLatex";

export function summarizeGraphForLlm(graph: AppGraph, maxNodes = 120, chunk?: LatexChunk) {
  // Retrieval-style summary: prefer nodes likely relevant to the current chunk,
  // so the model can correctly reference existing ids and create cross-chunk edges.
  const allNodes = graph.nodes ?? [];
  const allEdges = graph.edges ?? [];

  const query = chunk ? buildQuery(chunk) : { labels: new Set<string>(), words: new Set<string>(), sectionHint: "" };
  const scored = allNodes
    .map((n) => ({ n, score: scoreNode(n, query) }))
    .sort((a, b) => b.score - a.score);

  const picked: typeof scored = [];
  const seen = new Set<string>();

  // First pick top-scoring nodes.
  for (const it of scored) {
    if (picked.length >= maxNodes) break;
    if (!seen.has(it.n.id) && it.score > 0) {
      picked.push(it);
      seen.add(it.n.id);
    }
  }

  // Fill remaining budget with earliest nodes for stability.
  for (const n of allNodes) {
    if (picked.length >= maxNodes) break;
    if (!seen.has(n.id)) {
      picked.push({ n, score: 0 });
      seen.add(n.id);
    }
  }

  const nodes = picked.map((x) => x.n);
  const keepIds = new Set(nodes.map((n) => n.id));
  const edges = allEdges
    .filter((e) => keepIds.has(e.source) || keepIds.has(e.target))
    .slice(0, 120)
    .map((e) => `- (${e.type}) ${e.source} -> ${e.target}`);

  const lines = nodes.map((n) => {
    const label = typeof n.source?.latexLabel === "string" ? ` label=${n.source.latexLabel}` : "";
    const sec = Array.isArray(n.source?.sectionPath) && n.source!.sectionPath!.length ? ` sec=${n.source!.sectionPath!.slice(-2).join("/")}` : "";
    return `- ${n.id} | ${n.type} | ${n.title}${label}${sec}`;
  });

  return [`nodes(${allNodes.length}) showing ${nodes.length}:`, ...lines, "", `edges(${allEdges.length}) showing ${edges.length}:`, ...edges]
    .join("\n")
    .trim();
}

function buildQuery(chunk: LatexChunk) {
  const labels = new Set<string>();
  for (const m of chunk.text.matchAll(/\\(eqref|ref|autoref|cref)\{([^}]+)\}/g)) {
    labels.add((m[2] ?? "").trim());
  }
  for (const m of chunk.text.matchAll(/\\label\{([^}]+)\}/g)) {
    labels.add((m[1] ?? "").trim());
  }

  const raw = `${chunk.title} ${chunk.sectionPath.join(" ")} ${chunk.text.slice(0, 600)}`.replace(/\s+/g, " ");
  const words = new Set<string>();
  for (const w of raw
    .replace(/\\[a-zA-Z]+\b/g, " ")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .split(" ")
    .map((x) => x.trim().toLowerCase())
    .filter(Boolean)) {
    if (w.length >= 4) words.add(w);
    if (words.size > 40) break;
  }
  const sectionHint = chunk.sectionPath.slice(-2).join(" / ");
  return { labels, words, sectionHint };
}

function scoreNode(n: any, q: { labels: Set<string>; words: Set<string>; sectionHint: string }) {
  let s = 0;
  const label = typeof n?.source?.latexLabel === "string" ? n.source.latexLabel : null;
  if (label && q.labels.has(label)) s += 20;
  if (typeof n?.id === "string" && n.id.startsWith("tex:")) {
    const idLabel = n.id.slice("tex:".length);
    if (q.labels.has(idLabel)) s += 20;
  }
  const title = (n?.title ?? "").toLowerCase();
  for (const w of q.words) {
    if (title.includes(w)) s += 2;
  }
  const sec = Array.isArray(n?.source?.sectionPath) ? n.source.sectionPath.slice(-2).join(" / ") : "";
  if (sec && q.sectionHint && sec === q.sectionHint) s += 3;
  return s;
}

