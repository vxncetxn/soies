/**
 * Shared authored-text tokens for Paper and Print.
 *
 * Both artefacts use the same bundled face and fixed foreground colors. Keeping
 * the JavaScript registration alias beside UIKit's PostScript name prevents a
 * platform adapter from silently falling back to a different font while still
 * allowing Paper and Print to own different geometry and line constraints.
 */

import { fixedTokens } from "../styles/tokens";

/** Expo/RN registration alias used by JavaScript-rendered fallbacks. */
export const ARTEFACT_TEXT_FONT_FAMILY = fixedTokens.artefact.text.fontFamily;
/** UIKit resolves bundled fonts by PostScript name rather than Expo's alias. */
export const ARTEFACT_TEXT_NATIVE_FONT_FAMILY = fixedTokens.artefact.text.nativeFontFamily;
/** Authored artefact content remains fixed even when surrounding chrome changes theme. */
export const ARTEFACT_TEXT_COLOR = fixedTokens.artefact.text.color;
/** Muted prompt shared by the two create adapters. */
export const ARTEFACT_TEXT_PLACEHOLDER_COLOR = fixedTokens.artefact.text.placeholderColor;
/** Shared uppercase invitation shown only while an editable artefact is empty. */
export const ARTEFACT_TEXT_PLACEHOLDER = "TAP TO START TYPING";

/** Prevent zero-sized native font/layout requests during transient host layout. */
export const ARTEFACT_TEXT_MIN_PRESENTATION_SCALE = 0.01;

export type ArtefactTextMetrics = {
  /** Glyph size in canonical artefact points before display scaling. */
  fontSize: number;
  /** Explicit canonical line box; native font leading remains disabled. */
  lineHeight: number;
};

/** Clamp only invalid/pre-layout values; real phone and tablet scales pass through. */
export function clampArtefactTextPresentationScale(scale: number): number {
  return Math.max(ARTEFACT_TEXT_MIN_PRESENTATION_SCALE, scale);
}
