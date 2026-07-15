import assert from "node:assert/strict";
import test from "node:test";

import {
  FEATURED_WIDGET_PHASE_FADE_MS,
  featuredCarouselTarget,
  featuredPhaseForSlot,
  featuredWidgetControlsForSelection,
  featuredWidgetSheetGeometry,
  getPickerActionState,
  initialFeaturedWidgetSheetPhase,
  performFeaturedWidgetStubControl,
} from "../src/widgets/widgetSheetState.ts";

const ready = {
  busy: false,
  loading: false,
  loadError: false,
  isFull: false,
  alreadyFeatured: false,
  hasSelection: true,
};

test("picker disables full and duplicate selections with distinct typed states", () => {
  assert.deepEqual(getPickerActionState({ ...ready, isFull: true }), {
    disabled: true,
    status: "full",
  });
  assert.deepEqual(getPickerActionState({ ...ready, alreadyFeatured: true }), {
    disabled: true,
    status: "duplicate",
  });
  assert.deepEqual(getPickerActionState(ready), { disabled: false, status: "ready" });
});

test("successful selection transitions in place to the assigned slot", () => {
  const pickerSession = { phase: "picker", entry: { id: "entry" }, centeredSlot: 1 };
  assert.deepEqual(
    { ...pickerSession, ...featuredPhaseForSlot(4) },
    {
      phase: "featured",
      entry: pickerSession.entry,
      centeredSlot: 4,
    },
  );
  assert.equal(FEATURED_WIDGET_PHASE_FADE_MS, 200);
});

test("full capacity skips picker and rotation preserves the user's visible slot", () => {
  assert.equal(initialFeaturedWidgetSheetPhase(true), "featured");
  assert.equal(initialFeaturedWidgetSheetPhase(false), "picker");
  assert.equal(
    featuredCarouselTarget({ previousCenteredSlot: 1, centeredSlot: 1, selectedSlot: 4 }),
    4,
  );
  assert.equal(
    featuredCarouselTarget({ previousCenteredSlot: 1, centeredSlot: 3, selectedSlot: 4 }),
    3,
  );
  assert.deepEqual(featuredWidgetSheetGeometry(844, 47, 34), {
    sheetHeight: 720,
    bodyHeight: 634,
  });
  assert.deepEqual(featuredWidgetSheetGeometry(390, 0, 21), {
    sheetHeight: 378,
    bodyHeight: 305,
  });
});

test("reference controls perform no mutation", () => {
  const state = { slot: 2, artefactId: "unchanged" };
  assert.equal(performFeaturedWidgetStubControl(state), state);
});

test("management controls follow the currently visible slot state", () => {
  const slots = [
    { slotIndex: 1, state: "featured" },
    { slotIndex: 2, state: "empty" },
    { slotIndex: 3, state: "unavailable" },
  ];

  assert.deepEqual(featuredWidgetControlsForSelection(slots, 2), [
    { label: "Add Artefact", icon: "plus" },
  ]);
  assert.deepEqual(featuredWidgetControlsForSelection(slots, 1), [
    { label: "Replace", icon: "pencil" },
    { label: "Delete", icon: "trash" },
  ]);
  assert.deepEqual(featuredWidgetControlsForSelection(slots, 3), [
    { label: "Replace", icon: "pencil" },
    { label: "Delete", icon: "trash" },
  ]);
});
