export type KnownArtefactType = "paper" | "print";

/** Per-type text capacity limits — enforced in authoring UI, not by the DB. */
export const ARTEFACT_TEXT_LIMITS: Record<KnownArtefactType, number> = {
  paper: 10_000,
  print: 500,
};

/**
 * Max artefacts on one entry during create (and save guard). Not a DB constraint
 * — see ADR-0007.
 */
export const MAX_ARTEFACTS_PER_ENTRY = 5;
