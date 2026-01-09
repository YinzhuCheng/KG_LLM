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
    const useLlm = args.llm.enabled && args.llm.apiKey.trim().length > 0;

    if (!useLlm) {
      for (let i = 0; i < args.chunks.length; i++) {
        if (abortController.signal.aborted) {
          useAppStore.getState().setProcessing({ status: "stopped", abortController: undefined });
          return;
        }

        const chunk = args.chunks[i];
        store.setProcessing({ currentChunkTitle: chunk.title });

        const extracted = heuristicExtractFromChunk({
          chunk,
          selectedEntities: args.schema.entityTypes as EntityType[],
          selectedRelations: args.schema.relationTypes as RelationType[],
          knownLabelToNodeId
        });

        for (const n of extracted.nodes) {
          const label = typeof n?.source?.latexLabel === "string" ? n.source.latexLabel : null;
          if (label) knownLabelToNodeId.set(label, n.id);
        }

        store.mergeGraph({ nodes: extracted.nodes as any, edges: extracted.edges as any });
        store.setProcessing({ doneChunks: i + 1 });
      }

      store.setProcessing({ status: "done", abortController: undefined });
      store.setInfo("处理完成（启发式）");
      return;
    }

    // LLM mode: bounded concurrency + ordered merge
    const concurrency = Math.max(1, Math.min(32, Math.floor(args.llm.parallelism || 1)));
    const results = new Map<number, { nodes: any[]; edges: any[]; warnings?: string[] }>();
    let nextToDispatch = 0;
    let nextToCommit = 0;
    let inFlight = 0;
    const warningsAll: string[] = [];

    const dispatchOne = async (idx: number) => {
      const chunk = args.chunks[idx];
      const snapshotGraph = useAppStore.getState().graph;
      const res = await llmExtractFromChunk({
        protocol: args.llm.protocol,
        baseUrl: args.llm.baseUrl,
        apiKey: args.llm.apiKey,
        model: args.llm.model,
        temperature: args.llm.temperature,
        topP: args.llm.topP,
        maxTokens: args.llm.maxTokens,
        chunk,
        selectedEntities: args.schema.entityTypes as EntityType[],
        selectedRelations: args.schema.relationTypes as RelationType[],
        graph: snapshotGraph,
        userNotes: args.schema.notes ?? "",
        signal: abortController.signal
      });
      return res;
    };

    const pump = async () => {
      while (!abortController.signal.aborted && nextToDispatch < args.chunks.length && inFlight < concurrency) {
        const idx = nextToDispatch++;
        inFlight++;
        store.setProcessing({ currentChunkTitle: args.chunks[idx].title });
        dispatchOne(idx)
          .then((res: any) => {
            results.set(idx, res);
          })
          .catch((e: any) => {
            results.set(idx, { nodes: [], edges: [], warnings: [`chunk ${idx} 失败: ${String(e?.message ?? e)}`] });
          })
          .finally(() => {
            inFlight--;
          });
      }
    };

    while (!abortController.signal.aborted && nextToCommit < args.chunks.length) {
      await pump();

      // commit in order when available
      const ready = results.get(nextToCommit);
      if (!ready) {
        await sleep(60);
        continue;
      }

      results.delete(nextToCommit);

      for (const n of ready.nodes ?? []) {
        const label = typeof n?.source?.latexLabel === "string" ? n.source.latexLabel : null;
        if (label && typeof n?.id === "string") knownLabelToNodeId.set(label, n.id);
      }
      if (Array.isArray(ready.warnings)) warningsAll.push(...ready.warnings);

      store.mergeGraph({ nodes: ready.nodes as any, edges: ready.edges as any });
      nextToCommit++;
      store.setProcessing({ doneChunks: nextToCommit });
    }

    if (abortController.signal.aborted) {
      store.setProcessing({ status: "stopped", abortController: undefined });
      return;
    }

    store.setProcessing({ status: "done", abortController: undefined });
    store.setInfo(warningsAll.length ? `处理完成（LLM）。过滤/告警：${warningsAll.slice(0, 2).join("；")}${warningsAll.length > 2 ? `…（共 ${warningsAll.length} 条）` : ""}` : "处理完成（LLM）");
  } catch (e: any) {
    if (abortController.signal.aborted) {
      store.setProcessing({ status: "stopped", abortController: undefined });
      return;
    }
    store.setProcessing({ status: "error", abortController: undefined });
    store.setError(String(e?.message ?? e));
  }
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

