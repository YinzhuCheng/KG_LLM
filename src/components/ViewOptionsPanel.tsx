import React from "react";
import { useAppStore } from "../state/store";

export function ViewOptionsPanel() {
  const view = useAppStore((s) => s.view);

  return (
    <div className="card">
      <div className="h1">显示选项</div>
      <div className="muted">仅影响可视化显示，不会修改图谱数据本身。</div>

      <div className="label">节点类型</div>
      <div className="row">
        <label className="pill" style={{ cursor: "pointer" }}>
          <input
            type="checkbox"
            checked={view.showExamples}
            onChange={(e) => useAppStore.getState().setView({ showExamples: e.target.checked })}
            style={{ marginRight: 6 }}
          />
          显示例题（Example）
        </label>
        <label className="pill" style={{ cursor: "pointer" }}>
          <input
            type="checkbox"
            checked={view.showExercises}
            onChange={(e) => useAppStore.getState().setView({ showExercises: e.target.checked })}
            style={{ marginRight: 6 }}
          />
          显示习题（Exercise）
        </label>
      </div>

      <div className="label">布局/过滤</div>
      <div className="row">
        <label className="pill" style={{ cursor: "pointer" }}>
          <input
            type="checkbox"
            checked={view.showIsolated}
            onChange={(e) => useAppStore.getState().setView({ showIsolated: e.target.checked })}
            style={{ marginRight: 6 }}
          />
          显示孤立节点（无任何边）
        </label>
      </div>
    </div>
  );
}

