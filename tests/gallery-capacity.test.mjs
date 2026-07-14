import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";

import { runMigrations } from "../src/db/migrations.ts";
import { restoreArtefact, softDeleteArtefact } from "../src/db/repositories/artefacts.ts";
import {
  addGalleryMembership,
  GALLERY_CAPACITY,
  GalleryCapacityError,
} from "../src/db/repositories/galleryMembership.ts";

function createExecutor() {
  const database = new DatabaseSync(":memory:");
  return {
    database,
    async execute(query, params = []) {
      const statement = database.prepare(query);
      if (/^\s*(SELECT|PRAGMA|WITH)\b/i.test(query)) {
        return { rows: statement.all(...params), rowsAffected: 0 };
      }
      const result = statement.run(...params);
      return { rows: [], rowsAffected: Number(result.changes) };
    },
    async executeBatch(statements) {
      database.exec("BEGIN");
      try {
        for (const [query, params = []] of statements) {
          database.prepare(query).run(...params);
        }
        database.exec("COMMIT");
      } catch (error) {
        database.exec("ROLLBACK");
        throw error;
      }
    },
  };
}

async function createGallery() {
  const executor = createExecutor();
  await runMigrations(executor);
  executor.database
    .prepare(
      "INSERT INTO entries (id, title, type, date, sort_order, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
    )
    .run("entry", "Gallery fixture", "paper", "2026-07-15", 0, 1, 1);
  let nextMembership = 0;
  let now = 1;
  return {
    ...executor,
    async add(artefactId) {
      executor.database
        .prepare(
          "INSERT OR IGNORE INTO artefacts (id, entry_id, type, sort_order, data, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
        )
        .run(artefactId, "entry", "paper", 0, JSON.stringify({ text: artefactId }), now, now);
      await addGalleryMembership(executor, {
        artefactId,
        membershipId: `membership-${nextMembership++}`,
        now: now++,
      });
    },
    count() {
      return Number(
        executor.database
          .prepare("SELECT COUNT(*) AS count FROM gallery_items WHERE deleted_at IS NULL")
          .get().count,
      );
    },
    remove(artefactId) {
      executor.database
        .prepare(
          "UPDATE gallery_items SET deleted_at = ?, updated_at = ? WHERE artefact_id = ? AND deleted_at IS NULL",
        )
        .run(now, now++, artefactId);
    },
  };
}

async function fill(gallery, count) {
  for (let index = 0; index < count; index += 1) {
    await gallery.add(`artefact-${index}`);
  }
}

test("the tenth artefact is accepted and the eleventh returns a typed capacity error", async () => {
  const gallery = await createGallery();
  await fill(gallery, GALLERY_CAPACITY - 1);

  await gallery.add("artefact-9");
  assert.equal(gallery.count(), GALLERY_CAPACITY);
  await assert.rejects(() => gallery.add("artefact-10"), GalleryCapacityError);
  assert.equal(gallery.count(), GALLERY_CAPACITY);
});

test("removing a membership frees one slot", async () => {
  const gallery = await createGallery();
  await fill(gallery, GALLERY_CAPACITY);

  gallery.remove("artefact-4");
  await gallery.add("replacement");
  assert.equal(gallery.count(), GALLERY_CAPACITY);
});

test("reviving a tombstone consumes capacity and preserves its membership row", async () => {
  const gallery = await createGallery();
  await fill(gallery, GALLERY_CAPACITY - 1);
  const membershipId = gallery.database
    .prepare("SELECT id FROM gallery_items WHERE artefact_id = ?")
    .get("artefact-4").id;

  gallery.remove("artefact-4");
  await gallery.add("replacement");
  await gallery.add("artefact-4");

  assert.equal(gallery.count(), GALLERY_CAPACITY);
  assert.equal(
    gallery.database.prepare("SELECT id FROM gallery_items WHERE artefact_id = ?").get("artefact-4")
      .id,
    membershipId,
  );
});

test("an active duplicate remains a no-op when Gallery is full", async () => {
  const gallery = await createGallery();
  await fill(gallery, GALLERY_CAPACITY);

  await gallery.add("artefact-3");
  assert.equal(gallery.count(), GALLERY_CAPACITY);
});

test("racing attempts for the final slot cannot exceed capacity", async () => {
  const gallery = await createGallery();
  await fill(gallery, GALLERY_CAPACITY - 1);

  const results = await Promise.allSettled([gallery.add("racer-a"), gallery.add("racer-b")]);
  assert.equal(results.filter((result) => result.status === "fulfilled").length, 1);
  assert.equal(results.filter((result) => result.status === "rejected").length, 1);
  assert.equal(gallery.count(), GALLERY_CAPACITY);
});

test("schema triggers protect direct insert and tombstone revival paths", async () => {
  const gallery = await createGallery();
  await fill(gallery, GALLERY_CAPACITY);

  gallery.database
    .prepare(
      "INSERT INTO artefacts (id, entry_id, type, sort_order, data, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
    )
    .run("direct", "entry", "paper", 0, JSON.stringify({ text: "direct" }), 99, 99);

  assert.throws(() => {
    gallery.database
      .prepare(
        "INSERT INTO gallery_items (id, artefact_id, sort_order, added_at, updated_at) VALUES (?, ?, ?, ?, ?)",
      )
      .run("direct", "direct", 99, 99, 99);
  }, /GALLERY_CAPACITY_REACHED/);

  gallery.remove("artefact-0");
  await gallery.add("replacement");
  assert.throws(() => {
    gallery.database
      .prepare("UPDATE gallery_items SET deleted_at = NULL WHERE artefact_id = ?")
      .run("artefact-0");
  }, /GALLERY_CAPACITY_REACHED/);
});

test("parent tombstone and Undo preserve active Gallery membership", async () => {
  const gallery = await createGallery();
  await gallery.add("undo-target");
  const visibleCount = () =>
    Number(
      gallery.database
        .prepare(
          `SELECT COUNT(*) AS count
           FROM gallery_items g
           INNER JOIN artefacts a ON a.id = g.artefact_id
           INNER JOIN entries e ON e.id = a.entry_id
           WHERE g.deleted_at IS NULL AND a.deleted_at IS NULL AND e.deleted_at IS NULL`,
        )
        .get().count,
    );

  await softDeleteArtefact("undo-target", 100, gallery);
  assert.equal(visibleCount(), 0);
  assert.equal(gallery.count(), 1);

  await restoreArtefact("undo-target", 101, gallery);
  assert.equal(visibleCount(), 1);
  assert.equal(gallery.count(), 1);
});
