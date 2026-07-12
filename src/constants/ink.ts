/** Scribble tool defaults — sizes are penMinWidth / penMaxWidth pairs. */
export const INK_STROKE_SIZES = {
  S: { min: 1, max: 2.5 },
  M: { min: 2, max: 4 },
  L: { min: 3.5, max: 7 },
} as const;

export type InkStrokeSizeKey = keyof typeof INK_STROKE_SIZES;

export const INK_COLORS = [
  "#1C1917",
  "#DC2626",
  "#2563EB",
  "#16A34A",
  "#EA580C",
  "#9333EA",
] as const;

export type InkTool = "pen" | "eraser";

/** Hit radius (dp) for JS stroke eraser. */
export const INK_ERASER_HIT_RADIUS = 28;
