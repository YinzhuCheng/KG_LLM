import React, { useEffect, useMemo, useRef, useState } from "react";
import { typesetMathJax } from "../lib/mathjax/mathjax";

type Props = {
  latex: string;
  mode?: "auto" | "display";
};

export function MathJaxBlock({ latex, mode = "auto" }: Props) {
  const ref = useRef<HTMLDivElement | null>(null);
  const [error, setError] = useState<string | null>(null);

  const text = useMemo(() => {
    const src = (latex ?? "").trim();
    if (!src) return "";
    if (mode === "display") {
      // avoid double-wrapping
      if (/^\$\$[\s\S]*\$\$$/.test(src) || /^\\\[[\s\S]*\\\]$/.test(src)) return src;
      return `$$\n${src}\n$$`;
    }
    return src;
  }, [latex, mode]);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    setError(null);

    // Put raw TeX into DOM for MathJax to typeset
    el.textContent = text;
    // typeset async
    void (async () => {
      try {
        await typesetMathJax(el);
      } catch (e: any) {
        setError(String(e?.message ?? e));
      }
    })();
  }, [text]);

  return (
    <div>
      <div
        ref={ref}
        style={{
          padding: 10,
          borderRadius: 10,
          border: "1px solid rgba(255,255,255,0.12)",
          background: "rgba(255,255,255,0.04)",
          overflowX: "auto"
        }}
      />
      {error ? (
        <div className="muted" style={{ marginTop: 6, color: "rgba(255,107,107,0.95)" }}>
          MathJax 渲染失败：{error}
        </div>
      ) : null}
    </div>
  );
}

