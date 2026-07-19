import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { CalendarNavigationCoordinator } from "../src/data/calendarNavigationTransition.ts";
import { PaperContentReadinessLatch } from "../src/data/paperContentReadiness.ts";

const dayPagerSource = readFileSync(
  new URL("../src/components/DayPager.tsx", import.meta.url),
  "utf8",
);
const collapsedDeckSource = readFileSync(
  new URL("../src/components/CollapsedDeck.tsx", import.meta.url),
  "utf8",
);

test("calendar navigation waits for data, sheet dismissal, and exit before releasing a Day", () => {
  const coordinator = new CalendarNavigationCoordinator();
  const requestId = coordinator.begin("2026-07-18", "entry-2");
  const entries = [{ id: "entry-2", date: "2026-07-18", artefacts: [] }];

  assert.equal(coordinator.resolve(requestId, entries), null);
  assert.equal(coordinator.sheetDismissed(requestId), true);
  assert.deepEqual(coordinator.exitFinished(requestId), {
    day: "2026-07-18",
    entryId: "entry-2",
    entries,
  });
  assert.equal(coordinator.sheetDismissed(requestId), false);
});

test("calendar navigation releases when the Day resolves after dismissal and exit", () => {
  const coordinator = new CalendarNavigationCoordinator();
  const requestId = coordinator.begin("2026-07-18", null);
  const entries = [{ id: "entry-1", date: "2026-07-18", artefacts: [] }];

  assert.equal(coordinator.sheetDismissed(requestId), true);
  assert.equal(coordinator.exitFinished(requestId), null);
  assert.deepEqual(coordinator.resolve(requestId, entries), {
    day: "2026-07-18",
    entryId: null,
    entries,
  });
});

test("cancelling calendar navigation ignores a late Day result", () => {
  const coordinator = new CalendarNavigationCoordinator();
  const requestId = coordinator.begin("2026-07-17", null);

  coordinator.cancel();
  coordinator.sheetDismissed(requestId);

  assert.equal(coordinator.resolve(requestId, []), null);
  assert.equal(coordinator.exitFinished(requestId), null);
});

test("only the active calendar request can report a load failure", () => {
  const coordinator = new CalendarNavigationCoordinator();
  const staleRequestId = coordinator.begin("2026-07-16", null);
  const activeRequestId = coordinator.begin("2026-07-17", null);

  assert.equal(coordinator.reject(staleRequestId), false);
  assert.equal(coordinator.reject(activeRequestId), true);
  assert.equal(coordinator.sheetDismissed(activeRequestId), false);
});

test("a stale sheet settlement cannot dismiss the active calendar request", () => {
  const coordinator = new CalendarNavigationCoordinator();
  const staleRequestId = coordinator.begin("2026-07-16", null);
  const activeRequestId = coordinator.begin("2026-07-17", null);
  const entries = [{ id: "entry-1", date: "2026-07-17", artefacts: [] }];

  assert.equal(coordinator.sheetDismissed(staleRequestId), false);
  assert.equal(coordinator.resolve(activeRequestId, entries), null);
  assert.equal(coordinator.sheetDismissed(activeRequestId), true);
  assert.deepEqual(coordinator.exitFinished(activeRequestId), {
    day: "2026-07-17",
    entryId: null,
    entries,
  });
});

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
  const readiness = new PaperContentReadinessLatch();

  assert.equal(readiness.contentReady("paper-document-a", null), false);
  assert.equal(readiness.request("paper-document-a", 8), true);
  assert.equal(readiness.request("paper-document-a", 8), false);
});

test("Paper readiness never carries across a changed document", () => {
  const readiness = new PaperContentReadinessLatch();

  readiness.contentReady("paper-document-a", null);

  assert.equal(readiness.request("paper-document-b", 9), false);
  assert.equal(readiness.request("paper-document-a", 10), false);
  assert.equal(readiness.contentReady("paper-document-b", 9), true);
});
