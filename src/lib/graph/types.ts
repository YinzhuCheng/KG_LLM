export type EntityType =
  | "Theorem"
  | "Lemma"
  | "Corollary"
  | "Definition"
  | "Formula"
  | "Example"
  | "Exercise"
  | "Axiom"
  | "Proposition"
  | "Conclusion";

export type RelationType =
  | "Proves"
  | "DependsOn"
  | "DerivedFrom"
  | "Contains"
  | "EquivalentTo"
  | "AppliesTo"
  | "Uses"
  | "AssistsIn";

export type GraphNode = {
  id: string;
  type: EntityType;
  title: string;
  content?: string;
  source?: {
    file?: string;
    lineHint?: number;
    latexLabel?: string;
    sectionPath?: string[];
  };
  meta?: Record<string, unknown>;
};

export type GraphEdge = {
  id?: string;
  type: RelationType;
  source: string;
  target: string;
  evidence?: string;
  meta?: Record<string, unknown>;
};

export type AppGraph = {
  nodes: GraphNode[];
  edges: GraphEdge[];
};

