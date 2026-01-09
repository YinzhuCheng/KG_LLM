import React, { useEffect, useMemo, useRef, useState } from "react";
import cytoscape, { Core } from "cytoscape";
import { useAppStore } from "../state/store";
import { MathJaxBlock } from "./MathJaxBlock";
import { repairLatexForMathJax } from "../lib/mathjax/repairWithLlm";

type Props = {
  elements: any[];
  apiRef?: React.MutableRefObject<{ fit: () => void; center: () => void } | null>;
};

export function GraphView({ elements, apiRef }: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const cyRef = useRef<Core | null>(null);
  const [selected, setSelected] = useState<any | null>(null);
  const [repairing, setRepairing] = useState(false);
  const assets = useAppStore((s) => s.assets);
  const graph = useAppStore((s) => s.graph);
  const llm = useAppStore((s) => s.llm);
  const selectedNode = selected?.id ? graph.nodes.find((n) => n.id === selected.id) : null;
  const selectedEdge = selected?.source && selected?.target ? selected : null;

  const style = useMemo(
    () =>
      [
      {
        selector: "node",
        style: {
          "background-color": "#70a4ff",
          "border-color": "rgba(255,255,255,0.25)",
          "border-width": 1,
          color: "rgba(255,255,255,0.92)",
          label: "data(label)",
          "font-size": 10,
          "text-wrap": "wrap",
          "text-max-width": 180,
          "text-outline-width": 2,
          "text-outline-color": "rgba(0,0,0,0.35)",
          "text-valign": "center",
          "text-halign": "center",
          width: "label",
          padding: "10px"
        }
      },
      {
        selector: 'node[type="Definition"]',
        style: { "background-color": "#38d39f" }
      },
      {
        selector: 'node[type="Theorem"]',
        style: { "background-color": "#ffb86b" }
      },
      {
        selector: 'node[type="Lemma"]',
        style: { "background-color": "#ffd86b" }
      },
      {
        selector: 'node[type="Formula"]',
        style: { "background-color": "#b970ff" }
      },
      {
        selector: 'node[type="Example"]',
        style: { "background-color": "#70ffd1" }
      },
      {
        selector: 'node[type="Exercise"]',
        style: { "background-color": "#ff70d1" }
      },
      {
        selector: "edge",
        style: {
          width: 2,
          "line-color": "rgba(255,255,255,0.35)",
          "target-arrow-color": "rgba(255,255,255,0.35)",
          "target-arrow-shape": "triangle",
          "curve-style": "bezier",
          label: "data(label)",
          color: "rgba(255,255,255,0.7)",
          "font-size": 9,
          "text-outline-width": 2,
          "text-outline-color": "rgba(0,0,0,0.35)",
          "text-rotation": "autorotate"
        }
      },
      {
        selector: ":selected",
        style: {
          "border-width": 3,
          "border-color": "rgba(255,255,255,0.7)",
          "line-color": "#70a4ff",
          "target-arrow-color": "#70a4ff"
        }
      }
    ] as any,
    []
  );

  useEffect(() => {
    if (!containerRef.current) return;
    if (cyRef.current) return;

    const cy = cytoscape({
      container: containerRef.current,
      elements,
      style,
      layout: { name: "cose", animate: false, fit: true, padding: 30 },
      wheelSensitivity: 0.2
    });

    cy.on("select", "node,edge", (evt) => {
      setSelected(evt.target.data());
    });
    cy.on("unselect", "node,edge", () => {
      setSelected(null);
    });

    cyRef.current = cy;
    if (apiRef) {
      apiRef.current = {
        fit: () => cy.fit(undefined, 40),
        center: () => cy.center()
      };
    }

    return () => {
      cy.destroy();
      cyRef.current = null;
    };
  }, [apiRef, elements, style]);

  useEffect(() => {
    const cy = cyRef.current;
    if (!cy) return;
    cy.batch(() => {
      cy.elements().remove();
      cy.add(elements);
    });
    cy.layout({ name: "cose", animate: false, fit: true, padding: 30 }).run();
  }, [elements]);

  return (
    <div style={{ height: "100%", display: "grid", gridTemplateColumns: "1fr 360px" }}>
      <div className="graph" ref={containerRef} />
      <div style={{ padding: 12, borderLeft: "1px solid rgba(255,255,255,0.12)", overflow: "auto" }}>
        <div className="card" style={{ marginTop: 0 }}>
          <div className="h1">详情</div>
          {selected ? (
            <>
              <div className="muted mono" style={{ marginTop: 6 }}>
                {selected.id}
              </div>
              {"type" in selected ? (
                <div className="muted" style={{ marginTop: 6 }}>
                  <b>type</b>: <span className="mono">{selectedNode?.type ?? selected.type}</span>
                </div>
              ) : null}
              {"title" in selected ? (
                <div className="muted" style={{ marginTop: 6 }}>
                  <b>title</b>: {selectedNode?.title ?? selected.title}
                </div>
              ) : null}
              {selectedNode?.content ? (
                <>
                  <div className="label">MathJax 渲染（尽可能可读）</div>
                  <MathJaxBlock latex={String(selectedNode.content)} mode={selectedNode.type === "Formula" ? "display" : "auto"} />

                  {(selectedNode.type === "Example" || selectedNode.type === "Exercise") &&
                  (typeof (selectedNode.meta as any)?.problem === "string" ||
                    typeof (selectedNode.meta as any)?.solution === "string" ||
                    typeof (selectedNode.meta as any)?.answer === "string") ? (
                    <>
                      <div className="label">结构化展示（同一节点内）</div>
                      {typeof (selectedNode.meta as any)?.problem === "string" && (selectedNode.meta as any).problem.trim() ? (
                        <>
                          <div className="muted" style={{ marginTop: 6 }}>
                            <b>题面</b>
                          </div>
                          <MathJaxBlock latex={String((selectedNode.meta as any).problem)} mode="auto" />
                        </>
                      ) : null}
                      {typeof (selectedNode.meta as any)?.solution === "string" && (selectedNode.meta as any).solution.trim() ? (
                        <>
                          <div className="muted" style={{ marginTop: 10 }}>
                            <b>解答/步骤</b>
                          </div>
                          <MathJaxBlock latex={String((selectedNode.meta as any).solution)} mode="auto" />
                        </>
                      ) : null}
                      {typeof (selectedNode.meta as any)?.answer === "string" && (selectedNode.meta as any).answer.trim() ? (
                        <>
                          <div className="muted" style={{ marginTop: 10 }}>
                            <b>答案</b>
                          </div>
                          <MathJaxBlock latex={String((selectedNode.meta as any).answer)} mode="auto" />
                        </>
                      ) : null}
                    </>
                  ) : null}

                  <div className="row" style={{ marginTop: 10 }}>
                    <button
                      className="btn ok"
                      disabled={repairing || !llm.enabled || !llm.apiKey.trim()}
                      onClick={async () => {
                        const node = graph.nodes.find((n) => n.id === selected.id);
                        if (!node?.content) return;
                        setRepairing(true);
                        try {
                          const original = node.content;
                          const fixed = await repairLatexForMathJax({ llm, original });
                          useAppStore.getState().updateNode(node.id, {
                            content: fixed,
                            meta: { ...(node.meta ?? {}), originalContent: (node.meta as any)?.originalContent ?? original, mathjaxFixed: true }
                          });
                          useAppStore.getState().setInfo("已校正当前节点（MathJax 友好）");
                        } catch (e: any) {
                          useAppStore.getState().setError(String(e?.message ?? e));
                        } finally {
                          setRepairing(false);
                        }
                      }}
                    >
                      {repairing ? "校正中..." : "MathJax 渲染校正（当前节点 / LLM）"}
                    </button>
                    <button
                      className="btn"
                      disabled={repairing}
                      onClick={() => {
                        const node = graph.nodes.find((n) => n.id === selected.id);
                        const original = (node?.meta as any)?.originalContent;
                        if (node && typeof original === "string") {
                          useAppStore.getState().updateNode(node.id, { content: original, meta: { ...(node.meta ?? {}), mathjaxFixed: false } });
                          useAppStore.getState().setInfo("已恢复原始 LaTeX");
                        }
                      }}
                    >
                      恢复原文
                    </button>
                  </div>

                  <div className="label">原始 content（LaTeX）</div>
                  <textarea className="input mono" value={selectedNode.content} readOnly />
                </>
              ) : null}
              {"evidence" in selected && selected.evidence ? (
                <>
                  <div className="label">evidence</div>
                  <textarea className="input mono" value={selected.evidence} readOnly />
                </>
              ) : null}

              {"image" in selected && selected.image && typeof selected.image === "string" && assets[selected.image] ? (
                <>
                  <div className="label">image</div>
                  <img
                    src={assets[selected.image]}
                    alt={selected.image}
                    style={{ width: "100%", borderRadius: 10, border: "1px solid rgba(255,255,255,0.12)" }}
                  />
                </>
              ) : null}
            </>
          ) : (
            <div className="muted" style={{ marginTop: 6 }}>
              点击节点/边查看详细内容、证据与元数据。
            </div>
          )}
        </div>

        <div className="card">
          <div className="h1">MathJax 整体校正（LLM，可选）</div>
          <div className="muted">
            当某些节点 LaTeX 无法渲染时，可批量调用 LLM 做“尽可能小的修复”。会修改节点 content，并在 meta 中保留 originalContent。
          </div>
          <div className="row" style={{ marginTop: 10 }}>
            <button
              className="btn ok"
              disabled={repairing || !llm.enabled || !llm.apiKey.trim()}
              onClick={async () => {
                setRepairing(true);
                try {
                  const nodes = useAppStore.getState().graph.nodes.filter((n) => typeof n.content === "string" && n.content.trim().length > 0);
                  const concurrency = Math.max(1, Math.min(32, Math.floor(llm.parallelism || 1)));
                  let next = 0;
                  let done = 0;

                  const runWorker = async () => {
                    while (next < nodes.length) {
                      const idx = next++;
                      const n = nodes[idx];
                      const original = n.content ?? "";
                      try {
                        const fixed = await repairLatexForMathJax({ llm, original });
                        useAppStore.getState().updateNode(n.id, {
                          content: fixed,
                          meta: { ...(n.meta ?? {}), originalContent: (n.meta as any)?.originalContent ?? original, mathjaxFixed: true }
                        });
                      } catch {
                        // ignore per-node failures; user can retry on the node
                      } finally {
                        done++;
                        if (done % 5 === 0) useAppStore.getState().setInfo(`MathJax 校正进度：${done}/${nodes.length}`);
                      }
                    }
                  };

                  await Promise.all(Array.from({ length: concurrency }, () => runWorker()));
                  useAppStore.getState().setInfo(`MathJax 整体校正完成：${nodes.length} 个节点尝试修复`);
                } catch (e: any) {
                  useAppStore.getState().setError(String(e?.message ?? e));
                } finally {
                  setRepairing(false);
                }
              }}
            >
              {repairing ? "整体校正中..." : "整体校正（全部节点）"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

