/**
 * featuredWidgetSlots — durable ownership of five stable widget positions.
 *
 * The table stores only user intent: slot number, Artefact identity, timestamps,
 * and an optional slot tombstone. Rendered PNGs are derived cache state. Parent
 * Entry/Artefact soft-deletion does not tombstone the binding; reads surface a
 * reserved `unavailable` slot so Undo restores the same installed widgets.
 *
 * Map:
 * - assignment selects the lowest absent/tombstoned row transactionally;
 * - the five-way read maps database joins to empty/featured/unavailable states;
 * - capture/picker queries revalidate live sources without loading all slots;
 * - deep-link validation requires an exact live date/Entry/Artefact identity.
 */
import type { Artefact } from "../../data/entries";

import { getDatabase } from "../client";
import { type DbExecutor, withTransaction } from "../executor";
import { mapArtefactRow, type ArtefactRow } from "./artefacts";

/** The build-time widget configurations and durable slot rows share this bound. */
export const FEATURED_WIDGET_SLOT_COUNT = 5;

export type FeaturedWidgetSlotIndex = 1 | 2 | 3 | 4 | 5;

export type FeaturedWidgetAssignmentOutcome =
  | { status: "assigned"; slotIndex: FeaturedWidgetSlotIndex }
  | { status: "duplicate"; slotIndex: FeaturedWidgetSlotIndex }
  | { status: "full" };

export type EmptyFeaturedWidgetSlot = {
  /** Stable position selected by installed widget configuration. */
  slotIndex: FeaturedWidgetSlotIndex;
  state: "empty";
};

export type UnavailableFeaturedWidgetSlot = {
  slotIndex: FeaturedWidgetSlotIndex;
  state: "unavailable";
  /** Retained identity allows the binding to become featured again after Undo. */
  artefactId: string;
  assignedAt: number;
  updatedAt: number;
};

export type OccupiedFeaturedWidgetSlot = {
  slotIndex: FeaturedWidgetSlotIndex;
  state: "featured";
  artefact: Artefact;
  entryId: string;
  entryTitle: string;
  entryDate: string;
  /** Assignment timestamps are slot metadata, independent of frame revision. */
  assignedAt: number;
  updatedAt: number;
  /** Changes whenever the rendered artefact or Ink changes, not for metadata-only edits. */
  frameRevision: number;
};

export type FeaturedWidgetSlot =
  | EmptyFeaturedWidgetSlot
  | UnavailableFeaturedWidgetSlot
  | OccupiedFeaturedWidgetSlot;

export type FeaturedWidgetPickerState = {
  /** Only candidate IDs already occupying active slots. */
  featuredIds: Set<string>;
  /** Reserved unavailable rows count toward this capacity result. */
  isFull: boolean;
};

export type FeaturedWidgetCaptureSource = {
  artefact: Artefact;
  frameRevision: number;
};

type SlotRow = Record<string, unknown>;

/** Reject corrupt slot numbers at the repository boundary instead of casting. */
function toSlotIndex(value: unknown): FeaturedWidgetSlotIndex {
  const index = Number(value);
  if (index < 1 || index > FEATURED_WIDGET_SLOT_COUNT || !Number.isInteger(index)) {
    throw new Error(`Invalid featured widget slot index: ${String(value)}`);
  }
  return index as FeaturedWidgetSlotIndex;
}

/**
 * Assign one artefact inside the caller's transaction.
 *
 * Duplicate detection deliberately precedes capacity so a retry reports the
 * stable existing binding even when all five positions are occupied. The slot
 * selection query treats both an absent row and a tombstoned row as empty, and
 * chooses the lowest number. The primary key then turns the write into either
 * an insert or a deterministic revival/replacement.
 */
