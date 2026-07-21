/**
 * Canonical artefact-layout contract.
 *
 * Viewports may change only presentation scale: Paper wrapping, Print crop and
 * the complete Print caption line box must remain device-independent.
 */
import assert from "node:assert/strict";
import test from "node:test";

import {
  getArtefactCanvasLayout,
  getCollapsedArtefactLayout,
  getExpandedArtefactLayout,
} from "../src/components/artefactLayout.ts";
import {
  PAPER_CANVAS_HEIGHT,
  PAPER_CANVAS_WIDTH,
  PAPER_PRESET_METRICS,
  paperCanvasScaleForDisplayWidth,
} from "../src/components/paperLayout.ts";
import {
  PRINT_CANVAS_HEIGHT,
  PRINT_CANVAS_WIDTH,
  PRINT_CAPTION_HEIGHT,
  PRINT_CAPTION_Y,
  PRINT_FONT_SIZE,
  PRINT_IMAGE_HEIGHT,
  PRINT_LINE_HEIGHT,
  PRINT_MAX_CAPTION_LINES,
  PRINT_TOP_PADDING,
  printCanvasScaleForDisplayWidth,
} from "../src/components/printLayout.ts";

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

test("expanded Artefact frames preserve the complete responsive canvas bounds", () => {
  const windowWidth = 390;

  for (const type of ["paper", "print"]) {
    const canvas = getArtefactCanvasLayout(windowWidth, type);
    const expanded = getExpandedArtefactLayout(windowWidth, type);

    assert.equal(expanded.width, windowWidth - 20);
    assert.equal(expanded.presentationScale, expanded.width / canvas.width);
    assert.equal(expanded.height, canvas.height * expanded.presentationScale);
  }
});

test("Print caption composition also uses one reference canvas on every device", () => {
  const deviceWidths = [375, 390, 430, 768, 1024, 1366];
  const referencePaperHeight = ((390 - 80) * 297) / 210;
  const referencePrintWidth = referencePaperHeight * (53 / 86);
  const canvases = deviceWidths.map((width) => getArtefactCanvasLayout(width, "print"));

  assert.deepEqual(new Set(canvases.map(({ width }) => width)), new Set([referencePrintWidth]));
  assert.deepEqual(new Set(canvases.map(({ height }) => height)), new Set([referencePaperHeight]));
});

test("Print centers one Default-sized caption line in all white space below its photo", () => {
  assert.equal(PRINT_MAX_CAPTION_LINES, 1);
  assert.equal(PRINT_FONT_SIZE, PAPER_PRESET_METRICS.default.fontSize);
  assert.equal(PRINT_CAPTION_Y, PRINT_TOP_PADDING + PRINT_IMAGE_HEIGHT);
  assert.equal(PRINT_CAPTION_HEIGHT, PRINT_CANVAS_HEIGHT - PRINT_CAPTION_Y);
  assert.ok(
    PRINT_CAPTION_HEIGHT >= PRINT_LINE_HEIGHT * PRINT_MAX_CAPTION_LINES,
    "the complete Default line must fit before vertical centering",
  );
  assert.ok(
    (PRINT_CAPTION_HEIGHT - PRINT_LINE_HEIGHT * PRINT_MAX_CAPTION_LINES) / 2 > 0,
    "the line should retain equal visible white space above and below",
  );
  assert.equal(printCanvasScaleForDisplayWidth(PRINT_CANVAS_WIDTH), 1);
  assert.equal(printCanvasScaleForDisplayWidth(688), 688 / PRINT_CANVAS_WIDTH);
});
