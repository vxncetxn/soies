import assert from "node:assert/strict";
import test from "node:test";

import {
  getArtefactCanvasLayout,
  getCollapsedArtefactLayout,
} from "../src/components/artefactLayout.ts";
import {
  PAPER_CANVAS_HEIGHT,
  PAPER_CANVAS_WIDTH,
  paperCanvasScaleForDisplayWidth,
} from "../src/components/paperLayout.ts";

test("Paper typography has one logical canvas on every device", () => {
  const phoneScale = paperCanvasScaleForDisplayWidth(310);
  const largePhoneScale = paperCanvasScaleForDisplayWidth(322);
  const tabletScale = paperCanvasScaleForDisplayWidth(688);

  assert.equal(PAPER_CANVAS_WIDTH, 310);
  assert.equal(PAPER_CANVAS_HEIGHT, (PAPER_CANVAS_WIDTH * 297) / 210);
  assert.equal(phoneScale, 1);
  assert.equal(largePhoneScale, 322 / PAPER_CANVAS_WIDTH);
  assert.equal(tabletScale, 688 / PAPER_CANVAS_WIDTH);
});

test("responsive Paper frames scale one canvas instead of reflowing it", () => {
  const deviceWidths = [375, 390, 402, 430, 768, 1024];
  const canvases = deviceWidths.map((width) => getArtefactCanvasLayout(width, "paper"));
  const displayFrames = deviceWidths.map((width) => getCollapsedArtefactLayout(width, "paper"));

  assert.deepEqual(new Set(canvases.map(({ width }) => width)), new Set([PAPER_CANVAS_WIDTH]));
  assert.deepEqual(new Set(canvases.map(({ height }) => height)), new Set([PAPER_CANVAS_HEIGHT]));
  assert.equal(new Set(displayFrames.map(({ width }) => width)).size, deviceWidths.length);
});
