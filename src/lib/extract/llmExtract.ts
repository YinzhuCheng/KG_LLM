import { EntityType, GraphEdge, GraphNode, RelationType } from "../graph/types";
import { LlmProtocol } from "../../state/store";
import { buildExtractionPrompt } from "./llmPrompt";
import { summarizeGraphForLlm } from "./graphSummary";
import { openaiExtract } from "../llm/openai";
import { anthropicExtract } from "../llm/anthropic";
import { geminiExtract } from "../llm/gemini";
import { LatexChunk } from "../latex/chunkLatex";
import { completeNodeLatexFromChunk } from "./completeFromChunk";

export async function llmExtractFromChunk(args: {
  protocol: LlmProtocol;
  baseUrl: string;
  apiKey: string;
  model: string;
  temperature: number;
  topP: number;
  maxTokens: number;
  chunk: LatexChunk;
  selectedEntities: EntityType[];
  selectedRelations: RelationType[];
  graph: { nodes: GraphNode[]; edges: GraphEdge[] };
  userNotes?: string;
  signal?: AbortSignal;
  phase?: 1 | 2;
  frozenNamespace?: boolean;
  conceptRegistrySummary?: string;
}) {
  const graphSummary = summarizeGraphForLlm(args.graph, 160);
  const prompt = buildExtractionPrompt({
    chunk: args.chunk,
    selectedEntities: args.selectedEntities,
    selectedRelations: args.selectedRelations,
    graphSummary,
    userNotes: args.userNotes,
    phase: args.phase,
    frozenNamespace: args.frozenNamespace,
    conceptRegistrySummary: args.conceptRegistrySummary
  });

  const common = {
    baseUrl: args.baseUrl,
    apiKey: args.apiKey,
    model: args.model,
    prompt,
    temperature: args.temperature,
    topP: args.topP,
    maxTokens: args.maxTokens,
    signal: args.signal
  };

  const result =
    args.protocol === "openai"
      ? await openaiExtract(common)
      : args.protocol === "anthropic"
        ? await anthropicExtract(common)
        : await geminiExtract(common);

  const normalized = normalizeLlmResult(result);
  const completed = applyPatches(normalized, completeNodeLatexFromChunk(normalized.nodes, args.chunk.text));
  const enriched = annotateExampleExercise(completed);
  const { filtered, warnings } = filterSuspicious(enriched, args.chunk.text);
  return { ...filtered, warnings };
}

function normalizeLlmResult(result: any): { nodes: GraphNode[]; edges: GraphEdge[] } {
  const nodes = Array.isArray(result?.nodes) ? result.nodes : [];
  const edges = Array.isArray(result?.edges) ? result.edges : [];
  return {
    nodes: nodes
      .filter((n: any) => n && typeof n.id === "string" && typeof n.type === "string" && typeof n.title === "string")
      .map((n: any) => ({
        id: n.id,
        type: n.type,
        title: n.title,
        content: typeof n.content === "string" ? n.content : undefined,
        source: typeof n.source === "object" ? n.source : undefined,
        meta: typeof n.meta === "object" ? n.meta : undefined
      })) as GraphNode[],
    edges: edges
      .filter(
        (e: any) =>
          e &&
          typeof e.type === "string" &&
          typeof e.source === "string" &&
          typeof e.target === "string" &&
          e.source !== e.target
      )
      .map((e: any) => ({
        type: e.type,
        source: e.source,
        target: e.target,
        evidence: typeof e.evidence === "string" ? e.evidence : undefined,
        meta: typeof e.meta === "object" ? e.meta : undefined
      })) as GraphEdge[]
  };
}

function filterSuspicious(normalized: { nodes: GraphNode[]; edges: GraphEdge[] }, chunkText: string) {
  const warnings: string[] = [];

  const keptNodes: GraphNode[] = [];
  const dropped = new Set<string>();

  for (const n of normalized.nodes) {
    // Drop very trivial nodes (no label, tiny content, generic title)
    if (isTrivial(n)) {
      dropped.add(n.id);
      warnings.push(`已丢弃 trivial 节点: ${n.type} ${n.title} (${n.id})`);
      continue;
    }

    if (n.type === "Formula") {
      const content = (n.content ?? "").trim();
      const title = (n.title ?? "").trim();
      const grounded =
        looksLikeMath(content) ||
        // if content missing but label present, allow (some models omit content)
        (typeof n.source?.latexLabel === "string" && n.source.latexLabel.length > 0);
      const titleLooksLikeNarrative = title.length >= 8 && /[\u4e00-\u9fff]/.test(title) && !/(\(|\)|\\|=|\$|_|\^)/.test(title);
      const titleInChunk = title && chunkText.includes(title);

      // Avoid splitting out formulas from inside Example/Exercise unless labeled.
      const hasLabel = typeof n.source?.latexLabel === "string" || n.id.startsWith("tex:");
      const insideExampleOrExercise = !hasLabel && isFormulaInsideExampleExercise(chunkText, content);

      if (!grounded || insideExampleOrExercise || (titleLooksLikeNarrative && !titleInChunk)) {
        dropped.add(n.id);
        warnings.push(`已丢弃可疑 Formula: ${n.title} (${n.id})`);
        continue;
      }
    }
    keptNodes.push(n);
  }

  const keptNodeIds = new Set(keptNodes.map((n) => n.id));
  const keptEdges = normalized.edges.filter((e) => keptNodeIds.has(e.source) && keptNodeIds.has(e.target));
  const droppedEdgeCount = normalized.edges.length - keptEdges.length;
  if (droppedEdgeCount > 0) warnings.push(`已丢弃 ${droppedEdgeCount} 条悬空边（源/目标节点被过滤）`);

  return { filtered: { nodes: keptNodes, edges: keptEdges }, warnings };
}

