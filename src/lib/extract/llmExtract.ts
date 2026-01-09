import { EntityType, GraphEdge, GraphNode, RelationType } from "../graph/types";
import { LlmProtocol } from "../../state/store";
import { buildExtractionPrompt } from "./llmPrompt";
import { summarizeGraphForLlm } from "./graphSummary";
import { openaiExtract } from "../llm/openai";
import { anthropicExtract } from "../llm/anthropic";
import { geminiExtract } from "../llm/gemini";
import { LatexChunk } from "../latex/chunkLatex";

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
}) {
  const graphSummary = summarizeGraphForLlm(args.graph, 160);
  const prompt = buildExtractionPrompt({
    chunk: args.chunk,
    selectedEntities: args.selectedEntities,
    selectedRelations: args.selectedRelations,
    graphSummary,
    userNotes: args.userNotes
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
  const { filtered, warnings } = filterSuspicious(normalized, args.chunk.text);
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
    if (n.type === "Formula") {
      const content = (n.content ?? "").trim();
      const title = (n.title ?? "").trim();
      const grounded =
        looksLikeMath(content) ||
        // if content missing but label present, allow (some models omit content)
        (typeof n.source?.latexLabel === "string" && n.source.latexLabel.length > 0);
      const titleLooksLikeNarrative = title.length >= 8 && /[\u4e00-\u9fff]/.test(title) && !/(\(|\)|\\|=|\$|_|\^)/.test(title);
      const titleInChunk = title && chunkText.includes(title);

      if (!grounded || (titleLooksLikeNarrative && !titleInChunk)) {
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

