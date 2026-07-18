import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";

import { runMigrations } from "../src/db/migrations.ts";
import { getEntryTypePresence, getRecentEntryPreviewPage } from "../src/db/repositories/entries.ts";

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
  const fixture = createExecutor();
  await runMigrations(fixture);
  const insertEntry = (id, date, sortOrder, type = "paper") => {
    fixture.database
      .prepare(
        "INSERT INTO entries (id, title, type, date, sort_order, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
      )
      .run(id, id, type, date, sortOrder, 1, 1);
  };
  const insertArtefact = (id, entryId, sortOrder, text) => {
    fixture.database
      .prepare(
        "INSERT INTO artefacts (id, entry_id, type, sort_order, data, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
      )
      .run(id, entryId, "paper", sortOrder, JSON.stringify({ text }), 1, 1);
  };
  return { ...fixture, insertEntry, insertArtefact };
}

test("Recent preview pages are newest-first and hydrate only the first Artefact", async () => {
  const fixture = await createFixture();
  fixture.insertEntry("newer", "2026-07-18", 2);
  fixture.insertEntry("older", "2026-07-18", 1);
  fixture.insertEntry("previous-day", "2026-07-17", 9);
  fixture.insertArtefact("newer-2", "newer", 2, "hidden");
  fixture.insertArtefact("newer-0", "newer", 0, "first");
  fixture.insertArtefact("newer-1", "newer", 1, "hidden too");
  fixture.insertArtefact("newer-3", "newer", 3, "hidden three");
  fixture.insertArtefact("newer-4", "newer", 4, "hidden four");
  fixture.insertArtefact("older-0", "older", 0, "deleted first");
  fixture.insertArtefact("older-1", "older", 1, "older surviving first");
  fixture.database.prepare("UPDATE artefacts SET deleted_at = 10 WHERE id = 'older-0'").run();

  const page = await getRecentEntryPreviewPage(null, 2, fixture);

  assert.deepEqual(
    page.items.map(({ id, artefactCount, firstArtefact }) => ({
      id,
      artefactCount,
      text: firstArtefact?.text,
    })),
    [
      { id: "newer", artefactCount: 5, text: "first" },
      { id: "older", artefactCount: 1, text: "older surviving first" },
    ],
  );
  assert.equal(page.hasMore, true);
  assert.deepEqual(page.nextCursor, {
    date: "2026-07-18",
    sortOrder: 1,
    id: "older",
  });

  const nextPage = await getRecentEntryPreviewPage(page.nextCursor, 2, fixture);
  assert.deepEqual(
    nextPage.items.map(({ id }) => id),
    ["previous-day"],
  );
  assert.equal(nextPage.hasMore, false);
});

test("Monthly markers return distinct Entry-type presence inside the requested Days", async () => {
  const fixture = await createFixture();
  fixture.insertEntry("paper-1", "2026-07-18", 0, "paper");
  fixture.insertEntry("paper-2", "2026-07-18", 1, "paper");
  fixture.insertEntry("print", "2026-07-18", 2, "print");
  fixture.insertEntry("future", "2026-08-01", 0, "print");
  fixture.insertEntry("unknown", "2026-07-17", 0, "video");
  fixture.database.prepare("UPDATE entries SET deleted_at = 10 WHERE id = 'paper-2'").run();

  assert.deepEqual(await getEntryTypePresence("2026-07-01", "2026-07-31", fixture), [
    { day: "2026-07-17", types: ["video"] },
    { day: "2026-07-18", types: ["paper", "print"] },
  ]);
});

test("Recent keyset ordering uses the bounded active-entry index", async () => {
  const fixture = await createFixture();
  const plan = fixture.database
    .prepare(
      `EXPLAIN QUERY PLAN
       SELECT id, date, sort_order
       FROM entries
       WHERE deleted_at IS NULL
       ORDER BY date DESC, sort_order DESC, id DESC
       LIMIT 26`,
    )
    .all()
    .map(({ detail }) => String(detail));

  assert.equal(
    plan.some((detail) => detail.includes("idx_entries_recent_active")),
    true,
  );
  assert.equal(
    plan.some((detail) => detail.includes("TEMP B-TREE FOR ORDER BY")),
    false,
  );
});
