import assert from "node:assert/strict";
import test from "node:test";

import {
  createPaperDocument,
  parsePaperDocument,
  serializePaperDocument,
} from "../src/data/paperDocument.ts";

test("legacy Paper text becomes a Default-styled paragraph document", () => {
  assert.deepEqual(parsePaperDocument({ text: "First\n\nThird\n" }), {
    version: 1,
    text: "First\n\nThird\n",
    paragraphPresets: ["default", "default", "default", "default"],
  });
});

test("Paper preset data preserves valid values and defaults invalid or missing paragraphs", () => {
  assert.deepEqual(
    parsePaperDocument({
      version: 1,
      text: "First\nSecond\nThird\nFourth",
      paragraphPresets: ["large", "unknown", "x-large"],
    }),
    {
      version: 1,
      text: "First\nSecond\nThird\nFourth",
      paragraphPresets: ["large", "default", "x-large", "default"],
    },
  );
});

test("serialized Paper documents retain top-level searchable text and normalized presets", () => {
  const serialized = serializePaperDocument({
    version: 1,
    text: "Heading\nBody",
    paragraphPresets: ["x-large", "default", "large"],
  });

  assert.deepEqual(JSON.parse(serialized), {
    version: 1,
    text: "Heading\nBody",
    paragraphPresets: ["x-large", "default"],
  });
});

test("a new blank Paper starts with one Default paragraph for its caret", () => {
  assert.deepEqual(createPaperDocument(), {
    version: 1,
    text: "",
    paragraphPresets: ["default"],
  });
});
