import { EntityType, RelationType } from "../graph/types";

export const allEntityTypes: EntityType[] = [
  "Theorem",
  "Lemma",
  "Corollary",
  "Definition",
  "Formula",
  "Axiom",
  "Proposition",
  "Conclusion"
];

export const allRelationTypes: RelationType[] = [
  "Proves",
  "DependsOn",
  "DerivedFrom",
  "Contains",
  "EquivalentTo",
  "AppliesTo",
  "Uses",
  "AssistsIn"
];

export const defaultEntityTypes: EntityType[] = [...allEntityTypes];
export const defaultRelationTypes: RelationType[] = [...allRelationTypes];

