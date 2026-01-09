import React, { useMemo, useRef } from "react";
import { UploadPanel } from "./components/UploadPanel";
import { SettingsPanel } from "./components/SettingsPanel";
import { ExportImportPanel } from "./components/ExportImportPanel";
import { GraphView } from "./components/GraphView";
import { useAppStore } from "./state/store";
import { buildCytoscapeElements } from "./lib/graph/buildCytoscapeElements";

export function App() {
  const graph = useAppStore((s) => s.graph);
  const processing = useAppStore((s) => s.processing);
  const lastError = useAppStore((s) => s.lastError);
  const lastInfo = useAppStore((s) => s.lastInfo);
  const cytoElements = useMemo(() => buildCytoscapeElements(graph), [graph]);
  const graphApiRef = useRef<{ fit: () => void; center: () => void } | null>(null);

  return (
    <div className="app">
      <aside className="sidebar">
        <div className="card">
          <div className="h1">LaTeX → 知识图谱（全前端 / Cloudflare Pages）</div>
          <div className="muted">
            上传 LaTeX（可含图片文件夹/zip），按章节切分增量抽取实体/关系并实时渲染。可选接入 GPT-5 等多协议 LLM，
            或使用本地启发式抽取（无需任何 API）。
          </div>
        </div>

        <UploadPanel />
        <SettingsPanel />
        <ExportImportPanel onAfterImport={() => graphApiRef.current?.fit()} />
      </aside>

      <main className="main">
        <div className="topbar">
          <div className="statusbar">
            <span className={`pill ${processing.status === "idle" ? "" : "ok"}`}>
              状态: <span className="mono">{processing.status}</span>
            </span>
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

