import React, { useMemo, useState } from "react";
import { useAppStore } from "../state/store";
import { readUploads } from "../lib/upload/readUploads";
import { chunkLatex, previewChunkTitles, type ChunkGranularity } from "../lib/latex/chunkLatex";
import { runIncrementalExtraction } from "../lib/process/incrementalProcess";

export function UploadPanel() {
  const latexFiles = useAppStore((s) => s.latexFiles);
  const processing = useAppStore((s) => s.processing);
  const schema = useAppStore((s) => s.schema);
  const llm = useAppStore((s) => s.llm);

  const [localWarn, setLocalWarn] = useState<string[]>([]);
  const [granularity, setGranularity] = useState<ChunkGranularity>("section");
  const [maxChunkTokens, setMaxChunkTokens] = useState(12000);

  const disabled = processing.status !== "idle" && processing.status !== "done" && processing.status !== "stopped" && processing.status !== "error";

  const fileSummary = useMemo(() => {
    const tex = latexFiles.length;
    return `已加载 .tex: ${tex}`;
  }, [latexFiles.length]);

  const chunkPreview = useMemo(() => {
    if (!latexFiles.length) return null;
    try {
      return previewChunkTitles(latexFiles, granularity, 10);
    } catch {
      return null;
    }
  }, [latexFiles, granularity]);

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
    const chunks = chunkLatex(s.latexFiles, { granularity, maxTokens: maxChunkTokens });
    s.setInfo(`切分完成：${chunks.length} 段（粒度=${granularity}${maxChunkTokens ? `, maxTokens=${maxChunkTokens}（超长才滑窗 50% 重叠）` : ""}）`);
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

      <div className="label">切分粒度（按章节层级）</div>
      <select className="input" value={granularity} onChange={(e) => setGranularity(e.target.value as ChunkGranularity)} disabled={disabled}>
        <option value="file">file（每个文件一段）</option>
        <option value="chapter">chapter</option>
        <option value="section">section</option>
        <option value="subsection">subsection（没有 subsection 的 section 会回退到 section）</option>
        <option value="subsubsection">subsubsection（缺失会回退）</option>
        <option value="paragraph">paragraph（缺失会回退）</option>
      </select>

      <div className="label">超长兜底：单段 maxTokens（仅当某段超过该值才启用 50% 重叠滑窗）</div>
      <input
        className="input mono"
        type="number"
        min={512}
        step={256}
        value={maxChunkTokens}
        onChange={(e) => setMaxChunkTokens(Number(e.target.value))}
        disabled={disabled}
      />
      <div className="muted" style={{ marginTop: 6 }}>
        建议按你模型的上下文上限设置；这里是“分块输入”预算，不等同于 LLM 的输出 max_tokens。
      </div>

      {chunkPreview ? (
        <div className="muted" style={{ marginTop: 8 }}>
          该粒度下预计 <b>{chunkPreview.totalChunks}</b> 段。{chunkPreview.previewTitles.length ? "示例标题：" : null}
          {chunkPreview.previewTitles.length ? (
            <ul style={{ margin: "6px 0 0 18px" }}>
              {chunkPreview.previewTitles.map((t, i) => (
                <li key={i}>{t}</li>
              ))}
              {chunkPreview.totalChunks > chunkPreview.previewTitles.length ? <li>…（仅展示前 {chunkPreview.previewTitles.length} 条）</li> : null}
            </ul>
          ) : null}
        </div>
      ) : null}

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
            {localWarn.length > 6 ? <li>还有 {localWarn.length - 6} 条（为避免刷屏未全部展示）</li> : null}
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

