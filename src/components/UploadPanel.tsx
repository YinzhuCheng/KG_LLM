import React, { useMemo, useState } from "react";
import { useAppStore } from "../state/store";
import { readUploads } from "../lib/upload/readUploads";
import { chunkLatex } from "../lib/latex/chunkLatex";
import { runIncrementalExtraction } from "../lib/process/incrementalProcess";

export function UploadPanel() {
  const latexFiles = useAppStore((s) => s.latexFiles);
  const processing = useAppStore((s) => s.processing);
  const schema = useAppStore((s) => s.schema);
  const llm = useAppStore((s) => s.llm);

  const [localWarn, setLocalWarn] = useState<string[]>([]);
  const [maxChars, setMaxChars] = useState(6000);

  const disabled = processing.status !== "idle" && processing.status !== "done" && processing.status !== "stopped" && processing.status !== "error";

  const fileSummary = useMemo(() => {
    const tex = latexFiles.length;
    return `已加载 .tex: ${tex}`;
  }, [latexFiles.length]);

  async function onFilesPicked(fileList: FileList | null) {
    if (!fileList) return;
    useAppStore.getState().setError(null);
    useAppStore.getState().setInfo(null);

    const files = Array.from(fileList);
    const { latexFiles, assets, warnings } = await readUploads({ files });
    setLocalWarn(warnings);
    useAppStore.getState().setLatexFiles(latexFiles);
    useAppStore.getState().setAssets(assets);
    useAppStore.getState().setInfo(`已加载 ${latexFiles.length} 个 .tex 文件，图片 ${Object.keys(assets).length} 个`);
  }

  async function start() {
    const s = useAppStore.getState();
    if (!s.latexFiles.length) {
      s.setError("请先上传 .tex 文档（可含 zip/文件夹）");
      return;
    }
    s.setProcessing({ status: "chunking", totalChunks: 0, doneChunks: 0 });
    const chunks = chunkLatex(s.latexFiles, { maxChars });
    s.setInfo(`切分完成：${chunks.length} 段（maxChars=${maxChars}）`);
    await runIncrementalExtraction({ chunks, schema: s.schema, llm: s.llm });
  }

  return (
    <div className="card">
      <div className="h1">上传 LaTeX（支持文件夹 / zip / 多文件）</div>
      <div className="muted">
        方式 1：上传 zip（包含 .tex 与图片文件夹）；
        方式 2：选择文件夹上传（会保留路径）；
        方式 3：直接上传多个文件。
      </div>

      <div className="label">上传（zip / 多文件）</div>
      <input className="input" type="file" multiple onChange={(e) => onFilesPicked(e.target.files)} disabled={disabled} />

      <div className="label">上传（文件夹）</div>
      <input
        className="input"
        type="file"
        multiple
        webkitdirectory="true"
        directory="true"
        onChange={(e) => onFilesPicked(e.target.files)}
        disabled={disabled}
      />

      <div className="label">切分参数：每段最大字符数（增量处理）</div>
      <input
        className="input mono"
        type="number"
        min={1500}
        step={500}
        value={maxChars}
        onChange={(e) => setMaxChars(Number(e.target.value))}
        disabled={disabled}
      />

      <div className="muted" style={{ marginTop: 8 }}>
        {fileSummary}
      </div>

      {localWarn.length ? (
        <div className="muted" style={{ marginTop: 8 }}>
          <b>提示</b>：
          <ul style={{ margin: "6px 0 0 18px" }}>
            {localWarn.slice(0, 6).map((w, i) => (
              <li key={i}>{w}</li>
            ))}
            {localWarn.length > 6 ? <li>... 还有 {localWarn.length - 6} 条</li> : null}
          </ul>
        </div>
      ) : null}

      <div className="row" style={{ marginTop: 12 }}>
        <button className="btn primary" onClick={start} disabled={disabled}>
          切分并开始抽取
        </button>
        <button className="btn danger" onClick={() => useAppStore.getState().stopProcessing()} disabled={processing.status === "idle"}>
          停止
        </button>
      </div>

      <div className="muted" style={{ marginTop: 8 }}>
        当前段：<span className="mono">{processing.currentChunkTitle ?? "-"}</span>
      </div>
    </div>
  );
}

