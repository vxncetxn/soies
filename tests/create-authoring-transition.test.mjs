import assert from "node:assert/strict";
import test from "node:test";

import {
  createAuthoringDisplayMode,
  createAuthoringExpandedTarget,
  createAuthoringReducer,
  createAuthoringState,
} from "../src/hooks/createAuthoringTransition.ts";

test("Type settles only after the matching Ease motion finishes", () => {
  const opening = createAuthoringReducer(createAuthoringState(), {
    type: "requestMode",
    mode: "type",
    requestId: 1,
  });

  assert.deepEqual(opening, {
    phase: "transitioning",
    fromMode: "default",
    targetMode: "type",
    requestId: 1,
  });
  assert.equal(createAuthoringReducer(opening, { type: "motionFinished", requestId: 0 }), opening);
  assert.deepEqual(createAuthoringReducer(opening, { type: "motionFinished", requestId: 1 }), {
    phase: "settled",
    mode: "type",
    requestId: null,
  });
});

test("a blur reverses an opening Type session and supersedes its completion", () => {
  const opening = createAuthoringReducer(createAuthoringState(), {
    type: "requestMode",
    mode: "type",
    requestId: 2,
  });
  const closing = createAuthoringReducer(opening, {
    type: "requestMode",
    mode: "default",
    requestId: 3,
  });

  assert.equal(createAuthoringExpandedTarget(closing), false);
  assert.equal(createAuthoringDisplayMode(closing), "type");
  assert.equal(createAuthoringReducer(closing, { type: "motionFinished", requestId: 2 }), closing);
  assert.deepEqual(
    createAuthoringReducer(closing, { type: "motionFinished", requestId: 3 }),
    createAuthoringState(),
  );
});

test("Scribble stays rendered through exit and dismissal freezes late events", () => {
  const scribble = { phase: "settled", mode: "scribble", requestId: null };
  const closing = createAuthoringReducer(scribble, {
    type: "requestMode",
    mode: "default",
    requestId: 4,
  });

  assert.equal(createAuthoringDisplayMode(closing), "scribble");

  const dismissing = createAuthoringReducer(closing, { type: "dismiss" });
  assert.deepEqual(dismissing, {
    phase: "dismissing",
    mode: "default",
    requestId: null,
  });
  assert.equal(
    createAuthoringReducer(dismissing, {
      type: "requestMode",
      mode: "type",
      requestId: 5,
    }),
    dismissing,
  );
  assert.equal(
    createAuthoringReducer(dismissing, { type: "motionFinished", requestId: 4 }),
    dismissing,
  );
});
