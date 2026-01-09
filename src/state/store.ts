import { create } from "zustand";
import { AppGraph, EntityType, GraphEdge, GraphNode, RelationType } from "../lib/graph/types";
import { defaultEntityTypes, defaultRelationTypes } from "../lib/schema/defaultSchema";

type ProcessingStatus = "idle" | "parsing" | "chunking" | "extracting" | "merging" | "done" | "stopped" | "error";

export type LlmProtocol = "openai" | "anthropic" | "gemini";

export type LlmConfig = {
  enabled: boolean;
  protocol: LlmProtocol;
  baseUrl: string;
  model: string;
  apiKey: string;
  temperature: number;
  topP: number;
  maxTokens: number;
  parallelism: number;
};

export type UserSchemaSelection = {
  entityTypes: EntityType[];
  relationTypes: RelationType[];
  notes?: string;
};

type AppState = {
  graph: AppGraph;
  assets: Record<string, string>; // filename -> objectURL
  latexFiles: { path: string; content: string }[];

  schema: UserSchemaSelection;
  llm: LlmConfig;

  processing: {
    status: ProcessingStatus;
    totalChunks: number;
    doneChunks: number;
    currentChunkTitle?: string;
    abortController?: AbortController;
  };

  lastError: string | null;
  lastInfo: string | null;

  setInfo: (msg: string | null) => void;
  setError: (msg: string | null) => void;

  setSchema: (patch: Partial<UserSchemaSelection>) => void;
  setLlm: (patch: Partial<LlmConfig>) => void;

  setLatexFiles: (files: { path: string; content: string }[]) => void;
  setAssets: (assets: Record<string, string>) => void;

  setGraph: (graph: AppGraph) => void;
  mergeGraph: (patch: { nodes?: GraphNode[]; edges?: GraphEdge[] }) => void;
  updateNode: (id: string, patch: Partial<GraphNode>) => void;
  updateNodes: (updates: { id: string; patch: Partial<GraphNode> }[]) => void;

  setProcessing: (patch: Partial<AppState["processing"]>) => void;
  stopProcessing: () => void;

  resetAll: () => void;
};

const emptyGraph: AppGraph = { nodes: [], edges: [] };

export const useAppStore = create<AppState>((set, get) => ({
  graph: emptyGraph,
  assets: {},
  latexFiles: [],
  schema: { entityTypes: defaultEntityTypes, relationTypes: defaultRelationTypes, notes: "" },
  llm: {
    enabled: false,
    protocol: "openai",
    baseUrl: "https://api.openai.com/v1",
    model: "gpt-5",
    apiKey: "",
    temperature: 0.2,
    topP: 0.9,
    maxTokens: 100000,
    parallelism: 4
  },
  processing: { status: "idle", totalChunks: 0, doneChunks: 0 },
  lastError: null,
  lastInfo: null,

  setInfo: (msg) => set({ lastInfo: msg }),
  setError: (msg) => set({ lastError: msg }),

  setSchema: (patch) => set({ schema: { ...get().schema, ...patch } }),
  setLlm: (patch) => set({ llm: { ...get().llm, ...patch } }),

  setLatexFiles: (files) => set({ latexFiles: files }),
  setAssets: (assets) => set({ assets }),

  setGraph: (graph) => set({ graph }),
  mergeGraph: (patch) =>
    set((s) => ({
      graph: {
        nodes: patch.nodes ? mergeNodes(s.graph.nodes, patch.nodes) : s.graph.nodes,
        edges: patch.edges ? mergeEdges(s.graph.edges, patch.edges) : s.graph.edges
      }
    })),

  updateNode: (id, patch) =>
    set((s) => ({
      graph: { ...s.graph, nodes: s.graph.nodes.map((n) => (n.id === id ? { ...n, ...patch, meta: { ...n.meta, ...(patch as any).meta } } : n)) }
    })),

  updateNodes: (updates) =>
    set((s) => {
      const map = new Map(updates.map((u) => [u.id, u.patch] as const));
      return {
        graph: {
          ...s.graph,
          nodes: s.graph.nodes.map((n) => {
            const p = map.get(n.id);
            if (!p) return n;
            return { ...n, ...p, meta: { ...n.meta, ...(p as any).meta } };
          })
        }
      };
    }),

  setProcessing: (patch) => set({ processing: { ...get().processing, ...patch } }),
  stopProcessing: () => {
    const ac = get().processing.abortController;
    if (ac) ac.abort();
    set({ processing: { ...get().processing, status: "stopped", abortController: undefined } });
  },

  resetAll: () => {
    // revoke existing object URLs
    const assets = get().assets;
    for (const url of Object.values(assets)) URL.revokeObjectURL(url);
    set({
      graph: emptyGraph,
      assets: {},
      latexFiles: [],
      processing: { status: "idle", totalChunks: 0, doneChunks: 0 },
      lastError: null,
      lastInfo: null
    });
  }
}));

function mergeNodes(existing: GraphNode[], incoming: GraphNode[]) {
  const map = new Map(existing.map((n) => [n.id, n]));
  for (const n of incoming) {
    const prev = map.get(n.id);
    map.set(n.id, prev ? { ...prev, ...n, meta: { ...prev.meta, ...n.meta } } : n);
  }
  return [...map.values()];
}

function mergeEdges(existing: GraphEdge[], incoming: GraphEdge[]) {
  const key = (e: GraphEdge) => `${e.source}::${e.type}::${e.target}${e.meta?.chunkId ? `::${e.meta.chunkId}` : ""}`;
  const map = new Map(existing.map((e) => [key(e), e]));
  for (const e of incoming) {
    const k = key(e);
    const prev = map.get(k);
    map.set(k, prev ? { ...prev, ...e, meta: { ...prev.meta, ...e.meta } } : e);
  }
  return [...map.values()];
}

