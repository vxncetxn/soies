import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";

import { runMigrations } from "../src/db/migrations.ts";
import { restoreArtefact, softDeleteArtefact } from "../src/db/repositories/artefacts.ts";
import { restoreEntry, softDeleteEntry } from "../src/db/repositories/entries.ts";
import {
  assignFirstEmptyFeaturedWidgetSlot,
  FEATURED_WIDGET_SLOT_COUNT,
  isFeaturedWidgetSourceAvailable,
  readFeaturedWidgetSlots,
  tombstoneFeaturedWidgetSlot,
} from "../src/db/repositories/featuredWidgetSlots.ts";

function createExecutor() {
  const database = new DatabaseSync(":memory:");
  database.exec("PRAGMA foreign_keys = ON");
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

async function createFixture() {
  const executor = createExecutor();
  await runMigrations(executor);
  executor.database
    .prepare(
      "INSERT INTO entries (id, title, type, date, sort_order, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
    )
    .run("entry", "Widget fixture", "paper", "2026-07-15", 0, 1, 1);

  let now = 10;
  const insertArtefact = (artefactId) => {
    executor.database
      .prepare(
        "INSERT OR IGNORE INTO artefacts (id, entry_id, type, sort_order, data, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
      )
      .run(artefactId, "entry", "paper", 0, JSON.stringify({ text: artefactId }), now, now);
    now += 1;
  };

  return {
    ...executor,
    insertArtefact,
    async assign(artefactId) {
      insertArtefact(artefactId);
      return assignFirstEmptyFeaturedWidgetSlot(executor, artefactId, now++);
    },
  };
}

test("migration starts with five empty slots and preserves legacy Gallery rows", async () => {
  const fixture = createExecutor();
  await runMigrations(fixture);
  fixture.database
    .prepare(
      "INSERT INTO entries (id, title, type, date, sort_order, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
    )
    .run("entry", "Legacy", "paper", "2026-07-15", 0, 1, 1);
  fixture.database
    .prepare(
      "INSERT INTO artefacts (id, entry_id, type, sort_order, data, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
    )
    .run("artefact", "entry", "paper", 0, "{}", 1, 1);
  fixture.database
    .prepare(
      "INSERT INTO gallery_items (id, artefact_id, sort_order, added_at, updated_at) VALUES (?, ?, ?, ?, ?)",
    )
    .run("gallery", "artefact", 0, 1, 1);

  // Recreate the exact v3→v4 boundary with a populated legacy table. The new
  // migration must add only Widget Slot state and leave that row untouched.
  fixture.database.exec("DROP TABLE featured_widget_slots");
  fixture.database.exec("PRAGMA user_version = 3");
  await runMigrations(fixture);

  const slots = await readFeaturedWidgetSlots(fixture);
  assert.equal(slots.length, FEATURED_WIDGET_SLOT_COUNT);
  assert.deepEqual(
    slots.map(({ slotIndex, state }) => ({ slotIndex, state })),
    [1, 2, 3, 4, 5].map((slotIndex) => ({ slotIndex, state: "empty" })),
  );
  assert.equal(
    fixture.database.prepare("SELECT COUNT(*) AS count FROM gallery_items").get().count,
    1,
  );
});

test("slot bounds are enforced by the schema", async () => {
  const fixture = await createFixture();
  fixture.insertArtefact("outside");

  assert.throws(() => {
    fixture.database
      .prepare(
        "INSERT INTO featured_widget_slots (slot_index, artefact_id, assigned_at, updated_at) VALUES (?, ?, ?, ?)",
      )
      .run(6, "outside", 1, 1);
  }, /CHECK constraint failed/);
});

test("assignment fills the lowest genuinely empty slot and reports duplicates", async () => {
  const fixture = await createFixture();
  assert.deepEqual(await fixture.assign("first"), { status: "assigned", slotIndex: 1 });
  assert.deepEqual(await fixture.assign("second"), { status: "assigned", slotIndex: 2 });
  assert.deepEqual(await fixture.assign("first"), { status: "duplicate", slotIndex: 1 });
});

test("five active rows reserve capacity and the sixth returns a typed full outcome", async () => {
  const fixture = await createFixture();
  for (let index = 1; index <= FEATURED_WIDGET_SLOT_COUNT; index += 1) {
    assert.deepEqual(await fixture.assign(`artefact-${index}`), {
      status: "assigned",
      slotIndex: index,
    });
  }

  assert.deepEqual(await fixture.assign("overflow"), { status: "full" });
  assert.deepEqual(await fixture.assign("artefact-1"), { status: "duplicate", slotIndex: 1 });
});

test("the partial unique index prevents one active artefact occupying two slots", async () => {
  const fixture = await createFixture();
  await fixture.assign("unique");

  assert.throws(() => {
    fixture.database
      .prepare(
        "INSERT INTO featured_widget_slots (slot_index, artefact_id, assigned_at, updated_at) VALUES (?, ?, ?, ?)",
      )
      .run(2, "unique", 20, 20);
  }, /UNIQUE constraint failed/);
});

test("a tombstoned binding is empty and its number is reused first", async () => {
  const fixture = await createFixture();
  await fixture.assign("one");
  await fixture.assign("two");
  await tombstoneFeaturedWidgetSlot(1, 100, fixture);

  assert.deepEqual(await fixture.assign("replacement"), { status: "assigned", slotIndex: 1 });
});

test("soft-deleted source content reserves its slot and Undo restores it", async () => {
  const fixture = await createFixture();
  await fixture.assign("undo-target");
  assert.equal(
    await isFeaturedWidgetSourceAvailable("2026-07-15", "entry", "undo-target", fixture),
    true,
  );

  await softDeleteArtefact("undo-target", 100, fixture);
  assert.equal((await readFeaturedWidgetSlots(fixture))[0].state, "unavailable");
  assert.equal(
    await isFeaturedWidgetSourceAvailable("2026-07-15", "entry", "undo-target", fixture),
    false,
  );
  assert.deepEqual(await fixture.assign("second"), { status: "assigned", slotIndex: 2 });
  await fixture.assign("third");
  await fixture.assign("fourth");
  await fixture.assign("fifth");
  assert.deepEqual(await fixture.assign("reserved-overflow"), { status: "full" });

  await restoreArtefact("undo-target", 101, fixture);
  assert.equal((await readFeaturedWidgetSlots(fixture))[0].state, "featured");
  assert.equal(
    await isFeaturedWidgetSourceAvailable("2026-07-15", "entry", "undo-target", fixture),
    true,
  );

  await softDeleteEntry("entry", 102, fixture);
  assert.equal((await readFeaturedWidgetSlots(fixture))[0].state, "unavailable");
  await restoreEntry("entry", 103, fixture);
  assert.equal((await readFeaturedWidgetSlots(fixture))[0].state, "featured");
});
