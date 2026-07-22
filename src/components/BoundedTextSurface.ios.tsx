/**
 * BoundedTextSurface (iOS) — the one React seam over native artefact text.
 *
 * Paper and Print pass different configuration but share this complete bridge:
 * atomic document serialization, native controlled-event normalization,
 * responder commands, paragraph preflight, physical line-cap enforcement,
 * horizontal/vertical alignment, and presentation scaling. Keeping those responsibilities
 * here prevents either adapter from rebuilding a subtly different WYSIWYG or
 * IME path.
 */
import { forwardRef, useImperativeHandle, useRef } from "react";
import { StyleSheet } from "react-native-unistyles";

import type {
  PaperDocumentChangeEvent,
  PaperSelectionStateEvent,
  PaperTextInputViewHandle,
} from "../../modules/paper-text-input";
import type { PaperParagraphPreset } from "../data/paperDocument";
import type {
  BoundedTextSelectionState,
  BoundedTextSurfaceHandle,
  BoundedTextSurfaceProps,
} from "./BoundedTextSurface.types";

import { PaperTextInputView } from "../../modules/paper-text-input";
import { parsePaperDocument, serializePaperDocument } from "../data/paperDocument";
import { clampArtefactTextPresentationScale } from "./artefactTextStyle";

/** Validate stringly native tokens before they enter Paper's typed toolbar state. */
function selectionStateFromNative(event: PaperSelectionStateEvent): BoundedTextSelectionState {
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

/**
 * Maps adapter props and native callbacks on React's JS thread; UIKit owns all
 * responder, acceptance, measurement and alignment work behind this seam.
 */
const BoundedTextSurface = forwardRef<BoundedTextSurfaceHandle, BoundedTextSurfaceProps>(
  function BoundedTextSurface(
    {
      document,
      onChangeDocument,
      onSelectionStateChange,
      onFocus,
      onBlur,
      onContentReady,
      editable = false,
      presentationScale = 1,
      placeholder = "",
      configuration,
    },
    ref,
  ) {
    /** Owns Expo's async view functions; adapters receive a synchronous focus facade. */
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

    /** Normalize the native payload at the same forgiving boundary as persisted Paper data. */
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
        fontFamily={configuration.nativeFontFamily}
        defaultFontSize={configuration.presetMetrics.default.fontSize}
        defaultLineHeight={configuration.presetMetrics.default.lineHeight}
        largeFontSize={configuration.presetMetrics.large.fontSize}
        largeLineHeight={configuration.presetMetrics.large.lineHeight}
        xLargeFontSize={configuration.presetMetrics["x-large"].fontSize}
        xLargeLineHeight={configuration.presetMetrics["x-large"].lineHeight}
        presentationScale={clampArtefactTextPresentationScale(presentationScale)}
        canonicalWidth={configuration.canonicalWidth}
        canonicalHeight={configuration.canonicalHeight}
        contentPadding={configuration.contentPadding}
        maximumVisibleLines={configuration.maximumVisibleLines}
        allowsParagraphPresets={configuration.allowsParagraphPresets}
        horizontalTextAlignment={configuration.horizontalAlignment}
        centersTextVertically={configuration.verticalAlignment === "center"}
        textColor={configuration.textColor}
        placeholderTextColor={configuration.placeholderTextColor}
        onPaperDocumentChange={onChangeDocument ? handleDocumentChange : undefined}
        onPaperSelectionStateChange={
          onSelectionStateChange
            ? (event) => onSelectionStateChange(selectionStateFromNative(event))
            : undefined
        }
        onPaperInputFocus={onFocus}
        onPaperInputBlur={onBlur}
        onPaperContentReady={onContentReady}
      />
    );
  },
);

export default BoundedTextSurface;
