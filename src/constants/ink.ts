/** Scribble tool defaults — sizes are penMinWidth / penMaxWidth pairs. */
import { fixedTokens } from "../styles/tokens";

export const INK_STROKE_SIZES = fixedTokens.ink.strokeSizes;

export type InkStrokeSizeKey = keyof typeof INK_STROKE_SIZES;

export const INK_COLORS = fixedTokens.ink.colors;

export type InkTool = "pen" | "eraser";

/** Responder coordinates and native hit-testing both use points/dp. */
export const INK_ERASER_HIT_RADIUS = 28;
