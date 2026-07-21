import assert from "node:assert/strict";
import test from "node:test";

import { StackCollapseReversalTapGesture } from "../src/components/stackCollapseReversal.ts";

test("Stack collapse reversal accepts a tap with normal finger drift", () => {
  const gesture = new StackCollapseReversalTapGesture();

  gesture.begin({ pageX: 100, pageY: 200 });
  gesture.move({ pageX: 106, pageY: 208 });

  assert.equal(gesture.consumeTap(), true);
});

test("Stack collapse reversal rejects a swipe even if it returns inside the card", () => {
  const gesture = new StackCollapseReversalTapGesture();

  gesture.begin({ pageX: 100, pageY: 200 });
  gesture.move({ pageX: 100, pageY: 224 });
  gesture.move({ pageX: 100, pageY: 200 });

  assert.equal(gesture.consumeTap(), false);
});

test("a rejected swipe cannot poison the next Stack reversal tap", () => {
  const gesture = new StackCollapseReversalTapGesture();

  gesture.begin({ pageX: 100, pageY: 200 });
  gesture.move({ pageX: 100, pageY: 224 });
  assert.equal(gesture.consumeTap(), false);

  gesture.begin({ pageX: 100, pageY: 200 });
  assert.equal(gesture.consumeTap(), true);
});
