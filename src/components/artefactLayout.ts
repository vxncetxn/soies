/**
 * Artefact layout metrics shared by Home, Create, frames, widgets, and Share.
 *
 * This module deliberately exposes two different questions:
 *   1. `getCollapsedArtefactLayout` answers how much responsive Stack/Create
 *      space the card occupies on the current device. Paper establishes that
 *      height from 40-point screen gutters; Print reuses the height and derives
 *      its narrower width from the 53:86 card ratio.
 *   2. `getArtefactCanvasLayout` answers which coordinate system content is
 *      composed in. Paper always returns its fixed document canvas so text
 *      cannot reflow by device or output surface. Print retains the responsive
 *      canvas until its future bounded-caption migration.
 *
 * Keeping both questions explicit prevents presentation sizing from leaking
 * into Paper typography, while preventing Print's fixed 32-point top padding,
 * 16-point image/caption gap, and 16-point type from being scaled from different
 * base widths in Share versus Home.
 */

import { PAPER_CANVAS_HEIGHT, PAPER_CANVAS_WIDTH } from "./paperLayout";

export const PAPER_ASPECT_RATIO = 210 / 297;
export const PRINT_ASPECT_RATIO = 53 / 86;
export const COLLAPSED_DECK_HORIZONTAL_GUTTER = 80;

export const PRINT_FONT_FAMILY = "ABCStefan-Simple-Trial";
export const PRINT_FONT_SIZE = 16;
export const PRINT_LINE_HEIGHT = PRINT_FONT_SIZE * 1.4;
export const PRINT_MAX_CAPTION_LINES = 2;

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
 * Paper ignores the live viewport so its text wraps identically everywhere;
 * Print retains its established viewport-derived canvas for now.
 */
export function getArtefactCanvasLayout(
  windowWidth: number,
  type: KnownArtefactType,
): {
  width: number;
  height: number;
} {
  if (type === "paper") {
    return { width: PAPER_CANVAS_WIDTH, height: PAPER_CANVAS_HEIGHT };
  }
  return getCollapsedArtefactLayout(windowWidth, type);
}
