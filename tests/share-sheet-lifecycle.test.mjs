import assert from "node:assert/strict";
import test from "node:test";

import {
  initialShareSheetPosition,
  shareSheetPositionAfterOpenChange,
} from "../src/share/shareSheetLifecycle.ts";

test("an actively mounted Share sheet opens at the requested artefact", () => {
  assert.deepEqual(initialShareSheetPosition(true, 3, 5), {
    sheetIndex: 1,
    page: 3,
  });
  assert.deepEqual(initialShareSheetPosition(false, 3, 5), {
    sheetIndex: 0,
    page: 0,
  });
});

test("Share sheet open transitions select the request and close transitions retain the page", () => {
  assert.deepEqual(shareSheetPositionAfterOpenChange(false, true, 4, 5), {
    sheetIndex: 1,
    page: 4,
  });
  assert.deepEqual(shareSheetPositionAfterOpenChange(true, false, 4, 5), {
    sheetIndex: 0,
  });
  assert.equal(shareSheetPositionAfterOpenChange(true, true, 4, 5), null);
});

test("Share sheet lifecycle bounds requested pages and keeps empty sessions closed", () => {
  assert.deepEqual(initialShareSheetPosition(true, 99, 2), {
    sheetIndex: 1,
    page: 1,
  });
  assert.deepEqual(initialShareSheetPosition(true, 2, 0), {
    sheetIndex: 0,
    page: 0,
  });
});
