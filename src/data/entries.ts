import type { InkDocument } from "./ink";

export type PaperArtefact = {
  id: string;
  text: string;
  /**
   * Parsed Ink strokes — loaded only for edit/Scribble, not Home display.
   * Display uses `inkOverlayPath` alone (ADR-0008).
   */
  ink?: InkDocument;
  /** File URI for the Ink overlay PNG cache. */
  inkOverlayPath?: string;
};

export type PrintArtefact = {
  id: string;
  text: string;
  imagePath: string;
  /** See PaperArtefact.ink. */
  ink?: InkDocument;
  inkOverlayPath?: string;
};

export type UnknownArtefact = {
  id: string;
  type: string;
  rawData: string;
};

export type Artefact = PaperArtefact | PrintArtefact | UnknownArtefact;

type EntryIdentity = {
  /** Stable database identity used by widget deep links and exact entry jumps. */
  id: string;
  /** Local calendar day (`YYYY-MM-DD`) that owns this entry. */
  date: string;
};

export type PaperEntry = EntryIdentity & {
  title: string;
  type: "paper";
  artefacts: PaperArtefact[];
};

export type PrintEntry = EntryIdentity & {
  title: string;
  type: "print";
  artefacts: PrintArtefact[];
};

/**
 * An entry whose primary artefact type is not recognised by this build (e.g. a
 * future `video` entry read by an older peer). Mirrors `UnknownArtefact`:
 * preserves the raw type string and the (already-mapped) artefacts so the row
 * round-trips verbatim and renders a placeholder instead of being silently
 * coerced into a Print. Forward-compatible across future sync (ADR-0003).
 */
export type UnknownEntry = EntryIdentity & {
  title: string;
  type: string;
  artefacts: Artefact[];
};

export type Entry = PaperEntry | PrintEntry | UnknownEntry;

export type Tag = {
  id: string;
  name: string;
  createdAt: number;
  updatedAt: number;
};

export { getEntriesByDate, getEntryDates, getAllEntriesByDate } from "../db/repositories/entries";
export { searchEntries } from "../db/repositories/search";
export { listTags } from "../db/repositories/tags";
export { ARTEFACT_TEXT_LIMITS } from "../constants/artefact";

export function isUnknownArtefact(artefact: Artefact): artefact is UnknownArtefact {
  return "rawData" in artefact;
}

export function isPrintArtefact(artefact: Artefact): artefact is PrintArtefact {
  return "imagePath" in artefact;
}
