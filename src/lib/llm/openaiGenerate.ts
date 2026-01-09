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
  const url = `${args.baseUrl.replace(/\/$/, "")}/responses`;
  const body = {
    model: args.model,
    input: args.prompt,
    temperature: args.temperature,
    top_p: args.topP,
    max_output_tokens: args.maxTokens,
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
  return JSON.parse(text);
}

function extractOpenAIResponseText(json: any) {
  if (typeof json?.output_text === "string") return json.output_text;
  const out = json?.output?.[0]?.content?.[0]?.text;
  if (typeof out === "string") return out;
  return JSON.stringify(json);
}

async function safeText(res: Response) {
  try {
    return await res.text();
  } catch {
    return "";
  }
}

