import React, { useMemo, useRef } from "react";
import { UploadPanel } from "./components/UploadPanel";
import { SettingsPanel } from "./components/SettingsPanel";
import { ExportImportPanel } from "./components/ExportImportPanel";
import { GraphView } from "./components/GraphView";
import { ViewOptionsPanel } from "./components/ViewOptionsPanel";
import { CachePanel } from "./components/CachePanel";
import { useAppStore } from "./state/store";
import { buildCytoscapeElements } from "./lib/graph/buildCytoscapeElements";
import { filterGraphView } from "./lib/graph/filterGraphView";

export function App() {
  const graph = useAppStore((s) => s.graph);
  const view = useAppStore((s) => s.view);
  const processing = useAppStore((s) => s.processing);
  const lastError = useAppStore((s) => s.lastError);
  const lastInfo = useAppStore((s) => s.lastInfo);
  const filteredGraph = useMemo(() => filterGraphView(graph, view), [graph, view]);
  const cytoElements = useMemo(() => buildCytoscapeElements(filteredGraph), [filteredGraph]);
  const graphApiRef = useRef<{ fit: () => void; center: () => void } | null>(null);

  return (
    <div className="app">
      <aside className="sidebar">
        <div className="card">
          <div className="h1">LaTeX → 知识图谱（全前端 / Cloudflare Pages）</div>
          <div className="muted">
            上传 LaTeX zip（包含 .tex 与图片），按章节切分增量抽取实体/关系并实时渲染。LLM 为必选（浏览器直连）。
          </div>
        </div>

        <UploadPanel />
        <SettingsPanel />
        <ViewOptionsPanel />
        <ExportImportPanel onAfterImport={() => graphApiRef.current?.fit()} />
        <CachePanel />
      </aside>

      <main className="main">
        <div className="topbar">
          <div className="statusbar">
            <span className={`pill ${processing.status === "idle" ? "" : "ok"}`}>
              状态: <span className="mono">{processing.status}</span>
            </span>
            {processing.stage ? (
              <span className="pill ok">
                阶段: <span className="mono">{processing.stage}</span>
                {processing.stageDetail ? <span className="mono"> · {processing.stageDetail}</span> : null}
              </span>
            ) : null}
            <span className="pill">
              节点: <span className="mono">{graph.nodes.length}</span>
            </span>
            <span className="pill">
              边: <span className="mono">{graph.edges.length}</span>
            </span>
            {processing.status !== "idle" ? (
              <span className="pill ok">
                进度: <span className="mono">{processing.doneChunks}</span> /{" "}
                <span className="mono">{processing.totalChunks}</span>
              </span>
            ) : null}
            {processing.currentChunkTitle ? (
              <span className="pill">
                当前: <span className="mono">{processing.currentChunkTitle}</span>
              </span>
            ) : null}
            {typeof processing.stageNodes === "number" && typeof processing.stageEdges === "number" ? (
              <span className="pill">
                阶段成果: <span className="mono">{processing.stageNodes}</span> nodes /{" "}
                <span className="mono">{processing.stageEdges}</span> edges
              </span>
            ) : null}
            {lastError ? (
              <span className="pill bad">
                错误: <span className="mono">{lastError}</span>
              </span>
            ) : lastInfo ? (
              <span className="pill ok">
                提示: <span className="mono">{lastInfo}</span>
              </span>
            ) : null}
          </div>
          <div className="row">
            <button className="btn" onClick={() => graphApiRef.current?.fit()}>
              Fit
            </button>
            <button className="btn" onClick={() => graphApiRef.current?.center()}>
              Center
            </button>
            <button className="btn danger" onClick={() => useAppStore.getState().resetAll()}>
              清空
            </button>
          </div>
        </div>

        <div className="graphWrap">
          <GraphView elements={cytoElements} apiRef={graphApiRef} />
        </div>
      </main>
    </div>
  );
}

