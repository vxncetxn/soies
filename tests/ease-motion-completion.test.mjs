import assert from "node:assert/strict";
import test from "node:test";

import { EaseMotionCompletionQueue } from "../src/utils/easeMotionCompletion.ts";

test("a lone native interruption completes its logical Ease motion", () => {
  const queue = new EaseMotionCompletionQueue("visible");
  const completion = { requestId: 1, kind: "hide" };

  queue.transition("hidden", completion);

  assert.deepEqual(queue.finish(false), completion);
});

test("an interrupted motion waits when a real replacement target is queued", () => {
  const queue = new EaseMotionCompletionQueue("collapsed");
  const opening = { requestId: 2, kind: "open" };
  const closing = { requestId: 3, kind: "close" };

  queue.transition("expanded", opening);
  queue.transition("collapsed", closing);

  assert.equal(queue.finish(false), null);
  assert.deepEqual(queue.finish(true), closing);
});

test("completion tokens stay ordered across recovery and geometry retargets", () => {
  const queue = new EaseMotionCompletionQueue("visible:800");
  const first = { requestId: 4, kind: "hide" };
  const second = { requestId: 5, kind: "hide" };

  queue.transition("hidden:800", first);
  queue.transition("visible:800", null);
  queue.transition("hidden:800", second);

  assert.deepEqual(queue.finish(true), first);
  assert.equal(queue.finish(false), null);
  assert.deepEqual(queue.finish(true), second);

  const rotating = new EaseMotionCompletionQueue("visible:800");
  rotating.transition("hidden:800", first);
  rotating.transition("hidden:900", first);

  assert.equal(rotating.finish(false), null);
  assert.deepEqual(rotating.finish(true), first);
});

test("a no-motion preparation completion stays ahead of the Stack spring request", () => {
  const queue = new EaseMotionCompletionQueue("collapsed:0:0");
  const expansion = { requestId: 6, kind: "expand" };

  queue.transition("collapsed:-0.16:-0.33", null);
  queue.transition("expanded:0:0", expansion);

  assert.equal(queue.finish(true), null);
  assert.deepEqual(queue.finish(true), expansion);
});

test("watchdog reconciliation discards stale native completions", () => {
  const queue = new EaseMotionCompletionQueue("collapsed:0:0");
  const expansion = { requestId: 7, kind: "expand" };
  const collapse = { requestId: 8, kind: "collapse" };

  queue.transition("expanded:0:0", expansion);
  queue.transition("collapsed:-0.16:-0.33", collapse);
  assert.deepEqual(queue.finish(true), expansion);

  queue.reset("collapsed:-0.16:-0.33");
  assert.equal(queue.finish(true), null);

  queue.transition("expanded:0:0", expansion);
  assert.deepEqual(queue.finish(true), expansion);
});
