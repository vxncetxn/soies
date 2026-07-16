/**
 * Artefact layout metrics shared by Home, Create, frames, widgets, and Share.
 *
 * This module deliberately exposes two different questions:
 *   1. `getCollapsedArtefactLayout` answers how much responsive Stack/Create
 *      space the card occupies on the current device. Paper establishes that
 *      height from 40-point screen gutters; Print reuses the height and derives
 *      its narrower width from the 53:86 card ratio.
 *   2. `getArtefactCanvasLayout` answers which coordinate system content is
 *      composed in. Paper and Print now both return fixed reference canvases so
 *      neither text region can reflow by device or output surface.
 *
 * Keeping both questions explicit prevents presentation sizing from leaking
 * into Paper typography, while preventing Print's fixed top padding,
 * image/caption gap, and type from being scaled from different
 * base widths in Share versus Home.
 */

import { PAPER_CANVAS_HEIGHT, PAPER_CANVAS_WIDTH } from "./paperLayout";
import {
  PRINT_ASPECT_RATIO,
  PRINT_CANVAS_HEIGHT,
  PRINT_CANVAS_WIDTH,
  PRINT_FONT_FAMILY,
  PRINT_FONT_SIZE,
  PRINT_LINE_HEIGHT,
  PRINT_MAX_CAPTION_LINES,
} from "./printLayout";

export {
  PRINT_ASPECT_RATIO,
  PRINT_FONT_FAMILY,
  PRINT_FONT_SIZE,
  PRINT_LINE_HEIGHT,
  PRINT_MAX_CAPTION_LINES,
};

export const PAPER_ASPECT_RATIO = 210 / 297;
export const COLLAPSED_DECK_HORIZONTAL_GUTTER = 80;

export type KnownArtefactType = "paper" | "print";

export function getCollapsedArtefactLayout(
  windowWidth: number,
  type: KnownArtefactType,
): {
  width: number;
  height: number;
} {
  const paperWidth = windowWidth - COLLAPSED_DECK_HORIZONTAL_GUTTER;
  const paperHeight = paperWidth / PAPER_ASPECT_RATIO;

  return {
    width: type === "paper" ? paperWidth : paperHeight * PRINT_ASPECT_RATIO,
    height: paperHeight,
  };
}

/**
 * Logical renderer size before a presentation surface scales the artefact.
 * Both known artefacts ignore the live viewport; presentation hosts scale the
 * complete canvas instead of changing either authored text column.
 */
export function getArtefactCanvasLayout(
  _windowWidth: number,
  type: KnownArtefactType,
): {
  width: number;
  height: number;
} {
  if (type === "paper") {
    return { width: PAPER_CANVAS_WIDTH, height: PAPER_CANVAS_HEIGHT };
  }
  return { width: PRINT_CANVAS_WIDTH, height: PRINT_CANVAS_HEIGHT };
}
