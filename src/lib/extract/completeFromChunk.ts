import { GraphNode } from "../graph/types";

export function completeNodeLatexFromChunk(nodes: GraphNode[], chunkText: string) {
  const updates: { id: string; patch: Partial<GraphNode> }[] = [];

  for (const n of nodes) {
    const label = extractLabel(n);
    const content = (n.content ?? "").trim();
    const needsCompletion = containsEllipsis(content) || content.length < 20 || !content;

    if (label && needsCompletion) {
      const full = extractBlockByLabel(chunkText, label);
      if (full) {
        updates.push({
          id: n.id,
          patch: {
            content: full,
            title: normalizeTitleIfBad(n, label)
          }
        });
        continue;
      }
    }

    // best-effort: if LLM returned content with ellipsis, try to recover exact substring from chunk
    if (!label && containsEllipsis(content)) {
      const recovered = recoverByPrefixSuffix(chunkText, content);
      if (recovered) {
        updates.push({
          id: n.id,
          patch: {
            content: recovered
          }
        });
      }
    }
  }

  return updates;
}

function extractLabel(n: GraphNode) {
  if (typeof n.source?.latexLabel === "string" && n.source.latexLabel.trim()) return n.source.latexLabel.trim();
  if (n.id.startsWith("tex:")) return n.id.slice("tex:".length);
  return null;
}

function containsEllipsis(s: string) {
  return s.includes("...") || s.includes("…") || /略/.test(s);
}

function normalizeTitleIfBad(n: GraphNode, label: string) {
  // If title looks like a narrative sentence and label exists, prefer a stable label-based title.
  const title = (n.title ?? "").trim();
  const looksNarrative = title.length >= 8 && /[\u4e00-\u9fff]/.test(title) && !/(\(|\)|\\|=|\$|_|\^)/.test(title);
  if (n.type === "Formula" && (looksNarrative || !title.includes(label))) return `Formula (${label})`;
  return n.title;
}

function extractBlockByLabel(chunkText: string, label: string) {
  // 1) theorem-like env blocks
  const envs = ["theorem", "lemma", "corollary", "definition", "example", "exercise", "axiom", "proposition", "conclusion"];
  for (const env of envs) {
    const re = new RegExp(String.raw`\\begin\{${env}\}([\s\S]*?)\\end\{${env}\}`, "gi");
    for (const m of chunkText.matchAll(re)) {
      const body = (m[1] ?? "").trim();
      if (new RegExp(String.raw`\\label\{${escapeReg(label)}\}`).test(body)) return body;
    }
  }

  // 2) equation/align blocks
  const mathEnvs = ["equation", "equation\\*", "align", "align\\*", "gather", "gather\\*", "multline", "multline\\*"];
  for (const env of mathEnvs) {
    const re = new RegExp(String.raw`\\begin\{${env}\}([\s\S]*?)\\end\{${env}\}`, "gi");
    for (const m of chunkText.matchAll(re)) {
      const body = (m[1] ?? "").trim();
      if (new RegExp(String.raw`\\label\{${escapeReg(label)}\}`).test(body)) return body;
    }
  }

  // 3) fallback: search around the label command (best-effort)
  const idx = chunkText.indexOf(`\\label{${label}}`);
  if (idx >= 0) {
    const start = Math.max(0, idx - 4000);
    const end = Math.min(chunkText.length, idx + 4000);
    return chunkText.slice(start, end).trim();
  }
  return null;
}

function escapeReg(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function recoverByPrefixSuffix(chunkText: string, content: string) {
  // Accept "..." or "…" as a placeholder; try to find the shortest substring that matches.
  const marker = content.includes("…") ? "…" : "...";
  const parts = content.split(marker);
  if (parts.length < 2) return null;
  const prefix = parts[0].trim();
  const suffix = parts[parts.length - 1].trim();
  if (prefix.length < 10 || suffix.length < 10) return null;

  const startIdx = chunkText.indexOf(prefix);
  if (startIdx < 0) return null;
  const searchFrom = startIdx + prefix.length;
  const endIdx = chunkText.indexOf(suffix, searchFrom);
  if (endIdx < 0) return null;
  const recovered = chunkText.slice(startIdx, endIdx + suffix.length).trim();
  // avoid returning massive slices
  if (recovered.length > 60000) return null;
  return recovered;
}

