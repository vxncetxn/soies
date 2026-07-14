import * as Crypto from "expo-crypto";

import type { GalleryArtefact } from "../../data/entries";

import { getDatabase } from "../client";
import { type DbExecutor, withTransaction } from "../executor";
import { mapArtefactRow, type ArtefactRow } from "./artefacts";
import {
  addGalleryMembership,
  GALLERY_CAPACITY,
  GalleryCapacityError,
  isGalleryCapacityError,
} from "./galleryMembership";

export { GALLERY_CAPACITY, GalleryCapacityError, isGalleryCapacityError };

export async function addArtefactToGallery(artefactId: string, tx?: DbExecutor): Promise<void> {
  await withTransaction(tx, (db) =>
    addGalleryMembership(db, {
      artefactId,
      membershipId: Crypto.randomUUID(),
      now: Date.now(),
    }),
  );
}

export type GalleryPickerState = {
  featuredIds: Set<string>;
  isFull: boolean;
};

/**
 * Membership for only the picker candidates plus one aggregate capacity count.
 * The sentinel UNION guarantees a row even when none of the candidates is
 * featured, avoiding a second whole-Gallery read or JS mapping pass.
 */
export async function getGalleryPickerState(artefactIds: string[]): Promise<GalleryPickerState> {
  const db = await getDatabase();
  const candidateClause =
    artefactIds.length > 0
      ? `AND artefact_id IN (${artefactIds.map(() => "?").join(", ")})`
      : "AND 0";
  const result = await db.execute(
    `SELECT artefact_id,
            (SELECT COUNT(*) FROM gallery_items WHERE deleted_at IS NULL) AS active_count
     FROM gallery_items
     WHERE deleted_at IS NULL ${candidateClause}
     UNION ALL
     SELECT NULL AS artefact_id, COUNT(*) AS active_count
     FROM gallery_items
     WHERE deleted_at IS NULL`,
    artefactIds,
  );
  const activeCount = Number(result.rows[0]?.active_count ?? 0);
  return {
    featuredIds: new Set(
      result.rows.filter((row) => row.artefact_id != null).map((row) => String(row.artefact_id)),
    ),
    isFull: activeCount >= GALLERY_CAPACITY,
  };
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
       CASE WHEN a.annotations IS NULL OR a.annotations = '' THEN 0 ELSE 1 END AS has_ink,
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
      has_ink: Number(row.has_ink),
      created_at: Number(row.artefact_created_at),
      updated_at: Number(row.artefact_updated_at),
      deleted_at: null,
    };

    return {
      galleryId: String(row.gallery_id),
      artefact: mapArtefactRow(artefactRow),
      entryId: String(row.entry_id),
      entryTitle: String(row.entry_title),
      addedAt: Number(row.added_at),
    };
  });
}
