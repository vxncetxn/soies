import * as Crypto from "expo-crypto";

import type { GalleryArtefact } from "../../data/entries";

import { getDatabase } from "../client";
import { type DbExecutor, withTransaction } from "../executor";
import { mapArtefactRow, type ArtefactRow } from "./artefacts";

export async function addArtefactToGallery(artefactId: string, tx?: DbExecutor): Promise<void> {
  await withTransaction(tx, async (db) => {
    const now = Date.now();

    // Already featured (active) -> no-op.
    const existing = await db.execute(
      "SELECT id FROM gallery_items WHERE artefact_id = ? AND deleted_at IS NULL LIMIT 1",
      [artefactId],
    );
    if (existing.rows.length > 0) {
      return;
    }

    // Previously un-featured (tombstoned) -> revive the existing membership row
    // so re-featuring keeps a stable row id (sync-friendly, no new UUID).
    const tombstoned = await db.execute(
      "SELECT id FROM gallery_items WHERE artefact_id = ? AND deleted_at IS NOT NULL LIMIT 1",
      [artefactId],
    );
    if (tombstoned.rows.length > 0) {
      await db.execute(
        "UPDATE gallery_items SET deleted_at = NULL, added_at = ?, updated_at = ?, sort_order = 0 WHERE id = ?",
        [now, now, tombstoned.rows[0].id],
      );
      return;
    }

    const orderResult = await db.execute(
      "SELECT COALESCE(MAX(sort_order), -1) + 1 AS next_order FROM gallery_items WHERE deleted_at IS NULL",
    );
    const sortOrder = Number(orderResult.rows[0]?.next_order ?? 0);

    await db.execute(
      `INSERT INTO gallery_items (id, artefact_id, sort_order, added_at, updated_at)
       VALUES (?, ?, ?, ?, ?)`,
      [Crypto.randomUUID(), artefactId, sortOrder, now, now],
    );
  });
}

export async function removeArtefactFromGallery(
  artefactId: string,
  tx?: DbExecutor,
): Promise<void> {
  await withTransaction(tx, async (db) => {
    const now = Date.now();
    await db.execute(
      "UPDATE gallery_items SET deleted_at = ?, updated_at = ? WHERE artefact_id = ? AND deleted_at IS NULL",
      [now, now, artefactId],
    );
  });
}

export async function setGalleryOrder(
  orderedArtefactIds: string[],
  tx?: DbExecutor,
): Promise<void> {
  // Reorder is a multi-row rewrite, so wrap it in one transaction: either the
  // whole new order commits or none of it does (no half-reordered gallery on a
  // failure midway).
  await withTransaction(tx, async (db) => {
    const now = Date.now();
    for (let index = 0; index < orderedArtefactIds.length; index += 1) {
      await db.execute(
        `UPDATE gallery_items
         SET sort_order = ?, updated_at = ?
         WHERE artefact_id = ? AND deleted_at IS NULL`,
        [index, now, orderedArtefactIds[index]],
      );
    }
  });
}

export async function getGallery(): Promise<GalleryArtefact[]> {
  const db = await getDatabase();
  // Only `a.id AS artefact_id` is selected — `g.artefact_id` is the same value
  // (equal by the JOIN) and selecting both caused a duplicate column name in the
  // row object, which was fragile even though it happened to resolve to the
  // right value.
  const result = await db.execute(
    `SELECT
       g.id AS gallery_id,
       g.sort_order,
       g.added_at,
       a.id AS artefact_id,
       a.entry_id,
       a.type,
       a.sort_order AS artefact_sort_order,
       a.data,
       a.annotations,
       a.created_at AS artefact_created_at,
       a.updated_at AS artefact_updated_at,
       e.title AS entry_title
     FROM gallery_items g
     INNER JOIN artefacts a ON a.id = g.artefact_id
     INNER JOIN entries e ON e.id = a.entry_id
     WHERE g.deleted_at IS NULL
       AND a.deleted_at IS NULL
       AND e.deleted_at IS NULL
     ORDER BY g.sort_order, g.added_at DESC`,
  );

  return result.rows.map((row) => {
    const artefactRow: ArtefactRow = {
      id: String(row.artefact_id),
      entry_id: String(row.entry_id),
      type: String(row.type),
      sort_order: Number(row.artefact_sort_order),
      data: String(row.data),
      annotations: row.annotations == null ? null : String(row.annotations),
      created_at: Number(row.artefact_created_at),
      updated_at: Number(row.artefact_updated_at),
      deleted_at: null,
    };

    return {
      artefact: mapArtefactRow(artefactRow),
      entryId: String(row.entry_id),
      entryTitle: String(row.entry_title),
      addedAt: Number(row.added_at),
    };
  });
}
