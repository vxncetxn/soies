/**
 * artefactFrameGeometry — pure scale invariants shared by Frame renderers.
 *
 * The board is 145% of its 3:4 well. Its shadows also need to scale with that
 * board: a cached PNG is rendered large and later shrunk, while an empty slot
 * renders the same Frame directly at carousel size. Fixed-point shadows make
 * those two paths visibly different even when their bounds match.
 *
 * A 200-point board preserves the treatment users see in the Featured carousel.
 * Scaling from board width also makes the exported physical shadow stable on
 * 2× and 3× devices, because the larger logical board on a 2× device receives
 * the proportionally larger logical effect before rasterization.
 *
 * The outer-shadow metrics live here too. Capture geometry uses the same values
 * to reserve three Core Animation standard deviations of visible blur plus one
 * reference point of safety. This is deliberately asymmetric: the 18-point
 * downward offset needs more room below the board than above it.
 */

/** Outer board vs the 3:4 subject well (Astro portrait figure:after). */
export const FRAME_BOARD_SCALE = 1.45;
/** Reference width at which the original frame shadow values render unchanged. */
export const FRAME_EFFECT_REFERENCE_BOARD_WIDTH = 200;
/** Dominant outer-shadow offset in the reference treatment. */
export const FRAME_BOARD_SHADOW_OFFSET_Y = 18;
/** Dominant CSS blur diameter; iOS renders it with a half-sized Gaussian radius. */
export const FRAME_BOARD_SHADOW_BLUR = 34;
/** Three Gaussian sigmas capture effectively all visible Core Animation blur. */
const FRAME_BOARD_SHADOW_VISIBLE_BLUR = Math.ceil(FRAME_BOARD_SHADOW_BLUR * 1.5) + 1;

export type FrameShadowInsets = {
  left: number;
  top: number;
  right: number;
  bottom: number;
};

/** Keep every blur/offset proportional across live and cached frame sizes. */
export function frameEffectScaleForBoardWidth(boardWidth: number): number {
  return Math.max(0, boardWidth) / FRAME_EFFECT_REFERENCE_BOARD_WIDTH;
}

/** Exact crop insets that retain the dominant offset board shadow. */
export function frameShadowInsetsForBoardWidth(boardWidth: number): FrameShadowInsets {
  const scale = frameEffectScaleForBoardWidth(boardWidth);
  const blurExtent = FRAME_BOARD_SHADOW_VISIBLE_BLUR * scale;
  const offsetY = FRAME_BOARD_SHADOW_OFFSET_Y * scale;
  return {
    left: blurExtent,
    top: Math.max(0, blurExtent - offsetY),
    right: blurExtent,
    bottom: blurExtent + offsetY,
  };
}
