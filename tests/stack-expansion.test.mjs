import assert from "node:assert/strict";
import test from "node:test";

import {
  createStackExpansionState,
  stackChromeVisible,
  stackExpansionReducer,
} from "../src/components/stackExpansion.ts";

test("a Stack waits for its portal before expanding and ignores stale readiness", () => {
  const preparing = stackExpansionReducer(createStackExpansionState(), {
    type: "requestExpand",
    entryId: "entry-a",
    requestId: 1,
    retainHiddenChrome: false,
  });

  assert.equal(preparing.phase, "preparing");
  assert.equal(preparing.ownerEntryId, "entry-a");
  assert.equal(
    stackExpansionReducer(preparing, {
      type: "portalReady",
      entryId: "entry-a",
      requestId: 0,
    }),
    preparing,
  );

  const expanding = stackExpansionReducer(preparing, {
    type: "portalReady",
    entryId: "entry-a",
    requestId: 1,
  });
  assert.equal(expanding.phase, "expanding");

  const expanded = stackExpansionReducer(expanding, {
    type: "motionFinished",
    requestId: 1,
  });
  assert.deepEqual(expanded, {
    phase: "expanded",
    ownerEntryId: "entry-a",
    requestId: null,
    retainHiddenChrome: false,
  });
});

test("an expanded Stack collapses through its retained portal and can reverse immediately", () => {
  const expanded = {
    phase: "expanded",
    ownerEntryId: "entry-a",
    requestId: null,
    retainHiddenChrome: false,
  };
  const collapsing = stackExpansionReducer(expanded, {
    type: "requestCollapse",
    entryId: "entry-a",
    requestId: 2,
  });

  assert.equal(collapsing.phase, "collapsing");

  const reversed = stackExpansionReducer(collapsing, {
    type: "requestExpand",
    entryId: "entry-a",
    requestId: 3,
    retainHiddenChrome: false,
  });
  assert.equal(reversed.phase, "expanding");
  assert.equal(stackExpansionReducer(reversed, { type: "motionFinished", requestId: 2 }), reversed);
  assert.equal(
    stackExpansionReducer(reversed, { type: "motionFinished", requestId: 3 }).phase,
    "expanded",
  );

  const closingAgain = stackExpansionReducer(
    { ...reversed, phase: "expanded", requestId: null },
    { type: "requestCollapse", entryId: "entry-a", requestId: 4 },
  );
  assert.deepEqual(
    stackExpansionReducer(closingAgain, { type: "motionFinished", requestId: 4 }),
    createStackExpansionState(),
  );
});

test("a widget can replace the portal owner without flashing Home chrome", () => {
  const expanded = {
    phase: "expanded",
    ownerEntryId: "entry-a",
    requestId: null,
    retainHiddenChrome: false,
  };
  const replacement = stackExpansionReducer(expanded, {
    type: "requestExpand",
    entryId: "entry-b",
    requestId: 6,
    retainHiddenChrome: true,
  });

  assert.equal(replacement.ownerEntryId, "entry-b");
  assert.equal(replacement.phase, "preparing");
  assert.equal(stackChromeVisible(replacement), false);
  assert.equal(
    stackChromeVisible(
      stackExpansionReducer(createStackExpansionState(), {
        type: "requestExpand",
        entryId: "entry-a",
        requestId: 7,
        retainHiddenChrome: false,
      }),
    ),
    true,
  );

  assert.deepEqual(
    stackExpansionReducer(replacement, {
      type: "abort",
      entryId: "entry-b",
      requestId: 6,
    }),
    createStackExpansionState(),
  );
});

test("only the owning Stack can release a retained portal when it unmounts", () => {
  const owner = {
    phase: "expanded",
    ownerEntryId: "entry-a",
    requestId: null,
    retainHiddenChrome: false,
  };

  assert.equal(stackExpansionReducer(owner, { type: "ownerUnmounted", entryId: "entry-b" }), owner);
  assert.deepEqual(
    stackExpansionReducer(owner, { type: "ownerUnmounted", entryId: "entry-a" }),
    createStackExpansionState(),
  );
});
