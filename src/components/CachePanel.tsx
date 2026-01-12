import React, { useEffect, useState } from "react";
import { useAppStore } from "../state/store";
import { deleteAllSnapshots, deleteHistoryExceptLatest, listSnapshots, loadSnapshot } from "../lib/cache/snapshots";

export function CachePanel() {
  const [items, setItems] = useState<ReturnType<typeof listSnapshots>>([]);
  const [err, setErr] = useState<string | null>(null);

  const refresh = () => {
    try {
      setErr(null);
      setItems(listSnapshots());
    } catch (e: any) {
      setErr(String(e?.message ?? e));
    }
  };

  useEffect(() => {
    refresh();
  }, []);

  const fmt = (t: number) => new Date(t).toLocaleString();

  return (
    <div className="card">
      <div className="h1">缓存点（每 10 次 LLM 调用自动保存）</div>
      <div className="muted">
        缓存点保存在浏览器本地（localStorage）。不会互相覆盖，可随时加载恢复图谱/选项。导出文件仍然推荐用于长期保存。
      </div>

      <div className="row" style={{ marginTop: 10 }}>
        <button className="btn" onClick={refresh}>
          刷新列表
        </button>
        <button
          className="btn danger"
          onClick={() => {
            if (!window.confirm("确认清空所有缓存点？此操作不可恢复。")) return;
            deleteAllSnapshots();
            refresh();
            useAppStore.getState().setInfo("已清空所有缓存点");
          }}
        >
          一键清理缓存点（全部删除）
        </button>
        <button
          className="btn danger"
          onClick={() => {
            if (!window.confirm("确认删除历史缓存？将保留最新缓存点，其余全部删除。")) return;
            deleteHistoryExceptLatest();
            refresh();
            useAppStore.getState().setInfo("已删除历史缓存（保留最新）");
          }}
        >
          删除历史缓存（保留最新）
        </button>
      </div>

      {err ? (
        <div className="muted" style={{ marginTop: 8, color: "rgba(255,107,107,0.95)" }}>
          {err}
        </div>
      ) : null}

      <div className="label">缓存点列表</div>
      {items.length === 0 ? (
        <div className="muted">暂无缓存点（需要启用 LLM 并运行后，累计 10 次调用会自动生成）。</div>
      ) : (
        <div style={{ display: "grid", gap: 8 }}>
          {items.slice(0, 20).map((m) => (
            <div key={m.id} className="card" style={{ marginTop: 0, padding: 10, background: "rgba(255,255,255,0.04)" }}>
              <div className="row" style={{ justifyContent: "space-between", alignItems: "center" }}>
                <div className="muted">
                  <span className="mono">{fmt(m.createdAt)}</span> · nodes=<span className="mono">{m.nodes}</span> · edges=
                  <span className="mono">{m.edges}</span> {m.note ? `· ${m.note}` : ""}
                </div>
                <button
                  className="btn ok"
                  onClick={() => {
                    try {
                      const s = loadSnapshot(m.id);
                      useAppStore.getState().setGraph(s.graph);
                      useAppStore.getState().setSchema(s.schema);
                      useAppStore.getState().setView(s.view);
                      useAppStore.getState().setInfo(`已加载缓存点：${fmt(s.createdAt)}`);
                    } catch (e: any) {
                      useAppStore.getState().setError(String(e?.message ?? e));
                    }
                  }}
                >
                  加载
                </button>
              </div>
              <div className="muted mono" style={{ marginTop: 6 }}>
                id={m.id}
              </div>
            </div>
          ))}
          {items.length > 20 ? <div className="muted">列表过长，仅展示最新 20 个。</div> : null}
        </div>
      )}
    </div>
  );
}

