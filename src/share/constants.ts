/**
 * Share canvas tokens are fixed so export capture does not depend on the live
 * system appearance.
 */
import { fixedTokens } from "../styles/tokens";

export const SHARE_BG = fixedTokens.export.background;

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
