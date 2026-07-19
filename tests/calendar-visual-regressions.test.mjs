import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";

import { runMigrations } from "../src/db/migrations.ts";

const readSource = (relativePath) =>
  readFile(new URL(`../${relativePath}`, import.meta.url), "utf8");

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

function styleBlock(source, name) {
  const match = source.match(new RegExp(`${name}: \\{([\\s\\S]*?)\\n  \\},`));
  assert.ok(match, `Expected ${name} style`);
  return match[1];
}

function numericStyleValue(block, property) {
  const match = block.match(new RegExp(`${property}: (\\d+)`));
  assert.ok(match, `Expected numeric ${property} style`);
  return Number(match[1]);
}

test("version-four development seed Users are repaired to the January 2026 boundary", async () => {
  const fixture = createExecutor();
  await runMigrations(fixture);
  fixture.database
    .prepare(
      `INSERT INTO users (
         id, name, email, avatar_path, creation_day, created_at, updated_at, deleted_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run("seed-user", "User", null, null, "2026-07-16", 1, 1, null);
  fixture.database
    .prepare(
      `INSERT INTO users (
         id, name, email, avatar_path, creation_day, created_at, updated_at, deleted_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run("ordinary-user", "Alex", null, null, "2025-11-09", 2, 2, null);

  const insertEntry = fixture.database.prepare(
    `INSERT INTO entries (
       id, title, type, date, sort_order, created_at, updated_at, deleted_at
     ) VALUES (?, ?, 'paper', '2026-07-16', 0, 1, 1, NULL)`,
  );
  insertEntry.run("seed-long", "An example entry that is very long");
  insertEntry.run("seed-print", "kiyomizudera");
  insertEntry.run("seed-retro", "day in retro");
  fixture.database
    .prepare(
      "INSERT INTO tags (id, name, created_at, updated_at, deleted_at) VALUES (?, ?, 1, 1, NULL)",
    )
    .run("seed-tag", "Japan 2026");

  // Recreate the on-device upgrade state reported in IMG_8970: this database
  // already ran V4 with the old seed User's real July timestamp.
  fixture.database.exec("PRAGMA user_version = 4");
  await runMigrations(fixture);

  assert.equal(
    fixture.database.prepare("SELECT creation_day FROM users WHERE id = 'seed-user'").get()
      .creation_day,
    "2026-01-01",
  );
  assert.equal(
    fixture.database.prepare("SELECT created_at FROM users WHERE id = 'seed-user'").get()
      .created_at,
    Date.UTC(2026, 0, 1, 12),
  );
  assert.equal(
    fixture.database.prepare("SELECT creation_day FROM users WHERE id = 'ordinary-user'").get()
      .creation_day,
    "2025-11-09",
  );
  assert.equal(fixture.database.prepare("PRAGMA user_version").get().user_version, 5);
});

test("Calendar keeps prepared tab trees mounted and eagerly renders the first screen", async () => {
  const [sheet, recent] = await Promise.all([
    readSource("src/components/CalendarSheet.tsx"),
    readSource("src/components/CalendarRecentTab.tsx"),
  ]);

  assert.doesNotMatch(sheet, /setContentMounted\(false\)/);
  assert.doesNotMatch(sheet, /if \(!isActive && tab !== outgoingTab\)/);
  assert.doesNotMatch(sheet, /recent:\$\{sessionKey\}/);
  assert.doesNotMatch(sheet, /monthly:\$\{sessionKey\}/);
  assert.doesNotMatch(sheet, /tabProgress/);
  assert.match(sheet, /recentOpacity/);
  assert.match(sheet, /monthlyOpacity/);
  assert.match(sheet, /accessibilityElementsHidden=\{!isActive\}/);
  assert.match(sheet, /importantForAccessibility=/);
  assert.match(recent, /EAGER_PREVIEW_ROW_COUNT/);
  assert.match(
    recent,
    /index < EAGER_PREVIEW_ROW_COUNT\s*\|\|\s*visibleEntryIds\.has\(entry\.id\)/,
  );
});

test("Calendar sheet clips its white content to the shared top radius", async () => {
  const sheet = await readSource("src/components/CalendarSheet.tsx");
  const surface = styleBlock(sheet, "surface");
  const viewport = styleBlock(sheet, "sheetViewport");

  assert.match(sheet, /const SHEET_RADIUS = 24/);
  assert.match(surface, /borderTopLeftRadius: SHEET_RADIUS/);
  assert.match(surface, /borderTopRightRadius: SHEET_RADIUS/);
  assert.match(viewport, /borderTopLeftRadius: SHEET_RADIUS/);
  assert.match(viewport, /borderTopRightRadius: SHEET_RADIUS/);
  assert.match(viewport, /overflow: "hidden"/);
  assert.match(sheet, /radius=\{SHEET_RADIUS\}/);
});

test("Calendar header uses an opaque scrim before a short fade below its text", async () => {
  const sheet = await readSource("src/components/CalendarSheet.tsx");

  assert.match(sheet, /RECENT_HEADER_OPAQUE_HEIGHT/);
  assert.match(sheet, /MONTHLY_HEADER_OPAQUE_HEIGHT/);
  assert.match(sheet, /styles\.headerScrim/);
  assert.match(sheet, /styles\.headerFade/);
  assert.match(sheet, /top=\{0\}/);
});

test("Monthly selection underline sits fully above marker dots", async () => {
  const monthly = await readSource("src/components/CalendarMonthlyTab.tsx");
  const underline = styleBlock(monthly, "selectedUnderline");
  const markerRow = styleBlock(monthly, "markerRow");
  const marker = styleBlock(monthly, "marker");

  const underlineBottom = numericStyleValue(underline, "bottom");
  const markerBottom = numericStyleValue(markerRow, "bottom");
  const markerHeight = numericStyleValue(marker, "height");
  assert.ok(underlineBottom > markerBottom + markerHeight);
});

test("Recent Artefact silhouettes use horizontal-only Home stack offsets", async () => {
  const preview = await readSource("src/components/CalendarEntryPreview.tsx");

  assert.match(preview, /translateX/);
  assert.match(preview, /LAYOUT\.STACK_OFFSET/);
  assert.doesNotMatch(preview, /translateY/);
});
