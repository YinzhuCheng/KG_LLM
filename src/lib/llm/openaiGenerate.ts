import { LlmProtocol } from "../../state/store";

export async function openaiGenerateJson(args: {
  protocol: LlmProtocol;
  baseUrl: string;
  apiKey: string;
  model: string;
  temperature: number;
  topP: number;
  maxTokens: number;
  prompt: string;
  signal?: AbortSignal;
}) {
  const base = args.baseUrl.replace(/\/$/, "");
  // try responses, then fallback to chat completions
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
    return JSON.parse(text);
  } catch {
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
    return JSON.parse(text);
  }
}

function extractOpenAIResponseText(json: any) {
  if (typeof json?.output_text === "string") return json.output_text;
  const out = json?.output?.[0]?.content?.[0]?.text;
  if (typeof out === "string") return out;
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
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${truncate(raw, 500)}`);
  if (looksLikeHtml(raw)) throw new Error(`返回了 HTML 而不是 JSON；前 120 字符：${truncate(raw, 120)}`);
  return JSON.parse(raw);
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

