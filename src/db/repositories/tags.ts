import * as Crypto from "expo-crypto";

import type { Tag } from "../../data/entries";

import { getDatabase } from "../client";
import { type DbExecutor, withTransaction } from "../executor";

export type TagRow = {
  id: string;
  name: string;
  created_at: number;
  updated_at: number;
  deleted_at: number | null;
};

/**
 * Thrown by {@link createTag} / {@link renameTag} when another active tag already
 * has the requested name. The unique-active-name partial index
 * (`idx_tags_name_active`) would otherwise surface this as a raw SQLite
 * constraint error; wrapping it gives the UI a typed error to catch and show a
 * friendly "tag already exists" message.
 */
export class DuplicateTagError extends Error {
  constructor(public readonly tagName: string) {
    super(`A tag named "${tagName}" already exists`);
    this.name = "DuplicateTagError";
  }
}

function mapTagRow(row: TagRow): Tag {
  return {
    id: row.id,
    name: row.name,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function listTags(): Promise<Tag[]> {
  const db = await getDatabase();
  const result = await db.execute(
    `SELECT id, name, created_at, updated_at, deleted_at
     FROM tags
     WHERE deleted_at IS NULL
     ORDER BY name COLLATE NOCASE`,
  );

  return (result.rows as TagRow[]).map(mapTagRow);
}

export async function createTag(name: string, tx?: DbExecutor): Promise<Tag> {
  return withTransaction(tx, async (db) => {
    // Pre-check for an existing active tag with the same name so we throw a
    // typed error instead of relying on the partial unique index to surface a
    // raw constraint violation. The index still backstops a race between two
    // concurrent callers, but a single-user app with serial UI won't hit that.
    const existing = await db.execute(
      "SELECT id FROM tags WHERE name = ? AND deleted_at IS NULL LIMIT 1",
      [name],
    );
    if (existing.rows.length > 0) {
      throw new DuplicateTagError(name);
    }

    const now = Date.now();
    const id = Crypto.randomUUID();
    await db.execute("INSERT INTO tags (id, name, created_at, updated_at) VALUES (?, ?, ?, ?)", [
      id,
      name,
      now,
      now,
    ]);

    return { id, name, createdAt: now, updatedAt: now };
  });
}

export async function renameTag(id: string, name: string, tx?: DbExecutor): Promise<void> {
  await withTransaction(tx, async (db) => {
    const clash = await db.execute(
      "SELECT id FROM tags WHERE name = ? AND deleted_at IS NULL AND id != ? LIMIT 1",
      [name, id],
    );
    if (clash.rows.length > 0) {
      throw new DuplicateTagError(name);
    }

    const now = Date.now();
    await db.execute("UPDATE tags SET name = ?, updated_at = ? WHERE id = ?", [name, now, id]);
  });
}

export async function softDeleteTag(id: string, tx?: DbExecutor): Promise<void> {
  await withTransaction(tx, async (db) => {
    const now = Date.now();
    await db.execute("UPDATE tags SET deleted_at = ?, updated_at = ? WHERE id = ?", [now, now, id]);
  });
}

export async function getEntryTagIds(entryId: string, tx?: DbExecutor): Promise<string[]> {
  const db = tx ?? (await getDatabase());
  const result = await db.execute(
    "SELECT tag_id FROM entry_tags WHERE entry_id = ? AND deleted_at IS NULL",
    [entryId],
  );

  return result.rows.map((row) => String(row.tag_id));
}

export async function setEntryTags(
  entryId: string,
  tagIds: string[],
  tx?: DbExecutor,
): Promise<void> {
  await withTransaction(tx, async (db) => {
    const now = Date.now();
    const current = new Set(await getEntryTagIds(entryId, db));
    const desired = new Set(tagIds);

    // Add new memberships (or revive tombstoned ones via the upsert). The
    // composite PK conflict clears deleted_at so re-adding a previously-removed
    // tag restores the original membership row (sync-friendly: no new row id).
    for (const tagId of desired) {
      if (current.has(tagId)) {
        continue;
      }

      await db.execute(
        `INSERT INTO entry_tags (entry_id, tag_id, created_at, deleted_at)
         VALUES (?, ?, ?, NULL)
         ON CONFLICT(entry_id, tag_id) DO UPDATE SET deleted_at = NULL, created_at = excluded.created_at`,
        [entryId, tagId, now],
      );
    }

    // Soft-delete removed memberships (tombstones propagate to sync).
    for (const tagId of current) {
      if (desired.has(tagId)) {
        continue;
      }

      await db.execute(
        "UPDATE entry_tags SET deleted_at = ? WHERE entry_id = ? AND tag_id = ? AND deleted_at IS NULL",
        [now, entryId, tagId],
      );
    }
  });
}

export async function findTagIdByName(name: string): Promise<string | null> {
  const db = await getDatabase();
  const result = await db.execute(
    "SELECT id FROM tags WHERE name = ? AND deleted_at IS NULL LIMIT 1",
    [name],
  );

  return result.rows[0]?.id ? String(result.rows[0].id) : null;
}
