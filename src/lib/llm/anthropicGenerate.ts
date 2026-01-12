import { LlmProtocol } from "../../state/store";

export async function anthropicGenerateText(args: {
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

