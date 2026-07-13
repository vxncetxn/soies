/**
 * Canonical artefact layout metrics shared by Home, Create, and Share.
 *
 * Paper establishes the collapsed deck height from the 40-point screen gutters.
 * Print deliberately reuses that height and derives its narrower width from the
 * 53:86 card ratio. Keeping this calculation in one module prevents fixed
 * chrome—32-point top padding, 16-point image/caption gap, and 16-point type—
 * from being scaled from different base widths in Share versus Home.
 */

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
