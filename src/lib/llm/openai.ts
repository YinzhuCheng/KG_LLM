import { LlmExtractResult, LlmTestResult } from "./types";

export async function openaiTestConnectivity(args: {
  baseUrl: string;
  apiKey: string;
  model: string;
  signal?: AbortSignal;
}): Promise<LlmTestResult> {
  try {
    const res = await fetch(`${args.baseUrl.replace(/\/$/, "")}/models`, {
      method: "GET",
      headers: { Authorization: `Bearer ${args.apiKey}` },
      signal: args.signal
    });
    if (!res.ok) return { ok: false, message: `HTTP ${res.status}`, detail: await safeText(res) };
    return { ok: true, message: "连接成功（已获取 models 列表）" };
  } catch (e: any) {
    return { ok: false, message: "连接失败（可能是 CORS / Key / 网络）", detail: String(e?.message ?? e) };
  }
}

export async function openaiExtract(args: {
  baseUrl: string;
  apiKey: string;
  model: string;
  prompt: string;
  temperature: number;
  topP: number;
  maxTokens: number;
  signal?: AbortSignal;
}): Promise<LlmExtractResult> {
  const base = args.baseUrl.replace(/\/$/, "");

  // 1) Try Responses API first
  try {
    const url = `${base}/responses`;
    const body = {
      model: args.model,
      input: args.prompt,
      temperature: args.temperature,
      top_p: args.topP,
      max_output_tokens: args.maxTokens,
      response_format: { type: "json_object" }
    };
    const json = await postJson(url, body, {
      "Content-Type": "application/json",
      Authorization: `Bearer ${args.apiKey}`
    }, args.signal);
    const text = extractOpenAIResponseText(json);
    try {
      const parsed = JSON.parse(text);
      return { ...(parsed as any), rawText: text };
    } catch (e: any) {
      throw new Error(explainBadJson(text, e));
    }
  } catch (e: any) {
    // 2) Fallback for OpenAI-compatible gateways: Chat Completions
    const url = `${base}/chat/completions`;
    const body = {
      model: args.model,
      messages: [{ role: "user", content: args.prompt }],
      temperature: args.temperature,
      top_p: args.topP,
      max_tokens: args.maxTokens,
      response_format: { type: "json_object" }
    };
    const json = await postJson(url, body, {
      "Content-Type": "application/json",
      Authorization: `Bearer ${args.apiKey}`
    }, args.signal);
    const text = extractOpenAIChatText(json);
    try {
      const parsed = JSON.parse(text);
      return { ...(parsed as any), rawText: text };
    } catch (err: any) {
      throw new Error(explainBadJson(text, err));
    }
  }
}

function extractOpenAIResponseText(json: any) {
  // responses API: output_text convenience sometimes present
  if (typeof json?.output_text === "string") return json.output_text;
  // fallback: find message content
  const out = json?.output?.[0]?.content?.[0]?.text;
  if (typeof out === "string") return out;
  // last resort: stringify
  return JSON.stringify(json);
}

function extractOpenAIChatText(json: any) {
  const t = json?.choices?.[0]?.message?.content;
  if (typeof t === "string") return t;
  return JSON.stringify(json);
}

async function postJson(url: string, body: any, headers: Record<string, string>, signal?: AbortSignal) {
  const res = await fetch(url, { method: "POST", headers, body: JSON.stringify(body), signal });
  const raw = await safeText(res);
  if (!res.ok) {
    throw new Error(`HTTP ${res.status}: ${truncate(raw, 500)}`);
  }
  if (looksLikeHtml(raw)) {
    throw new Error(
      `返回了 HTML 而不是 JSON（多半是 baseUrl/协议不匹配，或该网关不支持该端点）。前 120 字符：${truncate(raw, 120)}`
    );
  }
  try {
    return JSON.parse(raw);
  } catch (e: any) {
    throw new Error(`响应不是有效 JSON：${String(e?.message ?? e)}；前 120 字符：${truncate(raw, 120)}`);
  }
}

function explainBadJson(text: string, err: any) {
  if (looksLikeHtml(text)) {
    return `LLM 返回了 HTML（<!DOCTYPE/...>），说明你打到的是网页/错误页而不是模型输出。请检查 protocol 与 baseUrl（例如 OpenAI 应为 https://api.openai.com/v1）。前 120 字符：${truncate(
      text,
      120
    )}`;
  }
  return `LLM 输出不是有效 JSON：${String(err?.message ?? err)}；前 200 字符：${truncate(text, 200)}`;
}

function looksLikeHtml(s: string) {
  const t = s.trim().slice(0, 200).toLowerCase();
  return t.startsWith("<!doctype") || t.startsWith("<html") || t.includes("<head") || t.includes("<body");
}

function truncate(s: string, n: number) {
  if (s.length <= n) return s;
  return s.slice(0, n);
}

async function safeText(res: Response) {
  try {
    return await res.text();
  } catch {
    return "";
  }
}

