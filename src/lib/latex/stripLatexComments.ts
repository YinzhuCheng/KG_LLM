export function stripLatexComments(src: string) {
  // Remove comments but keep escaped \%
  // This is a best-effort heuristic; LaTeX comment rules are complex (verbatim, etc.).
  return src
    .split("\n")
    .map((line) => {
      let out = "";
      let escaped = false;
      for (let i = 0; i < line.length; i++) {
        const ch = line[i];
        if (escaped) {
          out += ch;
          escaped = false;
          continue;
        }
        if (ch === "\\") {
          out += ch;
          escaped = true;
          continue;
        }
        if (ch === "%") break;
        out += ch;
      }
      return out;
    })
    .join("\n");
}

