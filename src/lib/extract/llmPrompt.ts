import { EntityType, RelationType } from "../graph/types";
import { LatexChunk } from "../latex/chunkLatex";

export function buildExtractionPrompt(args: {
  chunk: LatexChunk;
  selectedEntities: EntityType[];
  selectedRelations: RelationType[];
  graphSummary: string;
  userNotes?: string;
  phase?: 1 | 2;
  frozenNamespace?: boolean;
  conceptRegistrySummary?: string;
}) {
  const { chunk, selectedEntities, selectedRelations, graphSummary, userNotes } = args;
  const phase = args.phase ?? 0;
  const frozenNamespace = Boolean(args.frozenNamespace);
  const conceptRegistrySummary = (args.conceptRegistrySummary ?? "").trim();
  return `
你是一个“LaTeX 数学知识图谱抽取器”。从给定 LaTeX 片段中抽取实体与关系，输出严格 JSON（不要 markdown，不要解释）。

## 实体集合（仅可使用下列类型）
${selectedEntities.map((t) => `- ${t}`).join("\n")}

## 关系集合（仅可使用下列类型）
${selectedRelations.map((t) => `- ${t}`).join("\n")}

${phase === 1 ? `## Phase 1 — Sequential（Build the universe）
- **只抽取**：Definitions / Notations / Basic constructions（对应本次实体集合中出现的相关类型）
- **严格要求**：命名必须稳定可复用；优先复用已有 id（见“概念注册表”与“现有图谱摘要”），不要为同一概念创建多个不同 id。
` : phase === 2 ? `## Phase 2 — Parallel（Extract the rest）
- 抽取除基础概念之外的其他实体与关系；基础概念应尽量通过 **引用已存在 id** 来连接。
${frozenNamespace ? "- **命名空间已冻结**：若某概念已在注册表/摘要中出现，必须复用其 id；不要新建同义节点。" : ""}
` : ""}

${conceptRegistrySummary ? `## 概念注册表（全局，优先复用 id）
${conceptRegistrySummary}
` : ""}

## 目标
- 尽量识别：定理/引理/推论/定义/公式/例题/习题/公理/命题/结论（名称、编号、label、关键公式）
- 关系：证明、依赖、推导自、包含、等价、适用、使用、辅助
- 允许“跨段落引用”：利用 \\label / \\ref / \\eqref 等把关系连起来

## 重要约束（防止“为了有话可说”而编造）
- **不得编造实体或关系**：只能抽取 LaTeX 片段中明确出现的内容（环境、公式块、显式陈述），不要凭常识补全。
- **Formula 节点只能来自明确的数学公式块**：例如 equation/align/\\[ \\]/$$ $$ 等；不要把自然语言句子（如“预计授课节数范围”“习题数量增加比例”）当作 Formula。
- title 必须短且可追溯：优先使用编号/label/环境标题；不要生成“总结式标题”来替代原文。
- **不得使用省略号**：不要输出 "..." 或 "…" 或 “略”等占位符。content 必须尽可能完整保留原始 LaTeX（在本段内能截取到的就完整截取）。
- **例题/习题与解答必须在同一节点**：若例题/习题包含“解答/答案/步骤”，把它们放在该节点的 content 中（可用明显分隔），不要为解答/答案单独创建节点。
- **不要从例题/习题母体中拆分出 trivial 子节点**：除非该公式/定理/定义具有独立 label/编号并在其他地方被引用，否则优先保留在例题/习题节点内容中，不要额外创建节点。

## 现有图谱摘要（用于跨段落连接）
${graphSummary}

${userNotes?.trim() ? `## 用户自定义说明\n${userNotes.trim()}\n` : ""}

## 本段上下文
- chunk_id: ${chunk.id}
- file: ${chunk.file}
- section_path: ${chunk.sectionPath.join(" / ")}
- title: ${chunk.title}

## LaTeX 片段
${chunk.text}

## 输出 JSON 规范（必须严格遵守）
输出一个对象，包含 nodes 与 edges：
{
  "nodes": [
    {
      "id": "string (稳定且唯一；优先用 tex:<label>；没有 label 用 chunk:<chunkId>:<type>:<idx>)",
      "type": "EntityType",
      "title": "短标题/编号/名称",
      "content": "可选，但强烈建议提供，并尽可能完整保留 LaTeX 原文（不要省略）。Formula 必须包含可渲染的公式原文或明确的 math delimiter。",
      "source": { "file": "string", "latexLabel": "string|null", "sectionPath": ["..."] },
      "meta": { "chunkId": "string", "confidence": 0.0 }
    }
  ],
  "edges": [
    {
      "type": "RelationType",
      "source": "node.id",
      "target": "node.id",
      "evidence": "可选：原文证据（尽量短）",
      "meta": { "chunkId": "string", "confidence": 0.0 }
    }
  ]
}

约束：
- 只能输出 JSON（无前后缀、无注释、无 markdown）。
- nodes[].type 必须属于实体集合；edges[].type 必须属于关系集合。
- edges 的 source/target 必须指向 nodes 中的 id，或指向已存在图谱摘要中出现过的 id（若引用已存在节点，请不要重复创建同 id 节点，除非补充 title/content/source）。
`.trim();
}

