import assert from "node:assert/strict";
import test from "node:test";

import {
  getCollapseReversalHitFrame,
  getCollapsedPortalOffset,
} from "../src/components/stackPortalGeometry.ts";

test("Stack ignores Teleport's reported safe-area page origin when targeting the visual viewport", () => {
  // Captured on the physical device that reproduced a 19 px handoff jump.
  // Teleport reported pageY=12.6667 for its root, but its child was visually
  // centred in this raw 393 × 852 viewport.
  const trigger = { pageX: 40, pageY: 217, width: 313, height: 443 };
  const viewport = { width: 393, height: 852 };

  assert.deepEqual(getCollapsedPortalOffset(trigger, viewport), { x: 0, y: 12.5 });
});

test("collapse reversal hit geometry covers both Stack motion endpoints", () => {
  const hitFrame = getCollapseReversalHitFrame({
    viewport: { width: 390, height: 844 },
    expanded: { width: 370, height: 520 },
    collapsed: { width: 310, height: 438 },
    collapsedOffset: { x: 80, y: 100 },
  });

  assert.deepEqual(hitFrame, {
    left: 10,
    top: 162,
    width: 420,
    height: 579,
  });
});
