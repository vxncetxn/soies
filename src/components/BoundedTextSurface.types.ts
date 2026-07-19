/**
 * BoundedTextSurface — shared contract over the native artefact text engine.
 *
 * Paper supplies a styled multi-paragraph document and an unconstrained line
 * count inside its physical page. Print supplies Default-only text, a fixed
 * one-line cap, and centered horizontal/vertical alignment. The native component,
 * controlled-event ordering, responder commands, and capacity oracle remain
 * identical for both adapters.
 */
import type { PaperDocument, PaperParagraphPreset } from "../data/paperDocument";
import type { ArtefactTextInputHandle } from "./ArtefactTextInput";
import type { ArtefactTextMetrics } from "./artefactTextStyle";

export type BoundedTextSelectionState = {
  /** Null means a selection intersects differently styled paragraphs. */
  selectedPreset: PaperParagraphPreset | null;
  /** False means the complete candidate document would exceed physical capacity. */
  canApply: Record<PaperParagraphPreset, boolean>;
};

export type BoundedTextSurfaceConfiguration = {
  /** Expo alias used by the non-iOS fallback renderer. */
  fontFamily: string;
  /** PostScript name resolved by UIKit's shared native view. */
  nativeFontFamily: string;
  /** Default/Large/X-Large metrics; Print supplies the Default values for all three. */
  presetMetrics: Record<PaperParagraphPreset, ArtefactTextMetrics>;
  /** Stable logical width used by native off-screen capacity measurement. */
  canonicalWidth: number;
  /** Stable logical height used by native off-screen capacity measurement. */
  canonicalHeight: number;
  /** Sole canonical inset; Print's dedicated caption box supplies zero. */
  contentPadding: number;
  /** Zero means height-only; positive values add an explicit visible-line cap. */
  maximumVisibleLines: number;
  /** False keeps Print Default-only and skips paragraph-toolbar work. */
  allowsParagraphPresets: boolean;
  /** Paper follows each paragraph's writing direction; Print centers its single line. */
  horizontalAlignment: "natural" | "center";
  /** Paper begins at its top inset; Print centers its single line. */
  verticalAlignment: "top" | "center";
  /** Fixed authored-content foreground independent of system appearance. */
  textColor: string;
  /** Prompt foreground kept separate from durable attributed storage. */
  placeholderTextColor: string;
};

export type BoundedTextSurfaceHandle = ArtefactTextInputHandle & {
  /** Apply one Paper paragraph preset; Print never exposes this command. */
  setParagraphPreset: (preset: PaperParagraphPreset) => Promise<void>;
};

export type BoundedTextSurfaceProps = {
  /** Parent-owned durable/adapter document mirrored atomically into native. */
  document: PaperDocument;
  /** Receives only complete states synchronously accepted by native layout. */
  onChangeDocument?: (document: PaperDocument) => void;
  /** Paper-only selection and preset availability. */
  onSelectionStateChange?: (state: BoundedTextSelectionState) => void;
  /** Editable adapters use focus to enter Type; output surfaces omit it. */
  onFocus?: () => void;
  /** Editable adapters use blur to leave Type; output surfaces omit it. */
  onBlur?: () => void;
  /** Readiness boundary after the controlled document has entered native layout. */
  onContentReady?: () => void;
  /** False retains the same renderer without responder/selection behavior. */
  editable?: boolean;
  /** Display-only multiplier; native capacity always measures canonical geometry. */
  presentationScale?: number;
  /** Empty output surfaces omit the prompt; Create supplies it. */
  placeholder?: string;
  /** Adapter-owned geometry, typography and constraint policy. */
  configuration: BoundedTextSurfaceConfiguration;
};
