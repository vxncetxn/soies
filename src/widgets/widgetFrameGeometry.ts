/**
 * widgetFrameGeometry — one padded raster canvas contract for every frame surface.
 *
 * `ArtefactFrame` draws its outer board shadow beyond the board's layout bounds.
 * Capturing the board edge-to-edge therefore clips the shadow permanently from
 * the PNG. The widget cache stores a transparent canvas whose four insets come
 * from the actual board-shadow treatment. The canvas is symmetric horizontally
 * but intentionally tighter above than below because the shadow falls down.
 *
 * Both `WidgetFrameCaptureHost` and `FeaturedWidgetsSheet` consume this module.
 * The former works in physical export pixels; the latter fits the same ratios
 * into logical points. Keeping those calculations pure makes a geometry change
 * testable without mounting React Native or retaining live Artefact trees.
 */

import { frameShadowInsetsForBoardWidth } from "../components/artefactFrameGeometry";

/** The visible board itself retains the source portrait 3:4 aspect. */
const WIDGET_FRAME_BOARD_ASPECT = 3 / 4;
/** A ~200-point board stays pixel-sharp at 3×; insets produce a 912×1112 PNG. */
export const WIDGET_FRAME_EXPORT_BOARD_WIDTH_PX = 600;

export type WidgetFrameGeometry = {
  /** Complete transparent PNG/presentation bounds. */
  canvasWidth: number;
  canvasHeight: number;
  /** Opaque `ArtefactFrame` board positioned inside the shadow crop. */
  boardWidth: number;
  boardHeight: number;
  /** Board origin inside the asymmetric transparent canvas. */
  boardLeft: number;
  boardTop: number;
};

/** Derive the smallest shadow-safe transparent canvas around one board width. */
export function widgetFrameGeometryForBoard(boardWidth: number): WidgetFrameGeometry {
  const boundedBoardWidth = Math.max(0, boardWidth);
  const shadowInsets = frameShadowInsetsForBoardWidth(boundedBoardWidth);
  const boardHeight = boundedBoardWidth / WIDGET_FRAME_BOARD_ASPECT;
  return {
    canvasWidth: shadowInsets.left + boundedBoardWidth + shadowInsets.right,
    canvasHeight: shadowInsets.top + boardHeight + shadowInsets.bottom,
    boardWidth: boundedBoardWidth,
    boardHeight,
    boardLeft: shadowInsets.left,
    boardTop: shadowInsets.top,
  };
}

const UNIT_GEOMETRY = widgetFrameGeometryForBoard(1);
/** Capture, carousel, and WidgetKit all fit this one derived PNG aspect. */
export const WIDGET_FRAME_CANVAS_ASPECT = UNIT_GEOMETRY.canvasWidth / UNIT_GEOMETRY.canvasHeight;

/** Maximize the board while its shadow-safe canvas fits the vertical viewport. */
export function widgetFrameGeometryFittingBoard(
  maxBoardWidth: number,
  maxCanvasHeight: number,
): WidgetFrameGeometry {
  const boardWidth = Math.min(
    Math.max(0, maxBoardWidth),
    Math.max(0, maxCanvasHeight) / UNIT_GEOMETRY.canvasHeight,
  );
  return widgetFrameGeometryForBoard(boardWidth);
}
