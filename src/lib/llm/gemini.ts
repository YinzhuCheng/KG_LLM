import { LlmExtractResult, LlmTestResult } from "./types";

// Gemini API: baseUrl typically https://generativelanguage.googleapis.com
export async function geminiTestConnectivity(args: {
  baseUrl: string;
  apiKey: string;
  model: string;
  signal?: AbortSignal;
}): Promise<LlmTestResult> {
  try {
    const url = `${args.baseUrl.replace(/\/$/, "")}/v1beta/models?key=${encodeURIComponent(args.apiKey)}`;
    const res = await fetch(url, { method: "GET", signal: args.signal });
    if (!res.ok) return { ok: false, message: `HTTP ${res.status}`, detail: await safeText(res) };
    return { ok: true, message: "连接成功（已获取 models 列表）" };
  } catch (e: any) {
    return { ok: false, message: "连接失败（可能是 CORS / Key / 网络）", detail: String(e?.message ?? e) };
  }
}

export async function geminiExtract(args: {
  baseUrl: string;
  apiKey: string;
  model: string;
  prompt: string;
  temperature: number;
  topP: number;
  maxTokens: number;
  signal?: AbortSignal;
}): Promise<LlmExtractResult> {
  // model form: "models/gemini-1.5-pro" OR "gemini-1.5-pro" (normalize)
  const modelPath = args.model.startsWith("models/") ? args.model : `models/${args.model}`;
  const url = `${args.baseUrl.replace(/\/$/, "")}/v1beta/${modelPath}:generateContent?key=${encodeURIComponent(args.apiKey)}`;

  const body = {
    contents: [{ role: "user", parts: [{ text: args.prompt }] }],
    generationConfig: {
      temperature: args.temperature,
      topP: args.topP,
      maxOutputTokens: args.maxTokens,
      responseMimeType: "application/json"
    }
  };

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal: args.signal
  });
  if (!res.ok) {
    throw new Error(`Gemini HTTP ${res.status}: ${await safeText(res)}`);
  }
  const json: any = await res.json();
  const text = extractGeminiText(json);
  const parsed = JSON.parse(text);
  return { ...(parsed as any), rawText: text };
}

function extractGeminiText(json: any) {
  const t = json?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (typeof t === "string") return t;
  return JSON.stringify(json);
}

async function safeText(res: Response) {
  try {
    return await res.text();
  } catch {
    return "";
  }
}

