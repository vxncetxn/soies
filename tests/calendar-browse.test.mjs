import assert from "node:assert/strict";
import test from "node:test";

import {
  formatMonthlyHeading,
  formatRecentHeading,
  monthBounds,
  monthIdsBetween,
  nextMonthId,
  packRecentEntryRows,
  previousMonthId,
  resolveFocusedPeriod,
  takeStableRecentPage,
} from "../src/data/calendarBrowse.ts";
import { DayEntriesCache } from "../src/data/entriesCache.ts";
import { isValidISODate, validISODateOr } from "../src/utils/date.ts";

const preview = (id, date) => ({
  id,
  date,
  title: id,
  type: "paper",
  sortOrder: Number(id.replace(/\D/g, "")) || 0,
  artefactCount: 1,
  firstArtefact: { id: `${id}-artefact`, text: id },
});

test("strict ISO Days accept real calendar dates and reject normalized input", () => {
  assert.equal(isValidISODate("2028-02-29"), true);
  assert.equal(isValidISODate("2026-02-29"), false);
  assert.equal(isValidISODate("2026-99-01"), false);
  assert.equal(isValidISODate("2026-04-31"), false);
  assert.equal(isValidISODate("2026-7-01"), false);
  assert.equal(isValidISODate("not-a-day"), false);
});

test("external Day input falls back instead of normalizing", () => {
  assert.equal(validISODateOr("2026-07-18", "2026-01-01"), "2026-07-18");
  assert.equal(validISODateOr("2026-02-30", "2026-01-01"), "2026-01-01");
  assert.equal(validISODateOr(undefined, "2026-01-01"), "2026-01-01");
  assert.equal(validISODateOr(["2026-07-18"], "2026-01-01"), "2026-01-01");
});

test("Recent rows pack at most two Entries without mixing Days", () => {
  const rows = packRecentEntryRows([
    preview("e1", "2026-07-18"),
    preview("e2", "2026-07-18"),
    preview("e3", "2026-07-18"),
    preview("e4", "2026-07-17"),
    preview("e5", "2026-07-16"),
    preview("e6", "2026-07-16"),
  ]);

  assert.deepEqual(
    rows.map((row) => ({ day: row.day, ids: row.entries.map((entry) => entry.id) })),
    [
      { day: "2026-07-18", ids: ["e1", "e2"] },
      { day: "2026-07-18", ids: ["e3"] },
      { day: "2026-07-17", ids: ["e4"] },
      { day: "2026-07-16", ids: ["e5", "e6"] },
    ],
  );
});

test("Recent pagination includes one lookahead Entry to avoid reshaping a row", () => {
  const fetched = [
    preview("e1", "2026-07-18"),
    preview("e2", "2026-07-18"),
    preview("e3", "2026-07-17"),
    preview("e4", "2026-07-16"),
    preview("e5", "2026-07-16"),
    preview("e6", "2026-07-15"),
  ];

  const page = takeStableRecentPage(fetched, 4);
  assert.deepEqual(
    page.items.map((entry) => entry.id),
    ["e1", "e2", "e3", "e4", "e5"],
  );
  assert.equal(page.hasMore, true);

  const rows = packRecentEntryRows(page.items);
  assert.deepEqual(
    rows.at(-1).entries.map((entry) => entry.id),
    ["e4", "e5"],
  );
});

test("calendar headings use the fixed lowercase English mockup format", () => {
  assert.deepEqual(formatRecentHeading("2026-09-30"), {
    text: "30 september",
    year: "2026",
  });
  assert.deepEqual(formatMonthlyHeading("2026-09"), {
    text: "september",
    year: "2026",
  });
});

test("Day cache evicts the least recently used Day at its bound", () => {
  const cache = new DayEntriesCache(2);
  cache.set("2026-07-16", []);
  cache.set("2026-07-17", []);
  cache.get("2026-07-16");
  cache.set("2026-07-18", []);

  assert.equal(cache.has("2026-07-16"), true);
  assert.equal(cache.has("2026-07-17"), false);
  assert.equal(cache.has("2026-07-18"), true);
  assert.equal(cache.size, 2);
});

test("Day cache deduplicates concurrent loads", async () => {
  const cache = new DayEntriesCache(2);
  let calls = 0;
  const loader = async () => {
    calls += 1;
    await Promise.resolve();
    return [preview("e1", "2026-07-18")];
  };

  const [first, second] = await Promise.all([
    cache.load("2026-07-18", loader),
    cache.load("2026-07-18", loader),
  ]);
  assert.equal(calls, 1);
  assert.equal(first, second);
  assert.equal(cache.get("2026-07-18"), first);
});

test("Day cache never retains a rejected or invalidated load", async () => {
  const cache = new DayEntriesCache(2);
  let calls = 0;
  await assert.rejects(
    cache.load("2026-07-18", async () => {
      calls += 1;
      throw new Error("fixture failure");
    }),
    /fixture failure/,
  );
  assert.equal(cache.has("2026-07-18"), false);

  const recovered = await cache.load("2026-07-18", async () => {
    calls += 1;
    return [];
  });
  assert.deepEqual(recovered, []);
  assert.equal(calls, 2);

  let resolveLoad;
  const staleLoad = cache.load(
    "2026-07-17",
    () =>
      new Promise((resolve) => {
        resolveLoad = resolve;
      }),
  );
  cache.invalidate("2026-07-17");
  resolveLoad([]);
  await staleLoad;
  assert.equal(cache.has("2026-07-17"), false);
});

test("Focused period follows the 40 percent reading line with hysteresis", () => {
  const frames = [
    { id: "first", start: 0, end: 100 },
    { id: "second", start: 100, end: 200 },
    { id: "third", start: 200, end: 300 },
  ];

  assert.equal(resolveFocusedPeriod(frames, 0, 250, null, 12), "second");
  assert.equal(resolveFocusedPeriod(frames, 8, 250, "first", 12), "first");
  assert.equal(resolveFocusedPeriod(frames, 20, 250, "first", 12), "second");
  assert.equal(resolveFocusedPeriod(frames, 400, 250, "second", 12), "third");
  assert.equal(
    resolveFocusedPeriod(
      [
        { id: "before-gap", start: 0, end: 90 },
        { id: "after-gap", start: 110, end: 200 },
      ],
      100,
      0,
      null,
      0,
    ),
    "before-gap",
  );
});

test("Monthly range includes the User Creation Month through the current month", () => {
  assert.deepEqual(monthIdsBetween("2025-11-20", "2026-02-03"), [
    "2025-11",
    "2025-12",
    "2026-01",
    "2026-02",
  ]);
  assert.deepEqual(monthBounds("2028-02"), {
    startDay: "2028-02-01",
    endDay: "2028-02-29",
  });
  assert.equal(previousMonthId("2026-01"), "2025-12");
  assert.equal(nextMonthId("2026-12"), "2027-01");
});
