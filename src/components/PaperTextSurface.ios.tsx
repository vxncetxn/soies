/**
 * PaperTextSurface (iOS) — the single React seam over Paper's TextKit surface.
 *
 * Both authoring and final output render through the same native view. The view
 * receives canonical typography plus a presentation-only raster scale, so a
 * high-resolution expanded editor stays sharp while TextKit still validates
 * every mutation against the invariant 310-point Paper box.
 *
 * The complete text/style document crosses the controlled boundary as one JSON
 * prop. Native edit events return the accepted text and paragraph tokens in one
 * event, preventing React from briefly pairing new text with stale formatting.
 */
import { forwardRef, useImperativeHandle, useRef } from "react";
import { StyleSheet } from "react-native";

import type {
  PaperDocumentChangeEvent,
  PaperSelectionStateEvent,
  PaperTextInputViewHandle,
} from "../../modules/paper-text-input";
import type { PaperParagraphPreset } from "../data/paperDocument";
import type {
  PaperSelectionState,
  PaperTextSurfaceHandle,
  PaperTextSurfaceProps,
} from "./PaperTextSurface.types";

import { PaperTextInputView } from "../../modules/paper-text-input";
import { parsePaperDocument, serializePaperDocument } from "../data/paperDocument";
import {
  PAPER_CANVAS_HEIGHT,
  PAPER_CANVAS_WIDTH,
  PAPER_NATIVE_FONT_FAMILY,
  PAPER_PADDING,
  PAPER_PLACEHOLDER_COLOR,
  PAPER_PRESET_METRICS,
  PAPER_TEXT_COLOR,
  clampPaperPresentationScale,
} from "./paperLayout";

/** Validate stringly native tokens before they enter the typed toolbar state. */
function selectionStateFromNative(event: PaperSelectionStateEvent): PaperSelectionState {
  const native = event.nativeEvent;
  const selectedPreset =
    native.preset === "default" || native.preset === "large" || native.preset === "x-large"
      ? (native.preset as PaperParagraphPreset)
      : null;
  return {
    selectedPreset,
    canApply: {
      default: native.canApplyDefault,
      large: native.canApplyLarge,
      "x-large": native.canApplyXLarge,
    },
  };
}

const PaperTextSurface = forwardRef<PaperTextSurfaceHandle, PaperTextSurfaceProps>(
  function PaperTextSurface(
    {
      document,
      onChangeDocument,
      onSelectionStateChange,
      onFocus,
      onBlur,
      editable = false,
      presentationScale = 1,
      placeholder = "",
    },
    ref,
  ) {
    /** Owns Expo's async view functions; parent receives a synchronous focus facade. */
    const nativeRef = useRef<PaperTextInputViewHandle>(null);

    useImperativeHandle(ref, () => ({
      focus: () => {
        void nativeRef.current?.focus();
      },
      blur: () => {
        void nativeRef.current?.blur();
      },
      setParagraphPreset: (preset) =>
        nativeRef.current?.setParagraphPreset(preset) ?? Promise.resolve(),
    }));

    /** Normalize the native payload at the same boundary used for stored legacy data. */
    const handleDocumentChange = (event: PaperDocumentChangeEvent) => {
      onChangeDocument?.(
        parsePaperDocument({
          version: 1,
          text: event.nativeEvent.text,
          paragraphPresets: event.nativeEvent.paragraphPresets,
        }),
      );
    };

    return (
      <PaperTextInputView
        ref={nativeRef}
        style={StyleSheet.absoluteFill}
        documentJson={serializePaperDocument(document)}
        editable={editable}
        placeholder={placeholder}
        fontFamily={PAPER_NATIVE_FONT_FAMILY}
        defaultFontSize={PAPER_PRESET_METRICS.default.fontSize}
        defaultLineHeight={PAPER_PRESET_METRICS.default.lineHeight}
        largeFontSize={PAPER_PRESET_METRICS.large.fontSize}
        largeLineHeight={PAPER_PRESET_METRICS.large.lineHeight}
        xLargeFontSize={PAPER_PRESET_METRICS["x-large"].fontSize}
        xLargeLineHeight={PAPER_PRESET_METRICS["x-large"].lineHeight}
        presentationScale={clampPaperPresentationScale(presentationScale)}
        canonicalWidth={PAPER_CANVAS_WIDTH}
        canonicalHeight={PAPER_CANVAS_HEIGHT}
        contentPadding={PAPER_PADDING}
        maximumVisibleLines={0}
        textColor={PAPER_TEXT_COLOR}
        placeholderTextColor={PAPER_PLACEHOLDER_COLOR}
        onPaperDocumentChange={onChangeDocument ? handleDocumentChange : undefined}
        onPaperSelectionStateChange={
          onSelectionStateChange
            ? (event) => onSelectionStateChange(selectionStateFromNative(event))
            : undefined
        }
        onPaperInputFocus={onFocus}
        onPaperInputBlur={onBlur}
      />
    );
  },
);

export default PaperTextSurface;
