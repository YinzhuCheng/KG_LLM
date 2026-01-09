import { LlmConfig } from "../../state/store";
import { llmGenerateJson } from "../llm/generate";

export async function repairLatexForMathJax(args: { llm: LlmConfig; original: string; signal?: AbortSignal }) {
  const prompt = `
你是一个 “MathJax v3 LaTeX 修复器”。给你一段可能无法被 MathJax v3 正确渲染的 LaTeX，请在**不改变数学含义**的前提下，将其改写为尽可能可渲染的版本。

要求：
- 只做必要的最小改动（例如：补全左右定界符、替换不支持的命令、避免未闭合括号、把 \\begin{aligned} 放到数学模式内等）。
- 不得编造内容，不得扩写推导。
- 输出必须是严格 JSON：{"content":"..."}，不要 markdown，不要解释。

输入 LaTeX：
${args.original}
`.trim();

  const obj = await llmGenerateJson({
    protocol: args.llm.protocol,
    baseUrl: args.llm.baseUrl,
    apiKey: args.llm.apiKey,
    model: args.llm.model,
    temperature: 0.0,
    topP: 1.0,
    maxTokens: Math.max(256, Math.floor(args.llm.maxTokens || 2000)),
    prompt,
    signal: args.signal
  });

  const content = typeof obj?.content === "string" ? obj.content : null;
  if (!content) throw new Error("修复失败：LLM 未返回 {content:string}");
  return content;
}