export async function assignFirstEmptyFeaturedWidgetSlot(
  db: DbExecutor,
  artefactId: string,
  now: number,
): Promise<FeaturedWidgetAssignmentOutcome> {
  const duplicate = await db.execute(
    `SELECT slot_index
     FROM featured_widget_slots
     WHERE artefact_id = ? AND deleted_at IS NULL
     LIMIT 1`,
    [artefactId],
  );
  if (duplicate.rows[0]) {
    return { status: "duplicate", slotIndex: toSlotIndex(duplicate.rows[0].slot_index) };
  }

  const available = await db.execute(
    `WITH slot_numbers(slot_index) AS (VALUES (1), (2), (3), (4), (5))
     SELECT n.slot_index
     FROM slot_numbers n
     LEFT JOIN featured_widget_slots s
       ON s.slot_index = n.slot_index AND s.deleted_at IS NULL
     WHERE s.slot_index IS NULL
     ORDER BY n.slot_index
     LIMIT 1`,
  );
  if (!available.rows[0]) {
    return { status: "full" };
  }

  const slotIndex = toSlotIndex(available.rows[0].slot_index);
  await db.execute(
    `INSERT INTO featured_widget_slots
       (slot_index, artefact_id, assigned_at, updated_at, deleted_at)
     VALUES (?, ?, ?, ?, NULL)
     ON CONFLICT(slot_index) DO UPDATE SET
       artefact_id = excluded.artefact_id,
       assigned_at = excluded.assigned_at,
       updated_at = excluded.updated_at,
       deleted_at = NULL`,
    [slotIndex, artefactId, now, now],
  );

  return { status: "assigned", slotIndex };
}

export async function assignFeaturedWidgetSlot(
  artefactId: string,
): Promise<FeaturedWidgetAssignmentOutcome> {
  return withTransaction(undefined, (db) =>
    assignFirstEmptyFeaturedWidgetSlot(db, artefactId, Date.now()),
  );
}

/** Tombstone an explicit binding; parent soft-deletes never call this seam. */
export async function tombstoneFeaturedWidgetSlot(
  slotIndex: FeaturedWidgetSlotIndex,
  deletedAt: number,
  tx?: DbExecutor,
): Promise<void> {
  await withTransaction(tx, async (db) => {
    await db.execute(
      `UPDATE featured_widget_slots
       SET deleted_at = ?, updated_at = ?
       WHERE slot_index = ? AND deleted_at IS NULL`,
      [deletedAt, deletedAt, slotIndex],
    );
  });
}

/**
 * Read all five numbered positions in one query.
 *
 * Parent rows are left-joined without a deletion filter so a missing parent and
 * a soft-deleted parent both map to the reserved `unavailable` state. This is
 * what lets Undo restore the same binding while still withholding deleted
 * content from the widget and in-app preview.
 */
export async function readFeaturedWidgetSlots(db: DbExecutor): Promise<FeaturedWidgetSlot[]> {
  const result = await db.execute(
    `WITH slot_numbers(slot_index) AS (VALUES (1), (2), (3), (4), (5))
     SELECT
       n.slot_index,
       s.artefact_id AS slot_artefact_id,
       s.assigned_at,
       s.updated_at AS slot_updated_at,
       a.id AS artefact_id,
       a.entry_id AS artefact_entry_id,
       a.type AS artefact_type,
       a.sort_order AS artefact_sort_order,
       a.data,
       CASE WHEN a.annotations IS NULL OR a.annotations = '' THEN 0 ELSE 1 END AS has_ink,
       a.created_at AS artefact_created_at,
       a.updated_at AS artefact_updated_at,
       a.deleted_at AS artefact_deleted_at,
       e.id AS entry_id,
       e.title AS entry_title,
       e.date AS entry_date,
       e.deleted_at AS entry_deleted_at
     FROM slot_numbers n
     LEFT JOIN featured_widget_slots s
       ON s.slot_index = n.slot_index AND s.deleted_at IS NULL
     LEFT JOIN artefacts a ON a.id = s.artefact_id
     LEFT JOIN entries e ON e.id = a.entry_id
     ORDER BY n.slot_index`,
  );

  return result.rows.map((row) => mapSlotRow(row));
}

