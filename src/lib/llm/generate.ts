import { LlmProtocol } from "../../state/store";
import { openaiGenerateJson } from "./openaiGenerate";
import { anthropicGenerateText } from "./anthropicGenerate";
import { geminiGenerateText } from "./geminiGenerate";

export async function llmGenerateJson(args: {
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
  if (args.protocol === "openai") {
    return await openaiGenerateJson(args);
  }
  const text =
    args.protocol === "anthropic"
      ? await anthropicGenerateText(args)
      : await geminiGenerateText(args);
  return JSON.parse(text);
}

