import React, { useMemo, useState } from "react";
import { useAppStore } from "../state/store";
import { allEntityTypes, allRelationTypes } from "../lib/schema/defaultSchema";
import { openaiTestConnectivity } from "../lib/llm/openai";
import { anthropicTestConnectivity } from "../lib/llm/anthropic";
import { geminiTestConnectivity } from "../lib/llm/gemini";

export function SettingsPanel() {
  const schema = useAppStore((s) => s.schema);
  const llm = useAppStore((s) => s.llm);
  const processing = useAppStore((s) => s.processing);
  const [testing, setTesting] = useState(false);
  const [testMsg, setTestMsg] = useState<string | null>(null);

  const disabled = processing.status !== "idle" && processing.status !== "done" && processing.status !== "stopped" && processing.status !== "error";

  const selectedEntitySet = useMemo(() => new Set(schema.entityTypes), [schema.entityTypes]);
  const selectedRelSet = useMemo(() => new Set(schema.relationTypes), [schema.relationTypes]);

  async function testConnectivity() {
    setTesting(true);
    setTestMsg(null);
    const ac = new AbortController();
    try {
      const baseUrl = llm.baseUrl.trim();
      const apiKey = llm.apiKey.trim();
      if (!baseUrl || !apiKey) {
        setTestMsg("请先填写 Base URL 与 API Key");
        return;
      }
      const result =
        llm.protocol === "openai"
          ? await openaiTestConnectivity({ baseUrl, apiKey, model: llm.model, signal: ac.signal })
          : llm.protocol === "anthropic"
            ? await anthropicTestConnectivity({ baseUrl, apiKey, model: llm.model, signal: ac.signal })
            : await geminiTestConnectivity({ baseUrl, apiKey, model: llm.model, signal: ac.signal });

      setTestMsg(result.ok ? `OK: ${result.message}` : `FAIL: ${result.message}${result.detail ? `\n${result.detail}` : ""}`);
    } finally {
      setTesting(false);
    }
  }

  return (
    <div className="card">
      <div className="h1">实体/关系自定义 + LLM 配置（可选）</div>
      <div className="muted">
        你可以从“实体/关系总集合”中勾选需要抽取的类型。LLM 模式会根据上下文决定具体语义；未启用 LLM 时使用本地启发式抽取。
        <br />
        注意：浏览器直连第三方 LLM 可能遇到 CORS/Key 暴露风险（本工具不存储 Key）。
      </div>

      <div className="label">实体（Entities）</div>
      <div className="row">
        {allEntityTypes.map((t) => (
          <label key={t} className="pill" style={{ cursor: "pointer" }}>
            <input
              type="checkbox"
              checked={selectedEntitySet.has(t)}
              onChange={(e) => {
                const next = new Set(schema.entityTypes);
                if (e.target.checked) next.add(t);
                else next.delete(t);
                useAppStore.getState().setSchema({ entityTypes: [...next.values()] });
              }}
              disabled={disabled}
              style={{ marginRight: 6 }}
            />
            {t}
          </label>
        ))}
      </div>

      <div className="label">关系（Relations）</div>
      <div className="row">
        {allRelationTypes.map((t) => (
          <label key={t} className="pill" style={{ cursor: "pointer" }}>
            <input
              type="checkbox"
              checked={selectedRelSet.has(t)}
              onChange={(e) => {
                const next = new Set(schema.relationTypes);
                if (e.target.checked) next.add(t);
                else next.delete(t);
                useAppStore.getState().setSchema({ relationTypes: [...next.values()] });
              }}
              disabled={disabled}
              style={{ marginRight: 6 }}
            />
            {t}
          </label>
        ))}
      </div>

      <div className="label">用户自定义说明（可选，会进入 LLM 提示词）</div>
      <textarea
        className="input"
        value={schema.notes ?? ""}
        onChange={(e) => useAppStore.getState().setSchema({ notes: e.target.value })}
        disabled={disabled}
        placeholder="例如：将“结论”仅用于最终章节；将“DerivedFrom”用于公式推导链..."
      />

      <div className="label">启用 LLM（可选）</div>
      <label className="pill" style={{ cursor: "pointer" }}>
        <input
          type="checkbox"
          checked={llm.enabled}
          onChange={(e) => useAppStore.getState().setLlm({ enabled: e.target.checked })}
          disabled={disabled}
          style={{ marginRight: 6 }}
        />
        使用 LLM 抽取（否则启发式）
      </label>

      {llm.enabled ? (
        <>
          <div className="label">协议（openai / claude / gemini）</div>
          <select
            className="input"
            value={llm.protocol}
            onChange={(e) => {
              const protocol = e.target.value as any;
              const defaults =
                protocol === "openai"
                  ? { baseUrl: "https://api.openai.com/v1", model: "gpt-5" }
                  : protocol === "anthropic"
                    ? { baseUrl: "https://api.anthropic.com", model: "claude-3-5-sonnet-latest" }
                    : { baseUrl: "https://generativelanguage.googleapis.com", model: "gemini-1.5-pro" };
              useAppStore.getState().setLlm({ protocol, ...defaults });
            }}
            disabled={disabled}
          >
            <option value="openai">openai</option>
            <option value="anthropic">claude (anthropic)</option>
            <option value="gemini">gemini</option>
          </select>

          <div className="label">Base URL</div>
          <input
            className="input mono"
            value={llm.baseUrl}
            onChange={(e) => useAppStore.getState().setLlm({ baseUrl: e.target.value })}
            disabled={disabled}
            placeholder="例如 https://api.openai.com/v1"
          />

          <div className="label">Model</div>
          <input
            className="input mono"
            value={llm.model}
            onChange={(e) => useAppStore.getState().setLlm({ model: e.target.value })}
            disabled={disabled}
            placeholder="例如 gpt-5 / claude-... / gemini-..."
          />

          <div className="label">API Key</div>
          <input
            className="input mono"
            value={llm.apiKey}
            onChange={(e) => useAppStore.getState().setLlm({ apiKey: e.target.value })}
            disabled={disabled}
            placeholder="仅保存在你的浏览器内存中（刷新会丢失）"
          />

          <div className="row" style={{ marginTop: 10 }}>
            <div style={{ flex: 1, minWidth: 160 }}>
              <div className="label">temperature</div>
              <input
                className="input mono"
                type="number"
                step={0.05}
                min={0}
                max={2}
                value={llm.temperature}
                onChange={(e) => useAppStore.getState().setLlm({ temperature: Number(e.target.value) })}
                disabled={disabled}
              />
            </div>
            <div style={{ flex: 1, minWidth: 160 }}>
              <div className="label">top_p</div>
              <input
                className="input mono"
                type="number"
                step={0.05}
                min={0}
                max={1}
                value={llm.topP}
                onChange={(e) => useAppStore.getState().setLlm({ topP: Number(e.target.value) })}
                disabled={disabled}
              />
            </div>
          </div>

          <div className="row" style={{ marginTop: 12 }}>
            <button className="btn ok" onClick={testConnectivity} disabled={testing || disabled}>
              {testing ? "测试中..." : "连通性测试"}
            </button>
          </div>
          {testMsg ? (
            <>
              <div className="label">测试结果</div>
              <textarea className="input mono" value={testMsg} readOnly />
            </>
          ) : null}
        </>
      ) : null}
    </div>
  );
}