function mapSlotRow(row: SlotRow): FeaturedWidgetSlot {
  const slotIndex = toSlotIndex(row.slot_index);
  if (row.slot_artefact_id == null) {
    return { slotIndex, state: "empty" };
  }

  const unavailable =
    row.artefact_id == null ||
    row.entry_id == null ||
    row.artefact_deleted_at != null ||
    row.entry_deleted_at != null;
  if (unavailable) {
    return {
      slotIndex,
      state: "unavailable",
      artefactId: String(row.slot_artefact_id),
      assignedAt: Number(row.assigned_at),
      updatedAt: Number(row.slot_updated_at),
    };
  }

  const artefactRow: ArtefactRow = {
    id: String(row.artefact_id),
    entry_id: String(row.artefact_entry_id),
    type: String(row.artefact_type),
    sort_order: Number(row.artefact_sort_order),
    data: String(row.data),
    has_ink: Number(row.has_ink),
    created_at: Number(row.artefact_created_at),
    updated_at: Number(row.artefact_updated_at),
    deleted_at: null,
  };

  return {
    slotIndex,
    state: "featured",
    artefact: mapArtefactRow(artefactRow),
    entryId: String(row.entry_id),
    entryTitle: String(row.entry_title),
    entryDate: String(row.entry_date),
    assignedAt: Number(row.assigned_at),
    updatedAt: Number(row.slot_updated_at),
    frameRevision: Number(row.artefact_updated_at),
  };
}

/** App-level convenience wrapper around the injectable repository read. */
export async function getFeaturedWidgetSlots(): Promise<FeaturedWidgetSlot[]> {
  return readFeaturedWidgetSlots(await getDatabase());
}

/** Re-read render input immediately before capture so stale picker objects cannot be published. */
export async function getFeaturedWidgetCaptureSource(
  artefactId: string,
): Promise<FeaturedWidgetCaptureSource | null> {
  const db = await getDatabase();
  const result = await db.execute(
    `SELECT a.id, a.entry_id, a.type, a.sort_order, a.data,
            CASE WHEN a.annotations IS NULL OR a.annotations = '' THEN 0 ELSE 1 END AS has_ink,
            a.created_at, a.updated_at, a.deleted_at
     FROM artefacts a
     INNER JOIN entries e ON e.id = a.entry_id
     WHERE a.id = ?
       AND a.deleted_at IS NULL
       AND e.deleted_at IS NULL
     LIMIT 1`,
    [artefactId],
  );
  const row = result.rows[0] as ArtefactRow | undefined;
  if (!row) {
    return null;
  }
  return {
    artefact: mapArtefactRow(row),
    frameRevision: Number(row.updated_at),
  };
}

/** Read duplicate/capacity state in one round-trip for the picker. */
export async function getFeaturedWidgetPickerState(
  artefactIds: string[],
): Promise<FeaturedWidgetPickerState> {
  const db = await getDatabase();
  const candidateClause =
    artefactIds.length > 0
      ? `AND artefact_id IN (${artefactIds.map(() => "?").join(", ")})`
      : "AND 0";
  const result = await db.execute(
    `SELECT artefact_id,
            (SELECT COUNT(*) FROM featured_widget_slots WHERE deleted_at IS NULL) AS active_count
     FROM featured_widget_slots
     WHERE deleted_at IS NULL ${candidateClause}
     UNION ALL
     SELECT NULL AS artefact_id, COUNT(*) AS active_count
     FROM featured_widget_slots
     WHERE deleted_at IS NULL`,
    artefactIds,
  );
  const activeCount = Number(result.rows[0]?.active_count ?? 0);
  return {
    featuredIds: new Set(
      result.rows.filter((row) => row.artefact_id != null).map((row) => String(row.artefact_id)),
    ),
    isFull: activeCount >= FEATURED_WIDGET_SLOT_COUNT,
  };
}

/** Verify a widget command still points at one live parent/child pair. */
export async function isFeaturedWidgetSourceAvailable(
  entryDate: string,
  entryId: string,
  artefactId: string,
  tx?: DbExecutor,
): Promise<boolean> {
  const db = tx ?? (await getDatabase());
  const result = await db.execute(
    `SELECT 1 AS available
     FROM entries e
     INNER JOIN artefacts a ON a.entry_id = e.id
     WHERE e.id = ?
       AND e.date = ?
       AND e.deleted_at IS NULL
       AND a.id = ?
       AND a.deleted_at IS NULL
     LIMIT 1`,
    [entryId, entryDate, artefactId],
  );
  return result.rows.length > 0;
}
