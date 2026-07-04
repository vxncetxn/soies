import type { Artefact, Entry, PaperArtefact, PrintArtefact } from "../../data/entries";

import { getDatabase } from "../client";
import { type DbExecutor, withTransaction } from "../executor";
import { getEntryRowid, indexEntryTitle, reindexEntryTitle, removeEntryFromFts } from "../fts";
import { getArtefactsForEntries, mapArtefactRow, type ArtefactRow } from "./artefacts";

export type EntryRow = {
  id: string;
  title: string;
  type: string;
  date: string;
  sort_order: number;
  created_at: number;
  updated_at: number;
  deleted_at: number | null;
};

export type InsertEntryInput = {
  id: string;
  title: string;
  type: "paper" | "print";
  date: string;
  sortOrder: number;
  createdAt: number;
  updatedAt: number;
};

function mapEntryRow(row: EntryRow, artefacts: Artefact[]): Entry {
  if (row.type === "paper") {
    return {
      title: row.title,
      type: "paper",
      artefacts: artefacts as PaperArtefact[],
    };
  }

  if (row.type === "print") {
    return {
      title: row.title,
      type: "print",
      artefacts: artefacts as PrintArtefact[],
    };
  }

  // Unknown primary type (e.g. a future `video` entry read by an older peer):
  // surface it as an UnknownEntry instead of silently coercing it to a Print.
  // The artefacts are already mapped (UnknownArtefact for any unknown child
  // type), so the row round-trips and renders a placeholder (ADR-0003).
  return {
    title: row.title,
    type: row.type,
    artefacts,
  };
}

function buildEntries(rows: EntryRow[], artefactsByEntry: Map<string, ArtefactRow[]>): Entry[] {
  return rows.map((row) =>
    mapEntryRow(row, (artefactsByEntry.get(row.id) ?? []).map(mapArtefactRow)),
  );
}

export async function insertEntry(input: InsertEntryInput, tx?: DbExecutor): Promise<void> {
  await withTransaction(tx, async (db) => {
    await db.execute(
      `INSERT INTO entries (id, title, type, date, sort_order, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        input.id,
        input.title,
        input.type,
        input.date,
        input.sortOrder,
        input.createdAt,
        input.updatedAt,
      ],
    );

    // Maintain the title FTS index atomically with the row write.
    const entryRowid = await getEntryRowid(db, input.id);
    if (entryRowid != null) {
      await indexEntryTitle(db, entryRowid, input.title);
    }
  });
}

export async function updateEntryTitle(
  entryId: string,
  title: string,
  updatedAt: number,
  tx?: DbExecutor,
): Promise<void> {
  await withTransaction(tx, async (db) => {
    await db.execute("UPDATE entries SET title = ?, updated_at = ? WHERE id = ?", [
      title,
      updatedAt,
      entryId,
    ]);

    const entryRowid = await getEntryRowid(db, entryId);
    if (entryRowid != null) {
      await reindexEntryTitle(db, entryRowid, title);
    }
  });
}

export async function softDeleteEntry(
  entryId: string,
  deletedAt: number,
  tx?: DbExecutor,
): Promise<void> {
  await withTransaction(tx, async (db) => {
    await db.execute("UPDATE entries SET deleted_at = ? WHERE id = ?", [deletedAt, entryId]);

    const entryRowid = await getEntryRowid(db, entryId);
    if (entryRowid != null) {
      await removeEntryFromFts(db, entryRowid);
    }
  });
}

/**
 * Reverse a soft-delete: clear `deleted_at` and re-index the title so the entry
 * is searchable again. Bumps `updated_at` for last-write-wins sync ordering.
 *
 * Note: restoring an entry does not automatically restore its artefacts' FTS
 * rows. Artefact FTS rows are removed only when an *artefact* is soft-deleted
 * (entry soft-delete leaves them in place, filtered out at read time by the
 * `entries.deleted_at IS NULL` join), so they are already correct here. Use
 * `restoreArtefact` to revive individually tombstoned artefacts.
 */
export async function restoreEntry(
  entryId: string,
  updatedAt: number,
  tx?: DbExecutor,
): Promise<void> {
  await withTransaction(tx, async (db) => {
    await db.execute("UPDATE entries SET deleted_at = NULL, updated_at = ? WHERE id = ?", [
      updatedAt,
      entryId,
    ]);

    const entryRowid = await getEntryRowid(db, entryId);
    if (entryRowid != null) {
      const titleResult = await db.execute("SELECT title FROM entries WHERE id = ?", [entryId]);
      const title = String(titleResult.rows[0]?.title ?? "");
      // reindex = delete-then-insert; the FTS row was removed on soft-delete so
      // the delete is a no-op, making this idempotent against double-restore.
      await reindexEntryTitle(db, entryRowid, title);
    }
  });
}

export async function getEntriesByDate(date: string): Promise<Entry[]> {
  const db = await getDatabase();
  const result = await db.execute(
    `SELECT id, title, type, date, sort_order, created_at, updated_at, deleted_at
     FROM entries
     WHERE date = ? AND deleted_at IS NULL
     ORDER BY sort_order`,
    [date],
  );

  const rows = result.rows as EntryRow[];
  const artefactsByEntry = await getArtefactsForEntries(
    rows.map((row) => row.id),
    db,
  );
  return buildEntries(rows, artefactsByEntry);
}

export async function getEntryDates(): Promise<Set<string>> {
  const db = await getDatabase();
  const result = await db.execute(
    "SELECT DISTINCT date FROM entries WHERE deleted_at IS NULL ORDER BY date",
  );

  return new Set(result.rows.map((row) => String(row.date)));
}

export async function getEntriesByIds(ids: string[]): Promise<Entry[]> {
  if (ids.length === 0) {
    return [];
  }

  const db = await getDatabase();
  const placeholders = ids.map(() => "?").join(", ");
  const result = await db.execute(
    `SELECT id, title, type, date, sort_order, created_at, updated_at, deleted_at
     FROM entries
     WHERE id IN (${placeholders}) AND deleted_at IS NULL
     ORDER BY updated_at DESC`,
    ids,
  );

  const rows = result.rows as EntryRow[];
  // Eager-load all artefacts in one query rather than one per entry, so search
  // results don't fan out to N+1 artefact queries.
  const artefactsByEntry = await getArtefactsForEntries(
    rows.map((row) => row.id),
    db,
  );
  return buildEntries(rows, artefactsByEntry);
}
