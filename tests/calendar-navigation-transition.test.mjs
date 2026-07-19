import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { ContentReadinessLatch } from "../src/data/contentReadiness.ts";
import { targetForCreateDismissal } from "../src/data/createTransition.ts";
import {
  buildPreparedHomeTransition,
  resolvePreparedHomeEntry,
} from "../src/data/preparedHomeHandoff.ts";

const dayPagerSource = readFileSync(
  new URL("../src/components/DayPager.tsx", import.meta.url),
  "utf8",
);
const collapsedDeckSource = readFileSync(
  new URL("../src/components/CollapsedDeck.tsx", import.meta.url),
  "utf8",
);

test("calendar handoff gives each canonical Entry and Artefact a durable native owner", () => {
  assert.match(
    dayPagerSource,
    /entries\.map\(\(entry\) =>[\s\S]*?key=\{entry\.id\}/,
    "a different Entry at the same Day index must not inherit the previous Stack's native views",
  );
  assert.match(
    collapsedDeckSource,
    /entry\.artefacts\.map\(\(artefact, index\) =>[\s\S]*?<ArtefactWrapper[\s\S]*?key=\{artefact\.id\}/,
    "a different Artefact at the same stack index must not reuse the previous TextKit view",
  );
});

test("an already-laid-out Paper satisfies a later same-Day readiness request", () => {
  const readiness = new ContentReadinessLatch();

  assert.equal(readiness.contentReady("paper-document-a", null), false);
  assert.equal(readiness.request("paper-document-a", 8), true);
  assert.equal(readiness.request("paper-document-a", 8), false);
});

test("Paper readiness never carries across a changed document", () => {
  const readiness = new ContentReadinessLatch();

  readiness.contentReady("paper-document-a", null);

  assert.equal(readiness.request("paper-document-b", 9), false);
  assert.equal(readiness.request("paper-document-a", 10), false);
  assert.equal(readiness.contentReady("paper-document-b", 9), true);
});

test("an already-terminal Print image satisfies a later same-Day request", () => {
  const readiness = new ContentReadinessLatch();

  // Display and terminal error intentionally share this same readiness edge.
  assert.equal(readiness.contentReady("print-source-a", null), false);
  assert.equal(readiness.request("print-source-a", 11), true);
  assert.equal(readiness.request("print-source-a", 11), false);
  assert.equal(readiness.request("print-source-b", 12), false);
});

test("a stale exact Entry target consistently falls back to the Day's first Entry", () => {
  const first = { id: "entry-a" };
  const second = { id: "entry-b" };

  assert.equal(
    resolvePreparedHomeEntry({ day: "2026-07-20", entryId: "missing", entries: [first, second] }),
    first,
  );
  assert.equal(
    resolvePreparedHomeEntry({ day: "2026-07-20", entryId: "entry-b", entries: [first, second] }),
    second,
  );
  assert.equal(
    resolvePreparedHomeEntry({ day: "2026-07-20", entryId: "missing", entries: [] }),
    null,
  );
});

test("Create Cancel reuses Home while Save targets a prepared Home handoff", () => {
  assert.equal(targetForCreateDismissal("cancel"), "home");
  assert.equal(targetForCreateDismissal("save"), "prepared-home");
});

test("Save reload selects the newest Entry and preserves reload failure for Home", () => {
  const entries = [{ id: "entry-a" }, { id: "entry-newest" }];
  const success = buildPreparedHomeTransition({
    requestId: 31,
    day: "2026-07-20",
    origin: "save",
    entries,
  });

  assert.equal(success.entryId, "entry-newest");
  assert.equal(success.error, null);

  const error = new Error("reload failed");
  const failure = buildPreparedHomeTransition({
    requestId: 32,
    day: "2026-07-20",
    origin: "save",
    error,
  });
  assert.equal(failure.error, error);
  assert.deepEqual(failure.entries, []);
  assert.equal(failure.entryId, null);
});
