import { AppGraph } from "../graph/types";
import { UserSchemaSelection, LlmConfig } from "../../state/store";

export type SnapshotMeta = {
  id: string;
  createdAt: number;
  nodes: number;
  edges: number;
  note?: string;
};

export type SnapshotData = SnapshotMeta & {
  graph: AppGraph;
  schema: UserSchemaSelection;
  view: { showExamples: boolean; showExercises: boolean; showIsolated: boolean };
  llm: Omit<LlmConfig, "apiKey"> & { apiKey?: string };
};

const INDEX_KEY = "latexkg:snapshots:index";
const SNAP_PREFIX = "latexkg:snapshot:";

export function listSnapshots(): SnapshotMeta[] {
  const ids = readIndex();
  const metas: SnapshotMeta[] = [];
  for (const id of ids) {
    const raw = localStorage.getItem(SNAP_PREFIX + id);
    if (!raw) continue;
    try {
      const obj = JSON.parse(raw);
      if (obj && typeof obj.id === "string" && typeof obj.createdAt === "number") {
        metas.push({ id: obj.id, createdAt: obj.createdAt, nodes: obj.nodes ?? 0, edges: obj.edges ?? 0, note: obj.note });
      }
    } catch {
      // ignore
    }
  }
  // newest first
  metas.sort((a, b) => b.createdAt - a.createdAt);
  return metas;
}

export function loadSnapshot(id: string): SnapshotData {
  const raw = localStorage.getItem(SNAP_PREFIX + id);
  if (!raw) throw new Error("缓存点不存在");
  const obj = JSON.parse(raw);
  if (!obj?.graph?.nodes || !obj?.graph?.edges) throw new Error("缓存点格式不正确");
  return obj as SnapshotData;
}

export function saveSnapshot(data: { graph: AppGraph; schema: UserSchemaSelection; view: SnapshotData["view"]; llm: LlmConfig; note?: string }) {
  const id = makeId();
  const createdAt = Date.now();
  const snapshot: SnapshotData = {
    id,
    createdAt,
    nodes: data.graph.nodes.length,
    edges: data.graph.edges.length,
    note: data.note,
    graph: data.graph,
    schema: data.schema,
    view: data.view,
    llm: stripApiKey(data.llm)
  };
  localStorage.setItem(SNAP_PREFIX + id, JSON.stringify(snapshot));
  const ids = readIndex();
  ids.push(id);
  localStorage.setItem(INDEX_KEY, JSON.stringify(ids));
  return id;
}

export function deleteAllSnapshots() {
  const ids = readIndex();
  for (const id of ids) localStorage.removeItem(SNAP_PREFIX + id);
  localStorage.removeItem(INDEX_KEY);
}

export function deleteHistoryExceptLatest() {
  const metas = listSnapshots();
  if (metas.length <= 1) return;
  const keepId = metas[0].id;
  for (const m of metas.slice(1)) localStorage.removeItem(SNAP_PREFIX + m.id);
  localStorage.setItem(INDEX_KEY, JSON.stringify([keepId]));
}

function readIndex(): string[] {
  const raw = localStorage.getItem(INDEX_KEY);
  if (!raw) return [];
  try {
    const arr = JSON.parse(raw);
    if (Array.isArray(arr)) return arr.filter((x) => typeof x === "string");
  } catch {
    // ignore
  }
  return [];
}

function makeId() {
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function stripApiKey(llm: LlmConfig) {
  const { apiKey, ...rest } = llm;
  return rest;
}

