import assert from "node:assert/strict";
import test from "node:test";

import {
  createEntryTransitionState,
  entryChromeVisible,
  EntryMotionCompletionQueue,
  entrySurfaceMotion,
  entryTransitionReducer,
} from "../src/entry-transition/entryTransition.ts";

test("a manual exit gate ignores stale permission and exits only for the active request", () => {
  const preparing = entryTransitionReducer(createEntryTransitionState("home"), {
    type: "begin",
    requestId: 4,
    source: "home",
    target: "prepared-home",
    exitGate: "manual",
    chromeMode: "fixed",
  });

  assert.equal(preparing.phase, "preparing");
  assert.equal(entryTransitionReducer(preparing, { type: "allowExit", requestId: 3 }), preparing);
  assert.equal(
    entryTransitionReducer(preparing, { type: "allowExit", requestId: 4 }).phase,
    "exiting",
  );
});

test("a ready target enters as soon as its source exit finishes", () => {
  const exiting = entryTransitionReducer(createEntryTransitionState("home"), {
    type: "begin",
    requestId: 5,
    source: "home",
    target: "create",
    exitGate: "immediate",
    chromeMode: "crossfade",
  });
  const mounted = entryTransitionReducer(exiting, { type: "targetMounted", requestId: 5 });
  const ready = entryTransitionReducer(mounted, { type: "targetReady", requestId: 5 });
  const entering = entryTransitionReducer(ready, { type: "sourceExitFinished", requestId: 5 });

  assert.equal(mounted.targetMounted, true);
  assert.equal(ready.phase, "exiting");
  assert.equal(entering.phase, "entering");
});

test("a completed entrance settles before adopting its canonical participant", () => {
  let state = entryTransitionReducer(createEntryTransitionState("home"), {
    type: "begin",
    requestId: 6,
    source: "home",
    target: "create",
    exitGate: "immediate",
    chromeMode: "crossfade",
  });
  state = entryTransitionReducer(state, { type: "targetReady", requestId: 6 });
  state = entryTransitionReducer(state, { type: "sourceExitFinished", requestId: 6 });
  state = entryTransitionReducer(state, { type: "targetEnterFinished", requestId: 6 });

  assert.equal(state.phase, "settling");

  const idle = entryTransitionReducer(state, {
    type: "complete",
    requestId: 6,
    canonicalParticipant: "create",
  });
  assert.deepEqual(idle, createEntryTransitionState("create"));
});

test("an exit can wait on readiness and abort restores the unchanged source", () => {
  const exiting = entryTransitionReducer(createEntryTransitionState("home"), {
    type: "begin",
    requestId: 7,
    source: "home",
    target: "prepared-home",
    exitGate: "immediate",
    chromeMode: "fixed",
  });

  assert.equal(
    entryTransitionReducer(exiting, { type: "sourceExitFinished", requestId: 6 }),
    exiting,
  );

  let state = entryTransitionReducer(exiting, { type: "sourceExitFinished", requestId: 7 });
  assert.equal(state.phase, "awaiting-target");
  state = entryTransitionReducer(state, { type: "targetMounted", requestId: 7 });
  // The mount-scoped watchdog uses the same readiness event as a native callback.
  state = entryTransitionReducer(state, { type: "targetReady", requestId: 7 });
  assert.equal(state.phase, "entering");

  assert.deepEqual(
    entryTransitionReducer(state, { type: "abort", requestId: 7 }),
    createEntryTransitionState("home"),
  );
});

test("surface and chrome selectors keep Home chrome fixed while prepared Home replaces its body", () => {
  let state = entryTransitionReducer(createEntryTransitionState("home"), {
    type: "begin",
    requestId: 8,
    source: "home",
    target: "prepared-home",
    exitGate: "manual",
    chromeMode: "fixed",
  });

  assert.deepEqual(entrySurfaceMotion(state, "home"), {
    visible: true,
    instant: false,
    completion: null,
  });
  assert.equal(entryChromeVisible(state, "home"), true);

  state = entryTransitionReducer(state, { type: "allowExit", requestId: 8 });
  assert.deepEqual(entrySurfaceMotion(state, "home"), {
    visible: false,
    instant: false,
    completion: { requestId: 8, kind: "source-exit" },
  });
  state = entryTransitionReducer(state, { type: "targetReady", requestId: 8 });
  state = entryTransitionReducer(state, { type: "sourceExitFinished", requestId: 8 });
  assert.deepEqual(entrySurfaceMotion(state, "prepared-home"), {
    visible: true,
    instant: false,
    completion: { requestId: 8, kind: "target-enter" },
  });
  state = entryTransitionReducer(state, { type: "targetEnterFinished", requestId: 8 });
  assert.deepEqual(entrySurfaceMotion(state, "home"), {
    visible: true,
    instant: true,
    completion: null,
  });
});

test("native completion events retain the request that started each visibility change", () => {
  const queue = new EntryMotionCompletionQueue(true);
  const first = { requestId: 21, kind: "source-exit" };
  const second = { requestId: 22, kind: "source-exit" };

  queue.transition(false, 800, first);
  queue.transition(true, 800, null); // Abort recovery.
  queue.transition(false, 800, second); // A newer request starts before recovery settles.

  assert.deepEqual(queue.finish(true), first);
  assert.equal(queue.finish(false), null);
  assert.deepEqual(queue.finish(true), second);

  const rotatedHiddenSurface = new EntryMotionCompletionQueue(false, 800);
  rotatedHiddenSurface.transition(false, 900, null);
  assert.equal(rotatedHiddenSurface.finish(true), null);

  const rotatingExit = new EntryMotionCompletionQueue(true, 800);
  rotatingExit.transition(false, 800, first);
  rotatingExit.transition(false, 900, first);
  assert.equal(rotatingExit.finish(false), null);
  assert.deepEqual(rotatingExit.finish(true), first);
});

test("a native no-op interruption completes the current logical motion", () => {
  const queue = new EntryMotionCompletionQueue(true, 800);
  const exit = { requestId: 23, kind: "source-exit" };

  queue.transition(false, 800, exit);
  // Ease starts a fresh native batch for any prop update. An unrelated React
  // rerender therefore interrupts the active batch even though these animated
  // values did not change, and Ease has no replacement animation to finish.
  queue.transition(false, 800, exit);

  assert.deepEqual(queue.finish(false), exit);
});

test("every request-scoped completion ignores a stale request id", () => {
  const state = entryTransitionReducer(createEntryTransitionState("home"), {
    type: "begin",
    requestId: 11,
    source: "home",
    target: "create",
    exitGate: "immediate",
    chromeMode: "crossfade",
  });
  const staleEvents = [
    { type: "allowExit", requestId: 10 },
    { type: "targetMounted", requestId: 10 },
    { type: "targetReady", requestId: 10 },
    { type: "sourceExitFinished", requestId: 10 },
    { type: "targetEnterFinished", requestId: 10 },
    { type: "complete", requestId: 10, canonicalParticipant: "create" },
    { type: "abort", requestId: 10 },
  ];

  for (const event of staleEvents) {
    assert.equal(entryTransitionReducer(state, event), state);
  }
});
