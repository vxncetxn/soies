/** Gallery is intentionally small so its live framed surfaces stay bounded. */
export const GALLERY_CAPACITY = 10;
const GALLERY_CAPACITY_ERROR_CODE = "GALLERY_CAPACITY_REACHED";

type GalleryMembershipExecutor = {
  execute: (
    query: string,
    params?: (string | number | null)[],
  ) => Promise<{ rows: Record<string, unknown>[] }>;
};

type AddGalleryMembershipInput = {
  artefactId: string;
  membershipId: string;
  now: number;
};

/**
 * Stable repository error for a write that would exceed Gallery capacity.
 * Callers should branch on this type rather than matching a native SQLite
 * message, because the schema trigger is also the last line of defence for
 * future sync/import adapters that bypass the main repository.
 */
export class GalleryCapacityError extends Error {
  readonly code = GALLERY_CAPACITY_ERROR_CODE;
  readonly capacity = GALLERY_CAPACITY;

  constructor() {
    super(`Gallery can contain at most ${GALLERY_CAPACITY} artefacts`);
    this.name = "GalleryCapacityError";
  }
}

export function isGalleryCapacityError(error: unknown): error is GalleryCapacityError {
  return (
    error instanceof GalleryCapacityError ||
    (error instanceof Error && error.message.includes(GALLERY_CAPACITY_ERROR_CODE))
  );
}

/**
 * Add or revive one membership inside the caller's transaction.
 *
 * The active duplicate check comes before capacity so retries remain idempotent
 * even when Gallery is full. Hidden memberships whose parents are tombstoned
 * still count: Undo can make them visible again. The schema trigger repeats the
 * bound atomically for a writer that races after this count.
 */
export async function addGalleryMembership(
  db: GalleryMembershipExecutor,
  { artefactId, membershipId, now }: AddGalleryMembershipInput,
): Promise<void> {
  try {
    const existing = await db.execute(
      "SELECT id FROM gallery_items WHERE artefact_id = ? AND deleted_at IS NULL LIMIT 1",
      [artefactId],
    );
    if (existing.rows.length > 0) {
      return;
    }

    const capacityResult = await db.execute(
      "SELECT COUNT(*) AS active_count FROM gallery_items WHERE deleted_at IS NULL",
    );
    if (Number(capacityResult.rows[0]?.active_count ?? 0) >= GALLERY_CAPACITY) {
      throw new GalleryCapacityError();
    }

    const orderResult = await db.execute(
      "SELECT COALESCE(MAX(sort_order), -1) + 1 AS next_order FROM gallery_items WHERE deleted_at IS NULL",
    );
    const sortOrder = Number(orderResult.rows[0]?.next_order ?? 0);

    const tombstoned = await db.execute(
      "SELECT id FROM gallery_items WHERE artefact_id = ? AND deleted_at IS NOT NULL LIMIT 1",
      [artefactId],
    );
    if (tombstoned.rows.length > 0) {
      await db.execute(
        "UPDATE gallery_items SET deleted_at = NULL, added_at = ?, updated_at = ?, sort_order = ? WHERE id = ?",
        [now, now, sortOrder, String(tombstoned.rows[0].id)],
      );
      return;
    }

    await db.execute(
      `INSERT INTO gallery_items (id, artefact_id, sort_order, added_at, updated_at)
       VALUES (?, ?, ?, ?, ?)`,
      [membershipId, artefactId, sortOrder, now, now],
    );
  } catch (error) {
    if (isGalleryCapacityError(error)) {
      throw error instanceof GalleryCapacityError ? error : new GalleryCapacityError();
    }
    throw error;
  }
}
