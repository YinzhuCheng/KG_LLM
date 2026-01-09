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
    signal: args.signal
  };

  const result =
    args.protocol === "openai"
      ? await openaiExtract(common)
      : args.protocol === "anthropic"
        ? await anthropicExtract(common)
        : await geminiExtract(common);

  return normalizeLlmResult(result);
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

