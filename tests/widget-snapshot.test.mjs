import assert from "node:assert/strict";
import test from "node:test";

import {
  buildFeaturedWidgetSnapshot,
  occupiedWidgetUrl,
  parseFeaturedWidgetSlotKey,
} from "../src/widgets/widgetSnapshot.ts";

const empty = (slotIndex) => ({ slotIndex, state: "empty" });
const unavailable = (slotIndex) => ({
  slotIndex,
  state: "unavailable",
  artefactId: `artefact-${slotIndex}`,
  assignedAt: 1,
  updatedAt: 1,
});
const featured = (slotIndex) => ({
  slotIndex,
  state: "featured",
  artefact: { id: `artefact ${slotIndex}`, text: "Text" },
  entryId: `entry ${slotIndex}`,
  entryTitle: `Entry ${slotIndex}`,
  entryDate: "2026-07-15",
  assignedAt: 1,
  updatedAt: 1,
  frameRevision: 7,
});

test("snapshot always maps all five keyed configurations and localized metadata", () => {
  const snapshot = buildFeaturedWidgetSnapshot(
    [featured(1), empty(2), unavailable(3), featured(4), empty(5)],
    (slot) => (slot.state === "featured" ? `file:///frame-${slot.slotIndex}.png` : undefined),
    () => "15 July 2026",
  );

  assert.deepEqual(Object.keys(snapshot.slots), ["slot1", "slot2", "slot3", "slot4", "slot5"]);
  assert.equal(snapshot.slots.slot1.entryTitle, "Entry 1");
  assert.equal(snapshot.slots.slot1.displayDate, "15 July 2026");
  assert.equal(snapshot.slots.slot2.state, "empty");
  assert.equal(snapshot.slots.slot3.state, "unavailable");
  assert.equal(snapshot.slots.slot4.frameUri, "file:///frame-4.png");
});

test("featured state remains addressable when its image cache is missing", () => {
  const snapshot = buildFeaturedWidgetSnapshot(
    [featured(1), empty(2), empty(3), empty(4), empty(5)],
    () => undefined,
    () => "15 July 2026",
  );

  assert.equal(snapshot.slots.slot1.state, "featured");
  assert.equal(snapshot.slots.slot1.frameUri, undefined);
  assert.match(snapshot.slots.slot1.url, /widgetEntryId=entry%201/);
});

test("deep links encode exact source identity and configuration parsing is bounded", () => {
  assert.equal(
    occupiedWidgetUrl(5, "2026-07-15", "entry/id", "artefact id"),
    "soies:///?widgetSlot=5&date=2026-07-15&widgetEntryId=entry%2Fid&widgetArtefactId=artefact%20id",
  );
  assert.equal(parseFeaturedWidgetSlotKey("slot5"), 5);
  assert.equal(parseFeaturedWidgetSlotKey("slot9"), 1);
  assert.equal(parseFeaturedWidgetSlotKey(undefined), 1);
});
