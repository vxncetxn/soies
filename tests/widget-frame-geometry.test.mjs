import assert from "node:assert/strict";
import test from "node:test";

import {
  frameEffectScaleForBoardWidth,
  frameShadowInsetsForBoardWidth,
} from "../src/components/artefactFrameGeometry.ts";
import {
  WIDGET_FRAME_CANVAS_ASPECT,
  WIDGET_FRAME_EXPORT_BOARD_WIDTH_PX,
  widgetFrameGeometryFittingBoard,
  widgetFrameGeometryForBoard,
} from "../src/widgets/widgetFrameGeometry.ts";

test("capture canvas tightly retains every edge of the offset board shadow", () => {
  const geometry = widgetFrameGeometryForBoard(WIDGET_FRAME_EXPORT_BOARD_WIDTH_PX);
  const insets = frameShadowInsetsForBoardWidth(geometry.boardWidth);
  assert.deepEqual(geometry, {
    canvasWidth: 912,
    canvasHeight: 1112,
    boardWidth: 600,
    boardHeight: 800,
    boardLeft: 156,
    boardTop: 102,
  });
  assert.deepEqual(insets, { left: 156, top: 102, right: 156, bottom: 210 });
  assert.equal(geometry.canvasWidth - geometry.boardLeft - geometry.boardWidth, insets.right);
  assert.equal(geometry.canvasHeight - geometry.boardTop - geometry.boardHeight, insets.bottom);
  assert.ok(Math.abs(WIDGET_FRAME_CANVAS_ASPECT - 114 / 139) < 1e-12);
});

test("sheet previews retain the reference board size inside the same shadow crop", () => {
  const geometry = widgetFrameGeometryFittingBoard(244 * 0.75, 354);
  assert.ok(Math.abs(geometry.canvasWidth - 278.16) < 1e-9);
  assert.ok(Math.abs(geometry.canvasHeight - 339.16) < 1e-9);
  assert.equal(geometry.boardWidth, 183);
  assert.equal(geometry.boardHeight, 244);
  assert.ok(Math.abs(geometry.boardLeft - 47.58) < 1e-9);
  assert.ok(Math.abs(geometry.boardTop - 31.11) < 1e-9);
});

test("frame shadows scale with the board instead of changing between live and raster views", () => {
  assert.equal(frameEffectScaleForBoardWidth(200), 1);
  assert.equal(frameEffectScaleForBoardWidth(183), 0.915);
  assert.equal(frameEffectScaleForBoardWidth(300), 1.5);
  assert.equal(frameEffectScaleForBoardWidth(450), 2.25);
});
