import { EntityType, RelationType } from "../graph/types";
import { LatexChunk } from "../latex/chunkLatex";

export function buildExtractionPrompt(args: {
  chunk: LatexChunk;
  selectedEntities: EntityType[];
  selectedRelations: RelationType[];
  graphSummary: string;
  userNotes?: string;
}) {
  const { chunk, selectedEntities, selectedRelations, graphSummary, userNotes } = args;
  return `
你是一个“LaTeX 数学知识图谱抽取器”。从给定 LaTeX 片段中抽取实体与关系，输出严格 JSON（不要 markdown，不要解释）。

## 实体集合（仅可使用下列类型）
${selectedEntities.map((t) => `- ${t}`).join("\n")}

## 关系集合（仅可使用下列类型）
${selectedRelations.map((t) => `- ${t}`).join("\n")}

## 目标
- 尽量识别：定理/引理/推论/定义/公式/例题/习题/公理/命题/结论（名称、编号、label、关键公式）
- 关系：证明、依赖、推导自、包含、等价、适用、使用、辅助
- 允许“跨段落引用”：利用 \\label / \\ref / \\eqref 等把关系连起来

## 重要约束（防止“为了有话可说”而编造）
- **不得编造实体或关系**：只能抽取 LaTeX 片段中明确出现的内容（环境、公式块、显式陈述），不要凭常识补全。
- **Formula 节点只能来自明确的数学公式块**：例如 equation/align/\\[ \\]/$$ $$ 等；不要把自然语言句子（如“预计授课节数范围”“习题数量增加比例”）当作 Formula。
- title 必须短且可追溯：优先使用编号/label/环境标题；不要生成“总结式标题”来替代原文。

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
      "content": "可选，保留少量 LaTeX 原文片段（Formula 必须包含可渲染的公式原文或明确的 math delimiter）",
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

