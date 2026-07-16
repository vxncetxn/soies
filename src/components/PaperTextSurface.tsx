/**
 * PaperTextSurface — Paper configuration over the shared bounded-text engine.
 *
 * Paper keeps its atomic paragraph document and formatting events, but delegates
 * native rendering, editing, capacity, IME handling, placeholder behavior and
 * presentation scaling to `BoundedTextSurface`, which Print captions also use.
 */
import { forwardRef } from "react";

import type { PaperTextSurfaceHandle, PaperTextSurfaceProps } from "./PaperTextSurface.types";

import BoundedTextSurface from "./BoundedTextSurface";
import {
  PAPER_CANVAS_HEIGHT,
  PAPER_CANVAS_WIDTH,
  PAPER_FONT_FAMILY,
  PAPER_NATIVE_FONT_FAMILY,
  PAPER_PADDING,
  PAPER_PLACEHOLDER_COLOR,
  PAPER_PRESET_METRICS,
  PAPER_TEXT_COLOR,
} from "./paperLayout";

/**
 * Immutable Paper policy passed to every shared surface. Module ownership keeps
 * geometry and typography stable while individual instances supply documents,
 * editability and presentation scale.
 */
const PAPER_TEXT_CONFIGURATION = {
  fontFamily: PAPER_FONT_FAMILY,
  nativeFontFamily: PAPER_NATIVE_FONT_FAMILY,
  presetMetrics: PAPER_PRESET_METRICS,
  canonicalWidth: PAPER_CANVAS_WIDTH,
  canonicalHeight: PAPER_CANVAS_HEIGHT,
  contentPadding: PAPER_PADDING,
  maximumVisibleLines: 0,
  allowsParagraphPresets: true,
  verticalAlignment: "top",
  textColor: PAPER_TEXT_COLOR,
  placeholderTextColor: PAPER_PLACEHOLDER_COLOR,
} as const;

const PaperTextSurface = forwardRef<PaperTextSurfaceHandle, PaperTextSurfaceProps>(
  function PaperTextSurface(props, ref) {
    return <BoundedTextSurface ref={ref} {...props} configuration={PAPER_TEXT_CONFIGURATION} />;
  },
);

export default PaperTextSurface;
