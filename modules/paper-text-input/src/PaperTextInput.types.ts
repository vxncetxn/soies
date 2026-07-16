/**
 * TypeScript contract for the native bounded TextKit surface.
 *
 * The module remains stored under `paper-text-input` because Paper is its first
 * consumer, but the geometry and line-limit props are deliberately generic: a
 * future Print adapter can expose only Default and pass
 * `maximumVisibleLines=2` without rebuilding the synchronous native acceptance
 * path. Paper remains the only adapter in this change set.
 */
import type { ColorValue, StyleProp, ViewStyle } from "react-native";

export type PaperDocumentChangeEvent = {
  nativeEvent: {
    /** Full accepted plain text after the native mutation. */
    text: string;
    /** One native-validated token per newline-delimited paragraph. */
    paragraphPresets: string[];
  };
};

export type PaperSelectionStateEvent = {
  nativeEvent: {
    /** `mixed` when the selection intersects differently styled paragraphs. */
    preset: string;
    /** Native capacity preflight for each toolbar choice. */
    canApplyDefault: boolean;
    canApplyLarge: boolean;
    canApplyXLarge: boolean;
  };
};

export type PaperTextInputViewProps = {
  /** One atomic controlled prop prevents text/style updates arriving separately. */
  documentJson: string;
  /** Controls responder, selection, and mutation while retaining the same renderer. */
  editable: boolean;
  /** Authoring-only prompt; read surfaces intentionally pass an empty string. */
  placeholder: string;
  /** Native PostScript font name; Expo's JavaScript alias is not valid here. */
  fontFamily: string;
  /** Canonical Default glyph size before proportional raster presentation. */
  defaultFontSize: number;
  /** Fixed Default line box; native font leading is disabled. */
  defaultLineHeight: number;
  /** Canonical Large glyph size supplied by the Paper adapter. */
  largeFontSize: number;
  /** Fixed Large line box supplied alongside its glyph size. */
  largeLineHeight: number;
  /** Canonical X-Large glyph size supplied by the Paper adapter. */
  xLargeFontSize: number;
  /** Fixed X-Large line box supplied alongside its glyph size. */
  xLargeLineHeight: number;
  /** Raster scale only; canonical capacity never changes with this value. */
  presentationScale: number;
  /** Persisted logical artefact width used by the off-screen capacity oracle. */
  canonicalWidth: number;
  /** Persisted logical artefact height used by the off-screen capacity oracle. */
  canonicalHeight: number;
  /** Equal inset on all logical edges; scaled only for the displayed surface. */
  contentPadding: number;
  /** Zero means physical bounds only; Print can later configure two lines. */
  maximumVisibleLines: number;
  /** Fixed authored-content foreground; independent of adaptive app chrome. */
  textColor: ColorValue;
  /** Authoring prompt color, kept separate from durable content attributes. */
  placeholderTextColor: ColorValue;
  /** Emits only mutations accepted by canonical TextKit measurement. */
  onPaperDocumentChange?: (event: PaperDocumentChangeEvent) => void;
  /** Emits caret/selection preset plus capacity-preflight availability. */
  onPaperSelectionStateChange?: (event: PaperSelectionStateEvent) => void;
  /** Namespaced direct event avoids React Native's inherited bubbling topFocus. */
  onPaperInputFocus?: () => void;
  /** Namespaced direct event avoids React Native's inherited bubbling topBlur. */
  onPaperInputBlur?: () => void;
  /** React Native positions the host; native owns all internal TextKit geometry. */
  style?: StyleProp<ViewStyle>;
};

/** View functions installed by Expo Modules on the native component prototype. */
export type PaperTextInputViewHandle = {
  /** Expo async view function that requests UIKit first responder. */
  focus: () => Promise<void>;
  /** Expo async view function that resigns UIKit first responder. */
  blur: () => Promise<void>;
  /** Rejected presets are reported through the next selection-state event. */
  setParagraphPreset: (preset: string) => Promise<void>;
};
