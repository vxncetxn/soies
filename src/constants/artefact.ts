export type KnownArtefactType = "paper" | "print";

/** Per-type text capacity limits — enforced in authoring UI, not by the DB (ADR-0007). */
export const ARTEFACT_TEXT_LIMITS: Record<KnownArtefactType, number> = {
  paper: 10_000,
  print: 500,
};
