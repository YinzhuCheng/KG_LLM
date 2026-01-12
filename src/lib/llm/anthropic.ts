import { LlmExtractResult, LlmTestResult } from "./types";

export async function anthropicTestConnectivity(args: {
  baseUrl: string;
  apiKey: string;
  model: string;
  signal?: AbortSignal;
}): Promise<LlmTestResult> {
  try {
    const res = await fetch(`${args.baseUrl.replace(/\/$/, "")}/v1/models`, {
      method: "GET",
      headers: {
        "x-api-key": args.apiKey,
        "anthropic-version": "2023-06-01"
      },
      signal: args.signal
    });
    if (!res.ok) return { ok: false, message: `HTTP ${res.status}`, detail: await safeText(res) };
    return { ok: true, message: "连接成功（已获取 models 列表）" };
  } catch (e: any) {
    return { ok: false, message: "连接失败（可能是 CORS / Key / 网络）", detail: String(e?.message ?? e) };
  }
}

export async function anthropicExtract(args: {
  baseUrl: string;
  apiKey: string;
  model: string;
  prompt: string;
  temperature: number;
  topP: number;
  maxTokens: number;
  signal?: AbortSignal;
}): Promise<LlmExtractResult> {
  const url = `${args.baseUrl.replace(/\/$/, "")}/v1/messages`;
  const body = {
    model: args.model,
    max_tokens: args.maxTokens,
    temperature: args.temperature,
    top_p: args.topP,
    messages: [{ role: "user", content: args.prompt }]
  };

  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": args.apiKey,
      "anthropic-version": "2023-06-01"
    },
    body: JSON.stringify(body),
    signal: args.signal
  });
  if (!res.ok) {
    throw new Error(`Anthropic HTTP ${res.status}: ${await safeText(res)}`);
  }
  const json: any = await res.json();
  const text = extractAnthropicText(json);
  const parsed = JSON.parse(text);
  return { ...(parsed as any), rawText: text };
}

function extractAnthropicText(json: any) {
  const blocks = json?.content;
  if (Array.isArray(blocks)) {
    const t = blocks.find((b) => b?.type === "text")?.text;
    if (typeof t === "string") return t;
  }
  if (typeof json?.text === "string") return json.text;
  return JSON.stringify(json);
}

async function safeText(res: Response) {
  try {
    return await res.text();
  } catch {
    return "";
  }
}

