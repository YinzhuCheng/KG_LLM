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
  signal?: AbortSignal;
}): Promise<LlmExtractResult> {
  const url = `${args.baseUrl.replace(/\/$/, "")}/responses`;
  const body = {
    model: args.model,
    input: args.prompt,
    temperature: args.temperature,
    top_p: args.topP,
    // Encourage JSON-only output
    response_format: { type: "json_object" }
  };

  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${args.apiKey}`
    },
    body: JSON.stringify(body),
    signal: args.signal
  });
  if (!res.ok) {
    throw new Error(`OpenAI HTTP ${res.status}: ${await safeText(res)}`);
  }
  const json: any = await res.json();
  const text = extractOpenAIResponseText(json);
  const parsed = JSON.parse(text);
  return { ...(parsed as any), rawText: text };
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

async function safeText(res: Response) {
  try {
    return await res.text();
  } catch {
    return "";
  }
}

