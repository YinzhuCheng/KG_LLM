import { AppGraph, GraphEdge, GraphNode, RelationType } from "../graph/types";
import { DataFactory, Writer } from "n3";

const { namedNode, literal, quad } = DataFactory;

export const NS = {
  base: "https://example.org/latexkg#",
  rdf: "http://www.w3.org/1999/02/22-rdf-syntax-ns#",
  rdfs: "http://www.w3.org/2000/01/rdf-schema#",
  owl: "http://www.w3.org/2002/07/owl#"
};

export function exportGraphJson(graph: AppGraph) {
  return JSON.stringify({ version: 1, graph }, null, 2);
}

export async function exportGraphTurtle(graph: AppGraph) {
  const writer = new Writer({
    prefixes: {
      latexkg: NS.base,
      rdf: NS.rdf,
      rdfs: NS.rdfs,
      owl: NS.owl
    }
  });

  for (const n of graph.nodes) {
    const subj = nodeUri(n.id);
    writer.addQuad(quad(subj, namedNode(`${NS.rdf}type`), namedNode(`${NS.base}${n.type}`)));
    writer.addQuad(quad(subj, namedNode(`${NS.rdfs}label`), literal(n.title)));
    if (n.content) writer.addQuad(quad(subj, namedNode(`${NS.base}content`), literal(n.content)));
    if (n.source?.file) writer.addQuad(quad(subj, namedNode(`${NS.base}sourceFile`), literal(n.source.file)));
    if (n.source?.latexLabel) writer.addQuad(quad(subj, namedNode(`${NS.base}latexLabel`), literal(n.source.latexLabel)));
  }

  for (const e of graph.edges) {
    const pred = relationUri(e.type);
    writer.addQuad(quad(nodeUri(e.source), pred, nodeUri(e.target)));
    if (e.evidence) {
      // attach evidence as a reified statement (lightweight)
      const stmt = namedNode(`${NS.base}stmt:${encodeURIComponent(`${e.source}|${e.type}|${e.target}`)}`);
      writer.addQuad(quad(stmt, namedNode(`${NS.rdf}type`), namedNode(`${NS.rdf}Statement`)));
      writer.addQuad(quad(stmt, namedNode(`${NS.rdf}subject`), nodeUri(e.source)));
      writer.addQuad(quad(stmt, namedNode(`${NS.rdf}predicate`), pred));
      writer.addQuad(quad(stmt, namedNode(`${NS.rdf}object`), nodeUri(e.target)));
      writer.addQuad(quad(stmt, namedNode(`${NS.base}evidence`), literal(e.evidence)));
    }
  }

  return await new Promise<string>((resolve, reject) => {
    writer.end((err: unknown, result: string) => {
      if (err) reject(err);
      else resolve(result);
    });
  });
}

export function exportGraphOwlXml(graph: AppGraph) {
  // Minimal OWL (RDF/XML) for portability
  const escapeXml = (s: string) =>
    s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&apos;");

  const classes = new Set(graph.nodes.map((n) => n.type));
  const objProps = new Set(graph.edges.map((e) => e.type));

  const classXml = [...classes]
    .map((c) => `  <owl:Class rdf:about="${NS.base}${c}"/>`)
    .join("\n");
  const propXml = [...objProps]
    .map((p) => `  <owl:ObjectProperty rdf:about="${NS.base}${p}"/>`)
    .join("\n");

  const individuals = graph.nodes
    .map((n) => {
      const about = `${NS.base}node:${encodeURIComponent(n.id)}`;
      const label = escapeXml(n.title);
      const content = n.content ? `\n    <latexkg:content>${escapeXml(n.content)}</latexkg:content>` : "";
      return `  <owl:NamedIndividual rdf:about="${about}">
    <rdf:type rdf:resource="${NS.base}${n.type}"/>
    <rdfs:label>${label}</rdfs:label>${content}
  </owl:NamedIndividual>`;
    })
    .join("\n");

  const relations = graph.edges
    .map((e) => {
      const s = `${NS.base}node:${encodeURIComponent(e.source)}`;
      const t = `${NS.base}node:${encodeURIComponent(e.target)}`;
      return `  <rdf:Description rdf:about="${s}">
    <latexkg:${e.type} rdf:resource="${t}"/>
  </rdf:Description>`;
    })
    .join("\n");

  return `<?xml version="1.0" encoding="UTF-8"?>
<rdf:RDF
  xmlns:rdf="${NS.rdf}"
  xmlns:rdfs="${NS.rdfs}"
  xmlns:owl="${NS.owl}"
  xmlns:latexkg="${NS.base}">
  <owl:Ontology rdf:about="${NS.base}"/>
${classXml ? "\n" + classXml : ""}${propXml ? "\n" + propXml : ""}${individuals ? "\n" + individuals : ""}${relations ? "\n" + relations : ""}
</rdf:RDF>
`;
}

function nodeUri(id: string) {
  return namedNode(`${NS.base}node:${encodeURIComponent(id)}`);
}

function relationUri(type: RelationType) {
  return namedNode(`${NS.base}${type}`);
}

