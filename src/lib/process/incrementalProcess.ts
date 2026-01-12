import { EntityType, RelationType } from "../graph/types";
import { LatexChunk } from "../latex/chunkLatex";
import { heuristicExtractFromChunk } from "../extract/heuristicExtract";
import { llmExtractFromChunk } from "../extract/llmExtract";
import { LlmConfig, UserSchemaSelection } from "../../state/store";
import { useAppStore } from "../../state/store";
import { saveSnapshot } from "../cache/snapshots";

const PHASE1_ENTITY_TYPES: EntityType[] = ["Definition", "Notation", "Construction"];

export async function runIncrementalExtraction(args: {
  chunks: LatexChunk[];
  schema: UserSchemaSelection;
  llm: LlmConfig;
}) {
  const store = useAppStore.getState();
  store.setError(null);
  store.setInfo(null);
  const useLlm = args.llm.enabled && args.llm.apiKey.trim().length > 0;
  const total = useLlm ? args.chunks.length * 2 : args.chunks.length;
  store.setProcessing({ status: "extracting", totalChunks: total, doneChunks: 0 });

  const abortController = new AbortController();
  store.setProcessing({ abortController });

  // label index for cross-chunk linking (works for both heuristic and LLM, if ids use tex:<label>)
  const knownLabelToNodeId = new Map<string, string>();
  for (const n of store.graph.nodes) {
    const label = typeof n.source?.latexLabel === "string" ? n.source.latexLabel : null;
    if (label) knownLabelToNodeId.set(label, n.id);
  }

  try {
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

    // LLM mode: two-phase extraction
    const warningsAll: string[] = [];

    const summarizeConceptRegistry = () => {
      const g = useAppStore.getState().graph;
      const nodes = g.nodes.filter((n) => PHASE1_ENTITY_TYPES.includes(n.type)).slice(0, 220);
      if (!nodes.length) return "";
      const lines = nodes.map((n) => {
        const label = typeof n.source?.latexLabel === "string" ? ` label=${n.source.latexLabel}` : "";
        return `- ${n.id} | ${n.type} | ${n.title}${label}`;
      });
      return [`concepts(${g.nodes.filter((n) => PHASE1_ENTITY_TYPES.includes(n.type)).length}) showing ${nodes.length}:`, ...lines].join("\n");
    };

    // Phase 1 — sequential (strict single-thread)
    for (let i = 0; i < args.chunks.length; i++) {
      if (abortController.signal.aborted) {
        store.setProcessing({ status: "stopped", abortController: undefined });
        return;
      }

      const chunk = args.chunks[i];
      store.setProcessing({ currentChunkTitle: `P1: ${chunk.title}` });
      const snapshotGraph = useAppStore.getState().graph;

      const phase1Entities = PHASE1_ENTITY_TYPES.filter((t) => (args.schema.entityTypes as EntityType[]).includes(t));
      const phase1Relations = (args.schema.relationTypes as RelationType[]).filter((t) => t === "EquivalentTo" || t === "DependsOn" || t === "Uses");

      const res = await llmExtractFromChunk({
        protocol: args.llm.protocol,
        baseUrl: args.llm.baseUrl,
        apiKey: args.llm.apiKey,
        model: args.llm.model,
        temperature: args.llm.temperature,
        topP: args.llm.topP,
        maxTokens: args.llm.maxTokens,
        chunk,
        selectedEntities: phase1Entities,
        selectedRelations: phase1Relations,
        graph: snapshotGraph,
        userNotes: args.schema.notes ?? "",
        signal: abortController.signal,
        phase: 1,
        frozenNamespace: false,
        conceptRegistrySummary: summarizeConceptRegistry()
      });

      for (const n of res.nodes ?? []) {
        const label = typeof (n as any)?.source?.latexLabel === "string" ? (n as any).source.latexLabel : null;
        if (label && typeof (n as any)?.id === "string") knownLabelToNodeId.set(label, (n as any).id);
      }
      if (Array.isArray(res.warnings)) warningsAll.push(...res.warnings);
      store.mergeGraph({ nodes: res.nodes as any, edges: res.edges as any });
      store.setProcessing({ doneChunks: i + 1 });
    }

    // Freeze namespace: canonicalize ids for phase-1 concepts (conservative).
    const frozen = freezeNamespace(useAppStore.getState().graph);
    store.setGraph(frozen.graph as any);

    // rebuild label index after freeze
    knownLabelToNodeId.clear();
    for (const n of store.graph.nodes) {
      const label = typeof n.source?.latexLabel === "string" ? n.source.latexLabel : null;
      if (label) knownLabelToNodeId.set(label, n.id);
    }

    // Phase 2 — bounded concurrency + ordered merge (extract remaining entities/relations)
    const concurrency = Math.max(1, Math.min(32, Math.floor(args.llm.parallelism || 1)));
    const results = new Map<number, { nodes: any[]; edges: any[]; warnings?: string[] }>();
    let nextToDispatch = 0;
    let nextToCommit = 0;
    let inFlight = 0;
    const phase2Offset = args.chunks.length;

    const phase2Entities = (args.schema.entityTypes as EntityType[]).filter((t) => !PHASE1_ENTITY_TYPES.includes(t));
    const phase2Relations = args.schema.relationTypes as RelationType[];

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
        selectedEntities: phase2Entities,
        selectedRelations: phase2Relations,
        graph: snapshotGraph,
        userNotes: args.schema.notes ?? "",
        signal: abortController.signal,
        phase: 2,
        frozenNamespace: true,
        conceptRegistrySummary: summarizeConceptRegistry()
      });
      return res;
    };

    const pump = async () => {
      while (!abortController.signal.aborted && nextToDispatch < args.chunks.length && inFlight < concurrency) {
        const idx = nextToDispatch++;
        inFlight++;
        store.setProcessing({ currentChunkTitle: `P2: ${args.chunks[idx].title}` });
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

      const ready = results.get(nextToCommit);
      if (!ready) {
        await sleep(60);
        continue;
      }

      results.delete(nextToCommit);

      // Apply frozen namespace mapping (only strong equivalences).
      const mapped = applyAliasMapping({ nodes: ready.nodes ?? [], edges: ready.edges ?? [] }, frozen.aliasToCanonical);

      for (const n of mapped.nodes ?? []) {
        const label = typeof n?.source?.latexLabel === "string" ? n.source.latexLabel : null;
        if (label && typeof n?.id === "string") knownLabelToNodeId.set(label, n.id);
      }
      if (Array.isArray(ready.warnings)) warningsAll.push(...ready.warnings);

      store.mergeGraph({ nodes: mapped.nodes as any, edges: mapped.edges as any });
      nextToCommit++;
      store.setProcessing({ doneChunks: phase2Offset + nextToCommit });

      // every 10 LLM calls (committed chunks) => snapshot
      const committedCalls = phase2Offset + nextToCommit;
      if (committedCalls % 10 === 0) {
        try {
          const s = useAppStore.getState();
          saveSnapshot({
            graph: s.graph,
            schema: s.schema,
            view: s.view,
            llm: s.llm,
            note: `auto@${committedCalls}`
          });
          s.setInfo(`已自动保存缓存点（LLM 调用累计 ${committedCalls} 次）`);
        } catch {
          // ignore cache failures (quota)
        }
      }
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

function freezeNamespace(graph: { nodes: any[]; edges: any[] }) {
  // Conservative aliasing:
  // 1) unify nodes that share the same latexLabel (prefer tex:<label>)
  // 2) unify Phase-1 concepts linked by EquivalentTo
  const nodes = Array.isArray(graph?.nodes) ? graph.nodes : [];
  const edges = Array.isArray(graph?.edges) ? graph.edges : [];

  const byId = new Map<string, any>();
  for (const n of nodes) if (n && typeof n.id === "string") byId.set(n.id, n);

  const uf = new UnionFind();
  for (const id of byId.keys()) uf.add(id);

  // latexLabel => tex:<label>
  for (const n of byId.values()) {
    const label = typeof n?.source?.latexLabel === "string" ? n.source.latexLabel : null;
    if (!label) continue;
    const canonical = `tex:${label}`;
    uf.add(canonical);
    uf.union(n.id, canonical);
  }

  // EquivalentTo among phase-1 concept types
  for (const e of edges) {
    if (!e || e.type !== "EquivalentTo" || typeof e.source !== "string" || typeof e.target !== "string") continue;
    const a = byId.get(e.source);
    const b = byId.get(e.target);
    if (!a || !b) continue;
    if (!PHASE1_ENTITY_TYPES.includes(a.type) || !PHASE1_ENTITY_TYPES.includes(b.type)) continue;
    uf.union(e.source, e.target);
  }

  // choose canonical representative (prefer tex:)
  const groups = new Map<string, string[]>();
  for (const id of uf.items()) {
    const root = uf.find(id);
    const arr = groups.get(root) ?? [];
    arr.push(id);
    groups.set(root, arr);
  }

  const aliasToCanonical = new Map<string, string>();
  for (const ids of groups.values()) {
    const existing = ids.filter((id) => byId.has(id));
    if (!existing.length) continue;
    const canonical =
      existing.find((id) => id.startsWith("tex:")) ??
      existing[0]!;
    for (const id of existing) aliasToCanonical.set(id, canonical);
  }

  const mergedNodes = new Map<string, any>();
  for (const [id, n] of byId.entries()) {
    const canon = aliasToCanonical.get(id) ?? id;
    const prev = mergedNodes.get(canon);
    mergedNodes.set(
      canon,
      prev
        ? {
            ...prev,
            ...n,
            id: canon,
            // keep richer title/content if available
            title: (prev.title?.length ?? 0) >= (n.title?.length ?? 0) ? prev.title : n.title,
            content: (prev.content?.length ?? 0) >= (n.content?.length ?? 0) ? prev.content : n.content,
            source: { ...(prev.source ?? {}), ...(n.source ?? {}) },
            meta: { ...(prev.meta ?? {}), ...(n.meta ?? {}) }
          }
        : { ...n, id: canon }
    );
  }

  const rewrite = (id: string) => aliasToCanonical.get(id) ?? id;
  const rewrittenEdges = edges
    .map((e) => ({ ...e, source: rewrite(e.source), target: rewrite(e.target) }))
    .filter((e) => typeof e.source === "string" && typeof e.target === "string" && e.source !== e.target);

  // de-dupe edges after rewrite
  const key = (e: any) => `${e.source}::${e.type}::${e.target}::${String(e.meta?.chunkId ?? "")}`;
  const edgeMap = new Map<string, any>();
  for (const e of rewrittenEdges) edgeMap.set(key(e), e);

  return { graph: { nodes: [...mergedNodes.values()], edges: [...edgeMap.values()] }, aliasToCanonical };
}

function applyAliasMapping(extracted: { nodes: any[]; edges: any[] }, aliasToCanonical: Map<string, string>) {
  const rewrite = (id: string) => aliasToCanonical.get(id) ?? id;
  const nodes = (extracted.nodes ?? []).map((n) => {
    if (!n || typeof n.id !== "string") return n;
    const label = typeof n?.source?.latexLabel === "string" ? n.source.latexLabel : null;
    const byLabel = label ? `tex:${label}` : null;
    const canon = byLabel ? rewrite(byLabel) : rewrite(n.id);
    return { ...n, id: canon };
  });
  const edges = (extracted.edges ?? [])
    .map((e) => {
      if (!e || typeof e.source !== "string" || typeof e.target !== "string") return e;
      return { ...e, source: rewrite(e.source), target: rewrite(e.target) };
    })
    .filter((e) => e && typeof e.source === "string" && typeof e.target === "string" && e.source !== e.target);
  return { nodes, edges };
}

class UnionFind {
  private parent = new Map<string, string>();
  add(x: string) {
    if (!this.parent.has(x)) this.parent.set(x, x);
  }
  items() {
    return [...this.parent.keys()];
  }
  find(x: string): string {
    const p = this.parent.get(x);
    if (!p) {
      this.parent.set(x, x);
      return x;
    }
    if (p === x) return x;
    const root = this.find(p);
    this.parent.set(x, root);
    return root;
  }
  union(a: string, b: string) {
    this.add(a);
    this.add(b);
    const ra = this.find(a);
    const rb = this.find(b);
    if (ra !== rb) this.parent.set(ra, rb);
  }
}

