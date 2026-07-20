import assert from "node:assert/strict";
import test from "node:test";

import {
  focusOverlayTargetVisible,
  focusOverlayTransitionReducer,
  focusOverlayTransitionState,
} from "../src/components/focusOverlayTransition.ts";

test("Focus opens and closes only after its matching Ease completion", () => {
  let state = focusOverlayTransitionState();

  state = focusOverlayTransitionReducer(state, {
    type: "request",
    target: "open",
    requestId: 1,
  });
  assert.equal(state.phase, "opening");
  assert.equal(focusOverlayTargetVisible(state), true);

  state = focusOverlayTransitionReducer(state, { type: "motionFinished", requestId: 1 });
  assert.equal(state.phase, "open");

  state = focusOverlayTransitionReducer(state, {
    type: "request",
    target: "closed",
    requestId: 2,
  });
  assert.equal(state.phase, "closing");
  assert.equal(focusOverlayTargetVisible(state), false);

  state = focusOverlayTransitionReducer(state, { type: "motionFinished", requestId: 2 });
  assert.equal(state.phase, "closed");
});

test("a close reversal ignores the superseded open completion", () => {
  let state = focusOverlayTransitionState();
  state = focusOverlayTransitionReducer(state, {
    type: "request",
    target: "open",
    requestId: 1,
  });
  state = focusOverlayTransitionReducer(state, {
    type: "request",
    target: "closed",
    requestId: 2,
  });

  const stale = focusOverlayTransitionReducer(state, {
    type: "motionFinished",
    requestId: 1,
  });
  assert.equal(stale, state);

  state = focusOverlayTransitionReducer(state, { type: "motionFinished", requestId: 2 });
  assert.equal(state.phase, "closed");
});

test("a delayed measurement request cannot reopen a newer closed target", () => {
  let state = focusOverlayTransitionState();
  state = focusOverlayTransitionReducer(state, {
    type: "request",
    target: "closed",
    requestId: 2,
  });
  state = focusOverlayTransitionReducer(state, {
    type: "request",
    target: "open",
    requestId: 1,
  });

  assert.equal(state.phase, "closed");
  assert.equal(state.latestRequestId, 2);
});
