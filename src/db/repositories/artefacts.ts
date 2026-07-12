import type { Artefact } from "../../data/entries";

import { parseAnnotations } from "../../data/ink";
import { inkOverlayUriForArtefact } from "../../storage/files";
import { getDatabase } from "../client";
import { type DbExecutor, withTransaction } from "../executor";
import {
  extractSearchableText,
  getArtefactRowid,
  getEntryRowid,
  indexArtefactText,
  reindexArtefactText,
  removeArtefactFromFts,
} from "../fts";

export type ArtefactRow = {
  id: string;
  entry_id: string;
  type: string;
  sort_order: number;
  data: string;
  annotations: string | null;
  created_at: number;
  updated_at: number;
  deleted_at: number | null;
};

export type InsertArtefactInput = {
  id: string;
  entryId: string;
  type: string;
  sortOrder: number;
  data: string;
  /** Opaque Ink JSON (ADR-0008); null when the artefact has no Ink. */
  annotations?: string | null;
  createdAt: number;
  updatedAt: number;
};

function inkFieldsFromAnnotations(artefactId: string, annotations: string | null) {
  const document = parseAnnotations(annotations);
  if (!document) {
    return {};
  }
  return {
    ink: document,
    inkOverlayPath: inkOverlayUriForArtefact(artefactId),
  };
}

export function mapArtefactRow(row: ArtefactRow): Artefact {
  if (row.type === "paper") {
    try {
      const parsed = JSON.parse(row.data) as { text?: string };
      return {
        text: parsed.text ?? "",
        ...inkFieldsFromAnnotations(row.id, row.annotations),
      };
    } catch {
      return { text: "" };
    }
  }

  if (row.type === "print") {
    try {
      const parsed = JSON.parse(row.data) as { text?: string; imagePath?: string };
      return {
        text: parsed.text ?? "",
        imagePath: parsed.imagePath ?? "",
        ...inkFieldsFromAnnotations(row.id, row.annotations),
      };
    } catch {
      return { text: "", imagePath: "" };
    }
  }

  return {
    type: row.type,
    rawData: row.data,
  };
}

export async function insertArtefact(input: InsertArtefactInput, tx?: DbExecutor): Promise<void> {
  await withTransaction(tx, async (db) => {
    await db.execute(
      `INSERT INTO artefacts (id, entry_id, type, sort_order, data, annotations, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        input.id,
        input.entryId,
        input.type,
        input.sortOrder,
        input.data,
        input.annotations ?? null,
        input.createdAt,
        input.updatedAt,
      ],
    );

    // Maintain the FTS index atomically with the row write so a failure can't
    // leave a row with no (or stale) search coverage. Skip empty text so we
    // don't litter artefacts_fts with rows that can never MATCH.
    const artefactRowid = await getArtefactRowid(db, input.id);
    const entryRowid = await getEntryRowid(db, input.entryId);
    const text = extractSearchableText(input.data);
    if (artefactRowid != null && entryRowid != null && text) {
      await indexArtefactText(db, artefactRowid, entryRowid, text);
    }
  });
}

export async function updateArtefactData(
  artefactId: string,
  entryId: string,
  data: string,
  updatedAt: number,
  tx?: DbExecutor,
): Promise<void> {
  await withTransaction(tx, async (db) => {
    await db.execute("UPDATE artefacts SET data = ?, updated_at = ? WHERE id = ?", [
      data,
      updatedAt,
      artefactId,
    ]);

    const artefactRowid = await getArtefactRowid(db, artefactId);
    const entryRowid = await getEntryRowid(db, entryId);
    if (artefactRowid != null && entryRowid != null) {
      const text = extractSearchableText(data);
      if (text) {
        await reindexArtefactText(db, artefactRowid, entryRowid, text);
      } else {
        // Text cleared -> drop the FTS row so the artefact stops matching.
        await removeArtefactFromFts(db, artefactRowid);
      }
    }
  });
}

export async function softDeleteArtefact(
  artefactId: string,
  deletedAt: number,
  tx?: DbExecutor,
): Promise<void> {
  await withTransaction(tx, async (db) => {
    await db.execute("UPDATE artefacts SET deleted_at = ? WHERE id = ?", [deletedAt, artefactId]);

    const artefactRowid = await getArtefactRowid(db, artefactId);
    if (artefactRowid != null) {
      await removeArtefactFromFts(db, artefactRowid);
    }
  });
}

/**
 * Reverse a soft-delete: clear `deleted_at` and re-index the artefact's text so
 * it is searchable again. The row's `entry_id`/`data` are re-read (they may
 * have changed while tombstoned) so the FTS row is rebuilt from current values.
 * Bumps `updated_at` for last-write-wins sync ordering.
 */
export async function restoreArtefact(
  artefactId: string,
  updatedAt: number,
  tx?: DbExecutor,
): Promise<void> {
  await withTransaction(tx, async (db) => {
    await db.execute("UPDATE artefacts SET deleted_at = NULL, updated_at = ? WHERE id = ?", [
      updatedAt,
      artefactId,
    ]);

    const rowResult = await db.execute("SELECT entry_id, data FROM artefacts WHERE id = ?", [
      artefactId,
    ]);
    const row = rowResult.rows[0];
    const artefactRowid = await getArtefactRowid(db, artefactId);

    if (row && artefactRowid != null) {
      const entryRowid = await getEntryRowid(db, String(row.entry_id));
      if (entryRowid != null) {
        const text = extractSearchableText(String(row.data));
        if (text) {
          await reindexArtefactText(db, artefactRowid, entryRowid, text);
        }
      }
    }
  });
}

export async function getArtefactsForEntry(entryId: string): Promise<ArtefactRow[]> {
  const db = await getDatabase();
  const result = await db.execute(
    `SELECT id, entry_id, type, sort_order, data, annotations, created_at, updated_at, deleted_at
     FROM artefacts
     WHERE entry_id = ? AND deleted_at IS NULL
     ORDER BY sort_order`,
    [entryId],
  );

  return result.rows as ArtefactRow[];
}

/**
 * Fetch artefacts for many entries in a single query (avoids the N+1 of calling
 * {@link getArtefactsForEntry} per entry when loading search results or a full
 * day). Rows come back ordered by `(entry_id, sort_order)` so each entry's
 * artefacts are already in order after grouping.
 */
export async function getArtefactsForEntries(
  entryIds: string[],
  tx?: DbExecutor,
): Promise<Map<string, ArtefactRow[]>> {
  if (entryIds.length === 0) {
    return new Map();
  }

  const db = tx ?? (await getDatabase());
  const placeholders = entryIds.map(() => "?").join(", ");
  const result = await db.execute(
    `SELECT id, entry_id, type, sort_order, data, annotations, created_at, updated_at, deleted_at
     FROM artefacts
     WHERE entry_id IN (${placeholders}) AND deleted_at IS NULL
     ORDER BY entry_id, sort_order`,
    entryIds,
  );

  const byEntry = new Map<string, ArtefactRow[]>();
  for (const row of result.rows as ArtefactRow[]) {
    const list = byEntry.get(row.entry_id);
    if (list) {
      list.push(row);
    } else {
      byEntry.set(row.entry_id, [row]);
    }
  }

  return byEntry;
}
