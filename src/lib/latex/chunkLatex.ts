import { stripLatexComments } from "./stripLatexComments";

export type LatexChunk = {
  id: string;
  file: string;
  title: string;
  sectionPath: string[];
  text: string;
};

type ChunkOptions = {
  maxChars?: number;
};

const SECTION_RE = /^\\(section|subsection|subsubsection)\*?\{(.+?)\}\s*$/m;

export function chunkLatex(files: { path: string; content: string }[], opts: ChunkOptions = {}): LatexChunk[] {
  const maxChars = opts.maxChars ?? 6000;
  const chunks: LatexChunk[] = [];

  // Merge all files but keep boundaries as pseudo sections
  const sorted = [...files].sort((a, b) => a.path.localeCompare(b.path));
  for (const file of sorted) {
    const cleaned = stripLatexComments(file.content);
    const lines = cleaned.split("\n");
    let sectionPath: string[] = [`${file.path}`];
    let buf: string[] = [];
    let currentTitle = file.path;

    const flush = () => {
      const text = buf.join("\n").trim();
      if (!text) return;
      const id = makeChunkId(file.path, chunks.length);
      chunks.push({ id, file: file.path, title: currentTitle, sectionPath: [...sectionPath], text });
      buf = [];
    };

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const m = line.match(SECTION_RE);
      if (m) {
        flush();
        const level = m[1]; // section/subsection/subsubsection
        const title = normalizeTitle(m[2]);
        sectionPath = updateSectionPath(sectionPath, level, title, file.path);
        currentTitle = sectionPath.slice(-1)[0] ?? title;
        buf.push(line);
        continue;
      }

      buf.push(line);
      if (buf.join("\n").length > maxChars) flush();
    }
    flush();
  }

  // Post-split very large chunks by blank lines
  return splitLargeByParagraph(chunks, maxChars);
}

function makeChunkId(file: string, idx: number) {
  return `chunk:${file}:${idx}`;
}

function normalizeTitle(s: string) {
  return s.replace(/\s+/g, " ").trim();
}

function updateSectionPath(prev: string[], level: string, title: string, file: string) {
  // prev[0] is filename marker
  const base = prev.length ? [prev[0]] : [file];
  const rest = prev.slice(1);
  const depth = level === "section" ? 1 : level === "subsection" ? 2 : 3;
  const next = rest.slice(0, depth - 1);
  next.push(title);
  return [...base, ...next];
}

function splitLargeByParagraph(chunks: LatexChunk[], maxChars: number) {
  const out: LatexChunk[] = [];
  for (const ch of chunks) {
    if (ch.text.length <= maxChars) {
      out.push(ch);
      continue;
    }
    const parts = ch.text.split(/\n\s*\n+/);
    let buf = "";
    let partIdx = 0;
    for (const p of parts) {
      const next = (buf ? `${buf}\n\n${p}` : p).trim();
      if (next.length > maxChars && buf) {
        out.push({ ...ch, id: `${ch.id}:p${partIdx++}`, text: buf.trim() });
        buf = p;
      } else {
        buf = next;
      }
    }
    if (buf.trim()) out.push({ ...ch, id: `${ch.id}:p${partIdx++}`, text: buf.trim() });
  }
  return out;
}

