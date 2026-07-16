/**
 * Print layout contract — one logical polaroid and caption box on every device.
 *
 * The reference canvas is the Print card shown on the original 390-point design
 * viewport. Home, Create, frames, widgets and Share scale this complete canvas;
 * caption width, font metrics and line capacity never derive from the viewing
 * device. The caption box spans the complete white region below the photo; the
 * native adapter independently caps text at one physical line and centers that
 * line inside the complete remaining region.
 */
import type { PaperParagraphPreset } from "../data/paperDocument";

import {
  ARTEFACT_TEXT_COLOR,
  ARTEFACT_TEXT_FONT_FAMILY,
  ARTEFACT_TEXT_NATIVE_FONT_FAMILY,
  ARTEFACT_TEXT_PLACEHOLDER,
  ARTEFACT_TEXT_PLACEHOLDER_COLOR,
  type ArtefactTextMetrics,
} from "./artefactTextStyle";
import { PAPER_CANVAS_HEIGHT, PAPER_PRESET_METRICS } from "./paperLayout";

/** Portrait Print card width / height, retained from the established design. */
export const PRINT_ASPECT_RATIO = 53 / 86;
/** The reference Print shares Paper's 390-point-viewport card height. */
export const PRINT_CANVAS_HEIGHT = PAPER_CANVAS_HEIGHT;
/** Width is derived once from the card ratio, never from a live viewport. */
export const PRINT_CANVAS_WIDTH = PRINT_CANVAS_HEIGHT * PRINT_ASPECT_RATIO;

/** Photo width / height from the existing 244×367 crop contract. */
export const PRINT_IMAGE_ASPECT_RATIO = 244 / 367;
/** Retains the existing 86.79% photo/caption column within the polaroid. */
export const PRINT_CONTENT_WIDTH_RATIO = 0.8679;
/** Canonical column shared by the crop and caption. */
export const PRINT_CONTENT_WIDTH = PRINT_CANVAS_WIDTH * PRINT_CONTENT_WIDTH_RATIO;
/** Centers the canonical content column within the card. */
export const PRINT_CONTENT_X = (PRINT_CANVAS_WIDTH - PRINT_CONTENT_WIDTH) / 2;
/** Fixed breathing room above the photo in canonical points. */
export const PRINT_TOP_PADDING = 32;
/** Crop width exactly follows the shared content column. */
export const PRINT_IMAGE_WIDTH = PRINT_CONTENT_WIDTH;
/** Crop height follows the established source aspect rather than the device. */
export const PRINT_IMAGE_HEIGHT = PRINT_IMAGE_WIDTH / PRINT_IMAGE_ASPECT_RATIO;

/** Print follows Paper's Default optical scale instead of owning a parallel size token. */
export const PRINT_FONT_SIZE = PAPER_PRESET_METRICS.default.fontSize;
/** The shared Default line box prevents Print and Paper typography from drifting separately. */
export const PRINT_LINE_HEIGHT = PAPER_PRESET_METRICS.default.lineHeight;
/**
 * Print disables preset commands, but the shared native engine requires a
 * complete preset table. Equal values make every defensive lookup Default-only.
 */
export const PRINT_TEXT_METRICS: Record<PaperParagraphPreset, ArtefactTextMetrics> = {
  default: { fontSize: PRINT_FONT_SIZE, lineHeight: PRINT_LINE_HEIGHT },
  large: { fontSize: PRINT_FONT_SIZE, lineHeight: PRINT_LINE_HEIGHT },
  "x-large": { fontSize: PRINT_FONT_SIZE, lineHeight: PRINT_LINE_HEIGHT },
};
/** Every Print surface accepts at most one physical caption line. */
export const PRINT_MAX_CAPTION_LINES = 1;
/** Caption uses the same left edge as the photo. */
export const PRINT_CAPTION_X = PRINT_CONTENT_X;
/**
 * The host begins at the photo edge so vertical centering includes every point
 * of visible white space rather than centering below a separately fixed gap.
 */
export const PRINT_CAPTION_Y = PRINT_TOP_PADDING + PRINT_IMAGE_HEIGHT;
/** Caption wraps against exactly the same width as the photo. */
export const PRINT_CAPTION_WIDTH = PRINT_CONTENT_WIDTH;
/** Complete remaining card height; native line count still enforces the one-line cap. */
export const PRINT_CAPTION_HEIGHT = PRINT_CANVAS_HEIGHT - PRINT_CAPTION_Y;

/** React Native alias shared with Paper's JavaScript fallback. */
export const PRINT_FONT_FAMILY = ARTEFACT_TEXT_FONT_FAMILY;
/** UIKit PostScript name shared with Paper's native renderer. */
export const PRINT_NATIVE_FONT_FAMILY = ARTEFACT_TEXT_NATIVE_FONT_FAMILY;
/** Fixed authored-content foreground independent of app chrome. */
export const PRINT_TEXT_COLOR = ARTEFACT_TEXT_COLOR;
/** Create prompt color shared with Paper. */
export const PRINT_PLACEHOLDER_COLOR = ARTEFACT_TEXT_PLACEHOLDER_COLOR;
/** Create prompt copy shared with Paper. */
export const PRINT_PLACEHOLDER = ARTEFACT_TEXT_PLACEHOLDER;

/** Render a proportional native surface at the actual target width. */
export function printCanvasScaleForDisplayWidth(displayWidth: number): number {
  return Math.max(0, displayWidth) / PRINT_CANVAS_WIDTH;
}
