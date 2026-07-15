import assert from "node:assert/strict";
import test from "node:test";

import {
  protectedWidgetFrameUris,
  unreferencedWidgetFrameNames,
  widgetFrameFileName,
} from "../src/widgets/widgetFrameCachePolicy.ts";

test("artefact revision and renderer version invalidate frame filenames", () => {
  const first = widgetFrameFileName("artefact/id", 10);
  const changed = widgetFrameFileName("artefact/id", 11);
  assert.notEqual(first, changed);
  assert.match(first, /^featured-artefact-artefact_id-10-r\d+\.png$/);
});

test("cleanup protects the immediately previous publication for one later pass", () => {
  const first = new Set(["old.png", "stable.png"]);
  const second = new Set(["new.png", "stable.png"]);
  assert.equal(protectedWidgetFrameUris(null, first), null);
  assert.deepEqual(protectedWidgetFrameUris(first, second), ["old.png", "stable.png", "new.png"]);
  assert.deepEqual(protectedWidgetFrameUris(second, second), ["new.png", "stable.png"]);
});

test("cleanup policy removes only old unreferenced widget captures", () => {
  assert.deepEqual(
    unreferencedWidgetFrameNames(
      ["featured-artefact-a-1-r1.png", "featured-artefact-b-2-r1.png", "unrelated.png"],
      new Set(["featured-artefact-b-2-r1.png"]),
    ),
    ["featured-artefact-a-1-r1.png"],
  );
});
