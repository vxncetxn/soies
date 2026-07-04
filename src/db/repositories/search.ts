import type { Entry } from "../../data/entries";

import { getDatabase } from "../client";
import { escapeFtsQuery } from "../fts";
import { getEntriesByIds } from "./entries";

export type SearchEntriesInput = {
  query?: string;
  tagIds?: string[];
};

async function searchEntryIdsByText(query: string): Promise<Set<string>> {
  const db = await getDatabase();
  const ftsQuery = escapeFtsQuery(query);

  if (!ftsQuery) {
    return new Set();
  }

  const titleMatches = await db.execute(
    "SELECT entry_rowid FROM entries_fts WHERE entries_fts MATCH ?",
    [ftsQuery],
  );
  const artefactMatches = await db.execute(
    "SELECT DISTINCT entry_rowid FROM artefacts_fts WHERE artefacts_fts MATCH ?",
    [ftsQuery],
  );

  const rowids = new Set<number>();

  for (const row of titleMatches.rows) {
    rowids.add(Number(row.entry_rowid));
  }

  for (const row of artefactMatches.rows) {
    rowids.add(Number(row.entry_rowid));
  }

  if (rowids.size === 0) {
    return new Set();
  }

  const placeholders = [...rowids].map(() => "?").join(", ");
  const entries = await db.execute(
    `SELECT id FROM entries WHERE rowid IN (${placeholders}) AND deleted_at IS NULL`,
    [...rowids],
  );

  return new Set(entries.rows.map((row) => String(row.id)));
}

async function searchEntryIdsByTags(tagIds: string[]): Promise<Set<string>> {
  if (tagIds.length === 0) {
    return new Set();
  }

  const db = await getDatabase();
  const placeholders = tagIds.map(() => "?").join(", ");
  const result = await db.execute(
    `SELECT DISTINCT entry_id
     FROM entry_tags
     WHERE tag_id IN (${placeholders}) AND deleted_at IS NULL`,
    tagIds,
  );

  return new Set(result.rows.map((row) => String(row.entry_id)));
}

function intersectSets(a: Set<string>, b: Set<string>): Set<string> {
  const result = new Set<string>();

  for (const value of a) {
    if (b.has(value)) {
      result.add(value);
    }
  }

  return result;
}

export async function searchEntries(input: SearchEntriesInput): Promise<Entry[]> {
  const query = input.query?.trim();
  const tagIds = input.tagIds ?? [];

  let candidateIds: Set<string> | null = null;

  if (query) {
    candidateIds = await searchEntryIdsByText(query);
  }

  if (tagIds.length > 0) {
    const tagMatches = await searchEntryIdsByTags(tagIds);
    candidateIds = candidateIds ? intersectSets(candidateIds, tagMatches) : tagMatches;
  }

  if (!candidateIds) {
    return [];
  }

  return getEntriesByIds([...candidateIds]);
}
