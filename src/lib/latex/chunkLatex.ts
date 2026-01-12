import { stripLatexComments } from "./stripLatexComments";

export type LatexChunk = {
  id: string;
  file: string;
  title: string;
  sectionPath: string[];
  text: string;
};

export type ChunkGranularity = "file" | "chapter" | "section" | "subsection" | "subsubsection" | "paragraph";

type ChunkOptions = {
  granularity?: ChunkGranularity;
  /**
   * Only used as a fallback: if a single granularity chunk is too large,
   * split it with a 50% overlap sliding window (approx tokens).
   */
  maxTokens?: number;
};

const HEADING_RE = /^\\(chapter|section|subsection|subsubsection|paragraph|subparagraph)\*?\{(.+?)\}\s*$/m;

export function chunkLatex(files: { path: string; content: string }[], opts: ChunkOptions = {}): LatexChunk[] {
  const granularity: ChunkGranularity = opts.granularity ?? "section";
  const maxTokens = typeof opts.maxTokens === "number" && opts.maxTokens > 0 ? Math.floor(opts.maxTokens) : null;
  const chunks: LatexChunk[] = [];

  // Merge all files but keep boundaries as pseudo sections
  const sorted = [...files].sort((a, b) => a.path.localeCompare(b.path));
  for (const file of sorted) {
    const cleaned = stripLatexComments(file.content);
    const lines = cleaned.split("\n");
    let headingStack: Array<{ level: number; title: string }> = [];
    let buf: string[] = [];
    let currentKey: string | null = null;
    let currentTitle = file.path;
    let currentPath: string[] = [`${file.path}`];

    const flush = () => {
      const text = buf.join("\n").trim();
      if (!text) return;
      const id = makeChunkId(file.path, chunks.length);
      chunks.push({ id, file: file.path, title: currentTitle, sectionPath: [...currentPath], text });
      buf = [];
    };

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const m = line.match(HEADING_RE);
      if (m) {
        // Heading starts a (possibly new) granularity bucket: flush previous bucket first.
        const level = toHeadingLevel(m[1] ?? "");
        const title = normalizeTitle(m[2]);
        headingStack = updateHeadingStack(headingStack, level, title);
        const keyInfo = getGranularityKey({ file: file.path, headingStack, granularity });
        const nextKey = keyInfo.key;
        if (currentKey !== null && nextKey !== currentKey) flush();
        currentKey = nextKey;
        currentTitle = keyInfo.title;
        currentPath = keyInfo.sectionPath;
        buf.push(line);
        continue;
      }

      const keyInfo = getGranularityKey({ file: file.path, headingStack, granularity });
      const nextKey = keyInfo.key;
      if (currentKey !== null && nextKey !== currentKey) flush();
      currentKey = nextKey;
      currentTitle = keyInfo.title;
      currentPath = keyInfo.sectionPath;
      buf.push(line);
    }
    flush();
  }

  // Fallback: only when a single granularity chunk exceeds maxTokens => split with 50% overlap sliding window.
  if (!maxTokens) return chunks;
  return splitOversizeBySlidingWindow(chunks, maxTokens);
}

function makeChunkId(file: string, idx: number) {
  return `chunk:${file}:${idx}`;
}

function normalizeTitle(s: string) {
  return s.replace(/\s+/g, " ").trim();
}

function toHeadingLevel(cmd: string) {
  const c = cmd.toLowerCase();
  // Keep a simple order. subparagraph is treated as paragraph (rarely useful for chunking).
  if (c === "chapter") return 1;
  if (c === "section") return 2;
  if (c === "subsection") return 3;
  if (c === "subsubsection") return 4;
  if (c === "paragraph" || c === "subparagraph") return 5;
  return 5;
}

function granularityToLevel(g: ChunkGranularity) {
  if (g === "file") return 0;
  if (g === "chapter") return 1;
  if (g === "section") return 2;
  if (g === "subsection") return 3;
  if (g === "subsubsection") return 4;
  return 5; // paragraph
}

function updateHeadingStack(stack: Array<{ level: number; title: string }>, level: number, title: string) {
  const next = [...stack];
  while (next.length && next[next.length - 1]!.level >= level) next.pop();
  next.push({ level, title });
  return next;
}

function getGranularityKey(args: { file: string; headingStack: Array<{ level: number; title: string }>; granularity: ChunkGranularity }) {
  const desired = granularityToLevel(args.granularity);
  const stack = args.headingStack;

  if (desired === 0) {
    return { key: `file:${args.file}`, title: args.file, sectionPath: [args.file] };
  }

  // If the desired level does not exist (e.g. want subsection but this section has no subsection),
  // fall back to the nearest higher-level heading (closest smaller level).
  let chosen = stack.find((h) => h.level === desired) ?? null;
  if (!chosen) {
    for (let i = stack.length - 1; i >= 0; i--) {
      const h = stack[i]!;
      if (h.level < desired) {
        chosen = h;
        break;
      }
    }
  }

  const chosenLevel = chosen?.level ?? 0;
  const chosenTitle = chosen?.title ?? args.file;
  const path = [args.file, ...stack.filter((h) => h.level <= chosenLevel).map((h) => h.title)];
  const key = `g:${args.file}:${chosenLevel}:${path.slice(1).join(" / ")}`;
  return { key, title: chosenTitle, sectionPath: path };
}

export function previewChunkTitles(files: { path: string; content: string }[], granularity: ChunkGranularity, maxPreview = 10) {
  const chunks = chunkLatex(files, { granularity });
  const titles: string[] = [];
  const seen = new Set<string>();
  for (const ch of chunks) {
    const t = ch.sectionPath.slice(1).join(" / ") || ch.title;
    if (!seen.has(t)) {
      seen.add(t);
      titles.push(t);
    }
    if (titles.length >= maxPreview) break;
  }
  return { totalChunks: chunks.length, previewTitles: titles };
}

function splitOversizeBySlidingWindow(chunks: LatexChunk[], maxTokens: number) {
  const out: LatexChunk[] = [];
  const stride = Math.max(1, Math.floor(maxTokens / 2)); // 50% overlap
  for (const ch of chunks) {
    const toks = approxTokenSpans(ch.text);
    if (toks.length <= maxTokens) {
      out.push(ch);
      continue;
    }
    let w = 0;
    for (let start = 0; start < toks.length; start += stride) {
      const end = Math.min(toks.length, start + maxTokens);
      const sliceStart = toks[start]?.start ?? 0;
      const sliceEnd = toks[end - 1]?.end ?? ch.text.length;
      const text = ch.text.slice(sliceStart, sliceEnd).trim();
      if (!text) continue;
      out.push({ ...ch, id: `${ch.id}:w${w++}`, text });
      if (end >= toks.length) break;
    }
  }
  return out;
}

function approxTokenSpans(text: string) {
  // Approx “token” spans that preserve original substrings.
  // - LaTeX commands: \alpha, \frac
  // - Latin words / numbers
  // - CJK single chars
  // - Non-whitespace single chars (punctuation, braces, etc.)
  const re = /\\[a-zA-Z]+|[a-zA-Z0-9_]+|[\u4e00-\u9fff]|[^\s]/g;
  const spans: Array<{ start: number; end: number }> = [];
  for (const m of text.matchAll(re)) {
    const idx = (m as any).index as number | undefined;
    if (typeof idx !== "number") continue;
    const s = idx;
    const e = idx + (m[0]?.length ?? 0);
    if (e > s) spans.push({ start: s, end: e });
  }
  return spans;
}

