import React, { useEffect, useMemo, useRef, useState } from "react";
import cytoscape, { Core } from "cytoscape";
import { useAppStore } from "../state/store";

type Props = {
  elements: any[];
  apiRef?: React.MutableRefObject<{ fit: () => void; center: () => void } | null>;
};

export function GraphView({ elements, apiRef }: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const cyRef = useRef<Core | null>(null);
  const [selected, setSelected] = useState<any | null>(null);
  const assets = useAppStore((s) => s.assets);

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
                  <b>type</b>: <span className="mono">{selected.type}</span>
                </div>
              ) : null}
              {"title" in selected ? (
                <div className="muted" style={{ marginTop: 6 }}>
                  <b>title</b>: {selected.title}
                </div>
              ) : null}
              {"content" in selected && selected.content ? (
                <>
                  <div className="label">content (LaTeX snippet)</div>
                  <textarea className="input mono" value={selected.content} readOnly />
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
      </div>
    </div>
  );
}

