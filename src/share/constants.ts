/**
 * Share canvas tokens — baked as hex so export capture does not depend on the
 * live system appearance (uniwind `bg-background` would follow the phone theme).
 * Values match `--color-background` light/dark in `src/global.css`.
 */
export const SHARE_BG = {
  light: "#EEEEEE",
  dark: "#44403B",
} as const;

export type ShareBackgroundId = keyof typeof SHARE_BG;

export const SHARE_BRAND = "soies app";

/**
 * Physical export pixels. React Native lays views out in logical points, so
 * ShareCaptureHost divides these by PixelRatio before mounting/capturing. Keeping
 * pixels and points separate prevents a 3× phone from allocating a 3240×5760
 * intermediate bitmap for what is meant to be a 1080×1920 image.
 */
export const SHARE_EXPORT_WIDTH = 1080;
export const SHARE_EXPORT_HEIGHT = 1920;

/** Physical card width inside the export; ShareComposition scales it into points. */
export const SHARE_ARTEFACT_WIDTH = 640;
