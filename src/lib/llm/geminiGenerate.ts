import { LlmProtocol } from "../../state/store";

export async function geminiGenerateText(args: {
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

