/**
 * Paper document — durable text plus presentation tokens for one Paper artefact.
 *
 * The database deliberately keeps `text` at the top level so existing search,
 * sync, and older app builds continue to understand the artefact. Styling is
 * stored separately as one preset per newline-delimited paragraph; this avoids
 * persisting UIKit ranges, whose UTF-16 offsets would be brittle across native
 * and JavaScript editing.
 *
 * Empty and trailing paragraphs are real paragraphs. For example, `"a\n"` has
 * two entries in `paragraphPresets`, which lets the caret after the final
 * newline retain the active preset. Legacy `{ text }` rows are read as version
 * 1 documents whose paragraphs all use Default.
 */

/** The only on-disk Paper document schema understood by this build. */
export const PAPER_DOCUMENT_VERSION = 1 as const;

export type PaperParagraphPreset = "default" | "large" | "x-large";

/** Shared validation set for persistence, native events, and toolbar commands. */
export const PAPER_PARAGRAPH_PRESETS = ["default", "large", "x-large"] as const;

export type PaperDocument = {
  /** Allows future readers to migrate styling without changing the DB schema. */
  version: typeof PAPER_DOCUMENT_VERSION;
  /** Plain searchable content, retained at the historical top-level key. */
  text: string;
  /** One presentation token for every paragraph, including empty paragraphs. */
  paragraphPresets: PaperParagraphPreset[];
};

/** Create a draft while preserving the empty paragraph that owns its caret. */
export function createPaperDocument(text = ""): PaperDocument {
  return parsePaperDocument({ text });
}

/**
 * Parse known Paper data from storage or a native event.
 *
 * This function is intentionally forgiving at the persistence boundary: an
 * invalid/missing text value becomes an empty document, while the legacy
 * `{ text }` shape receives Default styling without a database migration.
 */
export function parsePaperDocument(raw: unknown): PaperDocument {
  const value = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const text = typeof value.text === "string" ? value.text : "";
  const storedPresets = Array.isArray(value.paragraphPresets) ? value.paragraphPresets : [];

  return {
    version: PAPER_DOCUMENT_VERSION,
    text,
    paragraphPresets: text.split("\n").map((_, index) => {
      const candidate = storedPresets[index];
      return PAPER_PARAGRAPH_PRESETS.includes(candidate as PaperParagraphPreset)
        ? (candidate as PaperParagraphPreset)
        : "default";
    }),
  };
}

/**
 * Serialize only the normalized public schema.
 *
 * Calling the parser first prevents an accidental extra preset or unchecked
 * native payload from becoming durable opaque JSON that older peers must then
 * round-trip forever.
 */
export function serializePaperDocument(document: PaperDocument): string {
  return JSON.stringify(parsePaperDocument(document));
}