function looksLikeMath(s: string) {
  if (!s) return false;
  // accept common math envs/delimiters or math-heavy tokens
  if (/\\begin\{(equation|align|aligned|gather|multline)\}/.test(s)) return true;
  if (/\$\$[\s\S]*\$\$/.test(s)) return true;
  if (/\\\[[\s\S]*\\\]/.test(s)) return true;
  if (/\\(frac|sum|int|prod|mathbb|mathbf|mathrm|left|right|cdot|leq|geq|neq|infty)\b/.test(s)) return true;
  if (/[=<>]/.test(s) && /[a-zA-Z\\]/.test(s)) return true;
  if (/[0-9]/.test(s) && /[_^]/.test(s)) return true;
  return false;
}

function isTrivial(n: GraphNode) {
  const hasLabel = typeof n.source?.latexLabel === "string" || n.id.startsWith("tex:");
  if (hasLabel) return false;
  const title = (n.title ?? "").trim();
  const content = (n.content ?? "").trim();
  if (n.type === "Example" || n.type === "Exercise") return false; // keep as containers
  if (n.type === "Formula") return false; // handled elsewhere
  const genericTitle = /^(Theorem|Lemma|Corollary|Definition|Axiom|Proposition|Conclusion)\s*\d+$/i.test(title);
  const tooShort = content.length > 0 && content.length < 40 && !/\\(begin|frac|sum|int|label|ref)\b/.test(content);
  return genericTitle && tooShort;
}

function isFormulaInsideExampleExercise(chunkText: string, formulaContent: string) {
  if (!formulaContent || formulaContent.length < 8) return false;
  const blocks = [...chunkText.matchAll(/\\begin\{(example|exercise)\}([\s\S]*?)\\end\{\1\}/gi)].map((m) => m[2] ?? "");
  return blocks.some((b) => b.includes(formulaContent));
}

function annotateExampleExercise(normalized: { nodes: GraphNode[]; edges: GraphEdge[] }) {
  const nodes = normalized.nodes.map((n) => {
    if (n.type !== "Example" && n.type !== "Exercise") return n;
    const c = (n.content ?? "").trim();
    if (!c) return n;
    const parts = splitExampleExercise(c);
    if (!parts) return n;
    return {
      ...n,
      meta: {
        ...(n.meta ?? {}),
        problem: parts.problem,
        solution: parts.solution,
        answer: parts.answer
      }
    };
  });
  return { ...normalized, nodes };
}

function splitExampleExercise(content: string) {
  // Prefer explicit environments if present
  const solEnv = content.match(/\\begin\{solution\}([\s\S]*?)\\end\{solution\}/i);
  const ansEnv = content.match(/\\begin\{answer\}([\s\S]*?)\\end\{answer\}/i);
  if (solEnv || ansEnv) {
    const solution = solEnv?.[1]?.trim() ?? "";
    const answer = ansEnv?.[1]?.trim() ?? "";
    const problem = content
      .replace(solEnv?.[0] ?? "", "")
      .replace(ansEnv?.[0] ?? "", "")
      .trim();
    return { problem, solution, answer };
  }

  // Chinese markers: 解答 / 证明 / 答案
  const idxSol = content.search(/\n\s*(解答|解|证明)\s*[:：]?\s*\n/);
  const idxAns = content.search(/\n\s*(答案)\s*[:：]?\s*\n/);
  if (idxSol >= 0 || idxAns >= 0) {
    const cut = (i: number) => (i >= 0 ? i : content.length);
    const pEnd = Math.min(cut(idxSol), cut(idxAns));
    const problem = content.slice(0, pEnd).trim();
    let solution = "";
    let answer = "";
    if (idxSol >= 0) {
      const solEnd = idxAns >= 0 && idxAns > idxSol ? idxAns : content.length;
      solution = content.slice(idxSol, solEnd).trim();
    }
    if (idxAns >= 0) {
      answer = content.slice(idxAns).trim();
    }
    return { problem, solution, answer };
  }

  return null;
}

function applyPatches(
  normalized: { nodes: GraphNode[]; edges: GraphEdge[] },
  patches: { id: string; patch: Partial<GraphNode> }[]
) {
  if (!patches.length) return normalized;
  const map = new Map(patches.map((p) => [p.id, p.patch] as const));
  const nodes = normalized.nodes.map((n) => {
    const p = map.get(n.id);
    if (!p) return n;
    return { ...n, ...p, meta: { ...(n.meta ?? {}), ...(p as any).meta } };
  });
  return { ...normalized, nodes };
}

