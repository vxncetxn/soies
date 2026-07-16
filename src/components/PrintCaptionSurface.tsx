/**
 * PrintCaptionSurface — Default-only Print adapter over BoundedTextSurface.
 *
 * Persistence remains the historical plain `text` string. At the shared native
 * boundary the adapter wraps it in a Default-only paragraph document, then
 * unwraps accepted events back to text. Its policy is now final: at most two
 * physical lines, with the actual one- or two-line block vertically centered.
 * This keeps Print storage simple while reusing Paper's exact pre-paint edit,
 * paste, IME, placeholder and controlled acknowledgement machinery.
 */
import { forwardRef } from "react";

import type { BoundedTextSurfaceHandle } from "./BoundedTextSurface.types";

import { createPaperDocument } from "../data/paperDocument";
import BoundedTextSurface from "./BoundedTextSurface";
import {
  PRINT_CAPTION_HEIGHT,
  PRINT_CAPTION_WIDTH,
  PRINT_FONT_FAMILY,
  PRINT_MAX_CAPTION_LINES,
  PRINT_NATIVE_FONT_FAMILY,
  PRINT_PLACEHOLDER_COLOR,
  PRINT_TEXT_COLOR,
  PRINT_TEXT_METRICS,
} from "./printLayout";

export type PrintCaptionSurfaceHandle = BoundedTextSurfaceHandle;

type PrintCaptionSurfaceProps = {
  /** Parent-owned durable caption text. */
  value: string;
  /** Receives only native-accepted mutations. */
  onChangeText?: (text: string) => void;
  /** Editable Create surface; Home/frame/share remain read-only. */
  editable?: boolean;
  /** Exact proportional raster multiplier supplied by the Print canvas host. */
  presentationScale?: number;
  /** Create-only prompt; read output leaves it empty. */
  placeholder?: string;
  /** EditablePrint enters Type when UIKit grants this responder focus. */
  onFocus?: () => void;
  /** EditablePrint leaves Type when UIKit resigns this responder. */
  onBlur?: () => void;
};

/**
 * Immutable Default-only Print policy shared by Create and every read/capture
 * output. Capacity and alignment therefore cannot diverge by call site.
 */
const PRINT_CAPTION_CONFIGURATION = {
  fontFamily: PRINT_FONT_FAMILY,
  nativeFontFamily: PRINT_NATIVE_FONT_FAMILY,
  presetMetrics: PRINT_TEXT_METRICS,
  canonicalWidth: PRINT_CAPTION_WIDTH,
  canonicalHeight: PRINT_CAPTION_HEIGHT,
  contentPadding: 0,
  maximumVisibleLines: PRINT_MAX_CAPTION_LINES,
  allowsParagraphPresets: false,
  verticalAlignment: "center",
  textColor: PRINT_TEXT_COLOR,
  placeholderTextColor: PRINT_PLACEHOLDER_COLOR,
} as const;

/**
 * Adapts plain Print strings to the shared document engine on React's JS thread;
 * native remains authoritative for mutation acceptance and display geometry.
 */
const PrintCaptionSurface = forwardRef<PrintCaptionSurfaceHandle, PrintCaptionSurfaceProps>(
  function PrintCaptionSurface(
    {
      value,
      onChangeText,
      editable = false,
      presentationScale = 1,
      placeholder = "",
      onFocus,
      onBlur,
    },
    ref,
  ) {
    return (
      <BoundedTextSurface
        ref={ref}
        document={createPaperDocument(value)}
        onChangeDocument={onChangeText ? (document) => onChangeText(document.text) : undefined}
        onFocus={onFocus}
        onBlur={onBlur}
        editable={editable}
        presentationScale={presentationScale}
        placeholder={placeholder}
        configuration={PRINT_CAPTION_CONFIGURATION}
      />
    );
  },
);

export default PrintCaptionSurface;
