import React, { useState } from "react";
import { useAppStore } from "../state/store";
import { exportGraphJson, exportGraphOwlXml, exportGraphTurtle } from "../lib/io/exporters";
import { importGraphJson, importGraphTurtle } from "../lib/io/importers";

type Props = { onAfterImport?: () => void };

export function ExportImportPanel({ onAfterImport }: Props) {
  const graph = useAppStore((s) => s.graph);
  const [importMsg, setImportMsg] = useState<string | null>(null);

  function download(filename: string, content: string, mime = "application/octet-stream") {
    const blob = new Blob([content], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
  }

  async function onImport(file: File) {
    setImportMsg(null);
    try {
      const text = await file.text();
      let g = null as any;
      if (file.name.toLowerCase().endsWith(".json")) {
        g = importGraphJson(text);
      } else if (file.name.toLowerCase().endsWith(".ttl") || file.name.toLowerCase().endsWith(".turtle")) {
        g = await importGraphTurtle(text);
      } else {
        throw new Error("仅支持导入 .json 与 .ttl(turtle)");
      }
      useAppStore.getState().setGraph(g);
      useAppStore.getState().setInfo(`已导入图谱：nodes=${g.nodes.length}, edges=${g.edges.length}`);
      setImportMsg("导入成功");
      onAfterImport?.();
    } catch (e: any) {
      const msg = String(e?.message ?? e);
      setImportMsg(`导入失败：${msg}`);
      useAppStore.getState().setError(msg);
    }
  }

  return (
    <div className="card">
      <div className="h1">导出 / 导入 图谱</div>
      <div className="muted">导出支持 JSON / RDF(Turtle) / OWL(RDF/XML)。导入支持 JSON / Turtle。</div>

      <div className="row" style={{ marginTop: 10 }}>
        <button className="btn" onClick={() => download("graph.json", exportGraphJson(graph), "application/json")}>
          下载 JSON
        </button>
        <button
          className="btn"
          onClick={async () => download("graph.ttl", await exportGraphTurtle(graph), "text/turtle")}
        >
          下载 RDF(TTL)
        </button>
        <button className="btn" onClick={() => download("graph.owl.xml", exportGraphOwlXml(graph), "application/rdf+xml")}>
          下载 OWL
        </button>
      </div>

      <div className="label">上传本地图谱文件进行可视化（.json / .ttl）</div>
      <input
        className="input"
        type="file"
        accept=".json,.ttl,.turtle,application/json,text/turtle"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) void onImport(f);
        }}
      />
      {importMsg ? (
        <div className="muted" style={{ marginTop: 8 }}>
          {importMsg}
        </div>
      ) : null}
    </div>
  );
}

