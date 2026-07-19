import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";

import { LAYOUT } from "../src/constants/layout.ts";
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

test("Recent labels each Day group and uses one fixed card surface without scroll focus", async () => {
  const [sheet, recent, preview] = await Promise.all([
    readSource("src/components/CalendarSheet.tsx"),
    readSource("src/components/CalendarRecentTab.tsx"),
    readSource("src/components/CalendarEntryPreview.tsx"),
  ]);

  assert.doesNotMatch(sheet, /recentFocusedDay/);
  assert.match(sheet, /activeTab === "monthly"[\s\S]{0,160}<Heading/);
  assert.match(recent, /rows\[index - 1\]\?\.day !== item\.day/);
  assert.match(recent, /formatRecentDayLabel\(item\.day\)/);
  assert.doesNotMatch(recent, /resolveFocusedPeriod|FOCUS_HYSTERESIS|focusedDay/);
  assert.doesNotMatch(preview, /\bfocused\b/);
  assert.match(preview, /#F8F8F8/);
  assert.match(recent, /styles\.loadingDayLabel/);
  assert.match(recent, /#F8F8F8/);
  assert.doesNotMatch(recent, /Array\.from\(\{ length: \d+ \}/);
});

test("Calendar scrollables keep boundary pulls instead of handing them to the sheet", async () => {
  const [sheet, recent, monthly] = await Promise.all([
    readSource("src/components/CalendarSheet.tsx"),
    readSource("src/components/CalendarRecentTab.tsx"),
    readSource("src/components/CalendarMonthlyTab.tsx"),
  ]);

  assert.match(sheet, /disableScrollableNegotiation/);
  assert.match(sheet, /scrollEnabled=\{activeTab === "recent"\}/);
  assert.match(sheet, /scrollEnabled=\{activeTab === "monthly"\}/);
  assert.match(recent, /scrollEnabled=\{scrollEnabled\}/);
  assert.match(monthly, /scrollEnabled=\{scrollEnabled\}/);
  assert.match(sheet, /styles\.tabBody/);
  assert.match(
    sheet,
    /styles\.tabBody,[\s\S]{0,180}tab === "recent"[\s\S]{0,100}CALENDAR_SHEET\.RECENT_HEADER_HEIGHT[\s\S]{0,100}CALENDAR_SHEET\.MONTHLY_HEADER_HEIGHT/,
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
  const [sheet, recent] = await Promise.all([
    readSource("src/components/CalendarSheet.tsx"),
    readSource("src/components/CalendarRecentTab.tsx"),
  ]);

  assert.equal(LAYOUT.CALENDAR_SHEET.RECENT_HEADER_HEIGHT, 94);
  assert.equal(LAYOUT.CALENDAR_SHEET.RECENT_CONTENT_TOP, 130);
  assert.equal(LAYOUT.CALENDAR_SHEET.HEADER_FADE_HEIGHT, 36);
  assert.equal(
    LAYOUT.CALENDAR_SHEET.RECENT_CONTENT_TOP - LAYOUT.CALENDAR_SHEET.RECENT_HEADER_HEIGHT,
    LAYOUT.CALENDAR_SHEET.HEADER_FADE_HEIGHT,
  );
  assert.equal(LAYOUT.CALENDAR_SHEET.MONTHLY_CONTENT_TOP, 214);
  assert.match(recent, /RECENT_CONTENT_INSET/);
  assert.match(sheet, /CALENDAR_SHEET\.MONTHLY_HEADER_HEIGHT/);
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

test("Monthly labels Day one and derives its final bound from the real viewport", async () => {
  const monthly = await readSource("src/components/CalendarMonthlyTab.tsx");

  assert.match(monthly, /formatMonthIndicator\(monthId\)/);
  assert.match(monthly, /day\.id === `\$\{monthId\}-01`/);
  assert.match(monthly, /finalMonthTrailingPadding\(\s*viewportHeight/);
  assert.match(monthly, /setViewportHeight/);
  assert.doesNotMatch(monthly, /MIN_BOTTOM_PADDING/);
  assert.doesNotMatch(monthly, /window\.height\s*-\s*LAYOUT\.CALENDAR_SHEET\.MONTHLY_CONTENT_TOP/);
});

test("Recent Artefact silhouettes use horizontal-only Home stack offsets", async () => {
  const preview = await readSource("src/components/CalendarEntryPreview.tsx");

  assert.match(preview, /translateX/);
  assert.match(preview, /LAYOUT\.STACK_OFFSET/);
  assert.doesNotMatch(preview, /translateY/);
});
