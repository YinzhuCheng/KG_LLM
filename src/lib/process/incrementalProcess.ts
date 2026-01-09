import { EntityType, RelationType } from "../graph/types";
import { LatexChunk } from "../latex/chunkLatex";
import { heuristicExtractFromChunk } from "../extract/heuristicExtract";
import { llmExtractFromChunk } from "../extract/llmExtract";
import { LlmConfig, UserSchemaSelection } from "../../state/store";
import { useAppStore } from "../../state/store";

export async function runIncrementalExtraction(args: {
  chunks: LatexChunk[];
  schema: UserSchemaSelection;
  llm: LlmConfig;
}) {
  const store = useAppStore.getState();
  store.setError(null);
  store.setInfo(null);
  store.setProcessing({ status: "extracting", totalChunks: args.chunks.length, doneChunks: 0 });

  const abortController = new AbortController();
  store.setProcessing({ abortController });

  // label index for cross-chunk linking (works for both heuristic and LLM, if ids use tex:<label>)
  const knownLabelToNodeId = new Map<string, string>();
  for (const n of store.graph.nodes) {
    const label = typeof n.source?.latexLabel === "string" ? n.source.latexLabel : null;
    if (label) knownLabelToNodeId.set(label, n.id);
  }

  try {
    for (let i = 0; i < args.chunks.length; i++) {
      if (abortController.signal.aborted) {
        useAppStore.getState().setProcessing({ status: "stopped", abortController: undefined });
        return;
      }

      const chunk = args.chunks[i];
      store.setProcessing({ currentChunkTitle: chunk.title });

      let extracted: { nodes: any[]; edges: any[] };
      if (args.llm.enabled && args.llm.apiKey.trim()) {
        extracted = await llmExtractFromChunk({
          protocol: args.llm.protocol,
          baseUrl: args.llm.baseUrl,
          apiKey: args.llm.apiKey,
          model: args.llm.model,
          temperature: args.llm.temperature,
          topP: args.llm.topP,
          chunk,
          selectedEntities: args.schema.entityTypes as EntityType[],
          selectedRelations: args.schema.relationTypes as RelationType[],
          graph: useAppStore.getState().graph,
          userNotes: args.schema.notes ?? "",
          signal: abortController.signal
        });
      } else {
        extracted = heuristicExtractFromChunk({
          chunk,
          selectedEntities: args.schema.entityTypes as EntityType[],
          selectedRelations: args.schema.relationTypes as RelationType[],
          knownLabelToNodeId
        });
      }

      // update label index for new nodes
      for (const n of extracted.nodes) {
        const label = typeof n?.source?.latexLabel === "string" ? n.source.latexLabel : null;
        if (label && typeof n?.id === "string") knownLabelToNodeId.set(label, n.id);
      }

      store.mergeGraph({ nodes: extracted.nodes as any, edges: extracted.edges as any });
      store.setProcessing({ doneChunks: i + 1 });
    }

    store.setProcessing({ status: "done", abortController: undefined });
    store.setInfo("处理完成");
  } catch (e: any) {
    if (abortController.signal.aborted) {
      store.setProcessing({ status: "stopped", abortController: undefined });
      return;
    }
    store.setProcessing({ status: "error", abortController: undefined });
    store.setError(String(e?.message ?? e));
  }
}

