/**
 * Paper layout contract — one logical page shared by authoring and every output.
 *
 * Paper is responsive only as a uniformly scaled artefact. Its text and Ink are
 * always composed on this 310-point A4 canvas (the original 390-point design
 * viewport minus the two 40-point deck gutters). Home, expanded reading,
 * Featured frames, widgets, and Share may display the page at different sizes,
 * but they must scale the complete canvas rather than recompute its text width.
 * That invariant makes line breaks and physical capacity independent of the
 * iPhone or iPad used to create or view the artefact.
 *
 * Typography is explicit because Paper is authored content, not adaptive app
 * chrome: Dynamic Type may change controls around it, but allowing it to change
 * this canvas would make a saved page reflow differently on another device.
 */
import type { PaperParagraphPreset } from "../data/paperDocument";
import type { ArtefactTextMetrics } from "./artefactTextStyle";

import { fixedTokens } from "../styles/tokens";
import {
  ARTEFACT_TEXT_COLOR,
  ARTEFACT_TEXT_FONT_FAMILY,
  ARTEFACT_TEXT_MIN_PRESENTATION_SCALE,
  ARTEFACT_TEXT_NATIVE_FONT_FAMILY,
  ARTEFACT_TEXT_PLACEHOLDER,
  ARTEFACT_TEXT_PLACEHOLDER_COLOR,
  clampArtefactTextPresentationScale,
} from "./artefactTextStyle";

/** The viewport on which the original 40-point Paper gutters were designed. */
export const PAPER_REFERENCE_VIEWPORT_WIDTH = 390;
/** The logical A4 page width; every responsive surface scales from this value. */
export const PAPER_CANVAS_WIDTH = PAPER_REFERENCE_VIEWPORT_WIDTH - 80;
/** Preserve the A4 ratio in the same logical coordinate system as the width. */
export const PAPER_CANVAS_HEIGHT = (PAPER_CANVAS_WIDTH * 297) / 210;
/** Text and Ink content stay this far from every logical page edge. */
export const PAPER_PADDING = 24;
export const PAPER_TEXT_WIDTH = PAPER_CANVAS_WIDTH - PAPER_PADDING * 2;
export const PAPER_TEXT_HEIGHT = PAPER_CANVAS_HEIGHT - PAPER_PADDING * 2;
/** Prevent a zero-sized raster/font request while a responsive host is mounting. */
export const PAPER_MIN_PRESENTATION_SCALE = ARTEFACT_TEXT_MIN_PRESENTATION_SCALE;

/** Expo/RN registration alias used only by JavaScript-rendered fallbacks. */
export const PAPER_FONT_FAMILY = ARTEFACT_TEXT_FONT_FAMILY;
/** UIKit requires the font file's PostScript name, not Expo's registration alias. */
export const PAPER_NATIVE_FONT_FAMILY = ARTEFACT_TEXT_NATIVE_FONT_FAMILY;

export type PaperPresetMetrics = ArtefactTextMetrics;

/**
 * Paragraph-level typography tokens shared by native editing and final output.
 * Large and X-Large use 1.25× and 1.5× Default while preserving the existing
 * 1.4 line-height ratio. These are product tokens, not Dynamic Type categories.
 */
export const PAPER_PRESET_METRICS: Record<PaperParagraphPreset, PaperPresetMetrics> = {
  default: fixedTokens.artefact.typography.default,
  large: fixedTokens.artefact.typography.large,
  "x-large": fixedTokens.artefact.typography.xLarge,
};

/** Compatibility aliases for Default-only fallback call sites. */
export const PAPER_FONT_SIZE = PAPER_PRESET_METRICS.default.fontSize;
export const PAPER_LINE_HEIGHT = PAPER_PRESET_METRICS.default.lineHeight;
/** Exact sRGB equivalent of the theme's fixed Paper foreground token. */
export const PAPER_TEXT_COLOR = ARTEFACT_TEXT_COLOR;
export const PAPER_PLACEHOLDER_COLOR = ARTEFACT_TEXT_PLACEHOLDER_COLOR;
export const PAPER_PLACEHOLDER = ARTEFACT_TEXT_PLACEHOLDER;

/**
 * Convert a responsive display width into the sole transform Paper may use.
 * Text never receives the display width directly, preventing device reflow.
 */
export function paperCanvasScaleForDisplayWidth(displayWidth: number): number {
  return Math.max(0, displayWidth) / PAPER_CANVAS_WIDTH;
}

/** Clamp transient pre-layout values without changing any real device presentation scale. */
export function clampPaperPresentationScale(scale: number): number {
  return clampArtefactTextPresentationScale(scale);
}
