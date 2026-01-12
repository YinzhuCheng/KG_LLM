import { EntityType, GraphNode } from "../graph/types";
import { LlmConfig } from "../../state/store";
import { llmGenerateJson } from "../llm/generate";

type AlignDecision = {
  alias: string;
  canonical: string;
  confidence: number; // 0..1
  reason?: string;
};

const PHASE1_ENTITY_TYPES: EntityType[] = ["Definition", "Notation", "Construction"];

export async function alignConceptsWithLlm(args: {
  llm: LlmConfig;
  nodes: GraphNode[];
  signal?: AbortSignal;
  batchSize?: number;
}) {
  const useLlm = args.llm.enabled && args.llm.apiKey.trim().length > 0;
  if (!useLlm) return { aliasToCanonical: new Map<string, string>(), decisions: [] as AlignDecision[] };

  const phase1 = args.nodes.filter((n) => PHASE1_ENTITY_TYPES.includes(n.type));
  if (!phase1.length) return { aliasToCanonical: new Map<string, string>(), decisions: [] as AlignDecision[] };

  // Strong rule: latexLabel implies canonical tex:<label>. Do this outside LLM.
  const aliasToCanonical = new Map<string, string>();
  for (const n of phase1) {
    const label = typeof n.source?.latexLabel === "string" ? n.source.latexLabel : null;
    if (label) aliasToCanonical.set(n.id, `tex:${label}`);
  }

  const batchSize = Math.max(20, Math.min(120, Math.floor(args.batchSize ?? 80)));
  const decisions: AlignDecision[] = [];

  // Only ask LLM about unlabeled candidates; keep cards compact.
  const unlabeled = phase1.filter((n) => !(typeof n.source?.latexLabel === "string") && !n.id.startsWith("tex:"));
  const cards = unlabeled.map((n) => ({
    id: n.id,
    type: n.type,
    title: n.title,
    section: (n.source?.sectionPath ?? []).slice(-2).join(" / "),
    evidence: compactEvidence(n.content ?? "")
  }));

  for (let i = 0; i < cards.length; i += batchSize) {
    const batch = cards.slice(i, i + batchSize);
    if (!batch.length) continue;
    const prompt = buildAlignPrompt(batch);
    const json: any = await llmGenerateJson({
      protocol: args.llm.protocol,
      baseUrl: args.llm.baseUrl,
      apiKey: args.llm.apiKey,
      model: args.llm.model,
      temperature: 0.0,
      topP: 1.0,
      maxTokens: Math.max(800, Math.min(4000, Math.floor(args.llm.maxTokens / 10) || 2000)),
      prompt,
      signal: args.signal
    });

    const arr = Array.isArray(json?.decisions) ? json.decisions : [];
    for (const d of arr) {
      if (!d || typeof d.alias !== "string" || typeof d.canonical !== "string") continue;
      const confidence = typeof d.confidence === "number" ? d.confidence : 0;
      const alias = d.alias.trim();
      const canonical = d.canonical.trim();
      if (!alias || !canonical) continue;
      if (alias === canonical) continue;
      if (confidence < 0.88) continue; // conservative to avoid false merges
      // Only allow mapping within this batch set.
      if (!batch.find((x) => x.id === alias)) continue;
      if (!batch.find((x) => x.id === canonical)) continue;
      aliasToCanonical.set(alias, canonical);
      decisions.push({ alias, canonical, confidence, reason: typeof d.reason === "string" ? d.reason : undefined });
    }
  }

  return { aliasToCanonical, decisions };
}

function compactEvidence(s: string) {
  const t = (s ?? "").replace(/\s+/g, " ").trim();
  if (!t) return "";
  // Keep evidence short to minimize tokens.
  return t.length <= 180 ? t : t.slice(0, 180);
}

function buildAlignPrompt(cards: Array<{ id: string; type: string; title: string; section: string; evidence: string }>) {
  return `
你是一个“数学概念对齐器（非常保守）”。你的任务：在同一批候选概念中找出**确认为同一数学概念**的别名，并给出 alias->canonical 映射。

重要原则：
- **宁可不合并，也不要误合并**。若不确定，请不输出该映射。
- 只在**同一概念**（同一对象/定义/记号约定）时合并；仅仅“相关/相似/同领域”绝对不能合并。
- canonical 必须从本批 cards 的 id 中选择。
- 输出的每条映射需要给出 0..1 的置信度；低于 0.88 不要输出。

输入 cards（每条包含 id/type/title/section/evidence）：
${cards
  .map(
    (c) =>
      `- id: ${c.id}\n  type: ${c.type}\n  title: ${c.title}\n  section: ${c.section}\n  evidence: ${c.evidence || "(none)"}`
  )
  .join("\n")}

输出严格 JSON（不要 markdown，不要解释）：
{
  "decisions": [
    { "alias": "id", "canonical": "id", "confidence": 0.0, "reason": "一句话原因（可选）" }
  ]
}
`.trim();
}

