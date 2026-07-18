import assert from "node:assert/strict";
import test from "node:test";

import {
  hasExactWidgetSource,
  nextWidgetDeepLinkConsumption,
  parseWidgetDeepLink,
  shouldCollapseStackForWidgetTarget,
  widgetTargetForEntries,
} from "../src/widgets/widgetDeepLink.ts";

const occupied = {
  widgetSlot: "3",
  date: "2026-07-15",
  widgetEntryId: "entry-id",
  widgetArtefactId: "artefact-id",
};

test("cold occupied links parse exact slot, day, entry, and artefact", () => {
  assert.deepEqual(parseWidgetDeepLink(occupied), {
    kind: "artefact",
    slotIndex: 3,
    date: "2026-07-15",
    entryId: "entry-id",
    artefactId: "artefact-id",
  });
});

test("empty, incomplete, and unavailable-style links fall back to their slot", () => {
  assert.deepEqual(parseWidgetDeepLink({ widgetSlot: "5" }), {
    kind: "slot",
    slotIndex: 5,
  });
  assert.deepEqual(parseWidgetDeepLink({ ...occupied, widgetArtefactId: undefined }), {
    kind: "slot",
    slotIndex: 3,
  });
  assert.equal(parseWidgetDeepLink({ widgetSlot: "8" }), null);
});

test("occupied links with impossible Days fall back to their slot", () => {
  assert.deepEqual(parseWidgetDeepLink({ ...occupied, date: "2026-99-01" }), {
    kind: "slot",
    slotIndex: 3,
  });
  assert.deepEqual(parseWidgetDeepLink({ ...occupied, date: "2026-02-29" }), {
    kind: "slot",
    slotIndex: 3,
  });
});

test("warm consumption is one-shot and clearing params permits the same tap again", () => {
  const first = nextWidgetDeepLinkConsumption(null, occupied);
  assert.equal(first.target?.kind, "artefact");
  const duplicateRender = nextWidgetDeepLinkConsumption(first.signature, occupied);
  assert.equal(duplicateRender.target, null);
  const cleared = nextWidgetDeepLinkConsumption(duplicateRender.signature, {});
  assert.equal(cleared.signature, null);
  const repeatedTap = nextWidgetDeepLinkConsumption(cleared.signature, occupied);
  assert.equal(repeatedTap.target?.kind, "artefact");
});

test("pager resolution requires the exact date, entry, and artefact identities", () => {
  const target = parseWidgetDeepLink(occupied);
  assert.equal(target?.kind, "artefact");
  if (!target || target.kind !== "artefact") throw new Error("expected artefact target");
  const entries = [
    {
      id: "entry-id",
      date: "2026-07-15",
      title: "Source entry",
      type: "paper",
      artefacts: [{ id: "artefact-id", text: "Source" }],
    },
  ];
  assert.equal(hasExactWidgetSource(entries, target), true);
  assert.equal(widgetTargetForEntries(target, target.date, entries), target);
  assert.equal(widgetTargetForEntries(target, "2026-07-16", entries), null);
  assert.equal(widgetTargetForEntries(target, target.date, []), null);
});

test("a warm target collapses only portals owned by other entries", () => {
  const target = parseWidgetDeepLink(occupied);
  assert.equal(target?.kind, "artefact");
  if (!target || target.kind !== "artefact") throw new Error("expected artefact target");
  assert.equal(shouldCollapseStackForWidgetTarget("other-entry", target), true);
  assert.equal(shouldCollapseStackForWidgetTarget("entry-id", target), false);
  assert.equal(shouldCollapseStackForWidgetTarget("other-entry", null), false);
});
