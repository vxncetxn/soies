/**
 * EditablePaper — Type/Scribble authoring on the canonical Paper canvas.
 *
 * There are two coordinate systems but only one composited scale layer:
 *   1. TextKit receives the final expanded dimensions plus proportional font
 *      metrics, while capacity remains pinned to Paper's canonical canvas.
 *   2. One expanded-size native surface is downscaled for Default and springs
 *      directly to identity for Type/Scribble. Do not split that scale across
 *      inverse parent/child transforms: although their product is 1, Core
 *      Animation rasterizes the intermediate layers and softens glyphs/caret.
 *
 * On iOS, `BoundedTextSurface.ios` delegates each proposed edit to TextKit before
 * paint. Only fitting documents reach `onChangeDocument`; this removes the old hidden
 * mirror → React truncation → dynamic maxLength loop that flashed overflow and
 * sometimes deleted an already-valid suffix. Final display uses the same
 * typography in `Paper.tsx`, so Type is the eventual output rather than an
 * approximation of it.
 */
import type { ReactNode, Ref, RefObject } from "react";

import { useRef } from "react";
import { useWindowDimensions } from "react-native";
import { EaseView } from "react-native-ease";
import { StyleSheet } from "react-native-unistyles";

import type { PaperDocument } from "../data/paperDocument";
import type { PaperSelectionState, PaperTextSurfaceHandle } from "./PaperTextSurface.types";

import { EASE_CREATE_EXPANSION_SPRING } from "../constants/animation";
import { useReducedMotionPreference } from "../hooks/useReducedMotionPreference";
import { getCollapsedArtefactLayout } from "./artefactLayout";
import InkOverlay from "./InkOverlay";
import { PaperCanvas } from "./Paper";
import { PAPER_PLACEHOLDER, paperCanvasScaleForDisplayWidth } from "./paperLayout";
import PaperTextSurface from "./PaperTextSurface";

function assignRef<T>(ref: Ref<T> | undefined, value: T | null) {
  if (!ref) {
    return;
  }
  if (typeof ref === "function") {
    ref(value);
    return;
  }
  ref.current = value;
}

type EditablePaperProps = {
  /** Accepted text + paragraph presets persisted by CreatePaperScreen. */
  document: PaperDocument;
  /** Receives native-validated changes that already fit the canonical page. */
  onChangeDocument: (document: PaperDocument) => void;
  /** Mirrors the native selection/capacity state into the keyboard toolbar. */
  onSelectionStateChange: (state: PaperSelectionState) => void;
  /** Discrete visual endpoint supplied by the Create authoring phase. */
  expanded: boolean;
  onRequestType: () => void;
  onRequestDefault: () => void;
  /** Programmatic focus seam used by Back and artefact Prev/Next navigation. */
  textInputRef: Ref<PaperTextSurfaceHandle | null>;
  /** Keeps the bloom expanded while Prev/Next transfers first responder. */
  keepExpandedOnBlurRef?: RefObject<boolean>;
  /** Pager drag guard: a swipe ending on Paper must not enter Type. */
  suppressArtefactFocusRef?: RefObject<boolean>;
  /** Saving locks input without hiding the accepted draft. */
  editable?: boolean;
  /** Committed Ink fallback while the persistent native canvas is hidden. */
  inkOverlayUri?: string | null;
  /** Scribble owns the expanded state and disables the text responder. */
  scribbleActive?: boolean;
  /** Per-artefact live Ink canvas, mounted in the same canonical coordinates. */
  scribbleCanvas?: ReactNode;
  /** First editable surface readiness gate for the root Entry transition. */
  onContentReady?: () => void;
};

const EditablePaper = ({
  document,
  onChangeDocument,
  onSelectionStateChange,
  expanded,
  onRequestType,
  onRequestDefault,
  textInputRef,
  keepExpandedOnBlurRef,
  suppressArtefactFocusRef,
  editable = true,
  inkOverlayUri = null,
  scribbleActive = false,
  scribbleCanvas = null,
  onContentReady,
}: EditablePaperProps) => {
  const reduceMotionEnabled = useReducedMotionPreference();
  const { width: windowWidth } = useWindowDimensions();
  const localInputRef = useRef<PaperTextSurfaceHandle>(null);
  const { width: baseWidth } = getCollapsedArtefactLayout(windowWidth, "paper");
  const expandedWidth = windowWidth - 20;
  const expandedHeight = expandedWidth * (297 / 210);
  // Render once at the final expanded resolution. Default mode only downsizes
  // this surface; the one bloom transform reaches literal identity in Type.
  // Canonical TextKit measurement remains unscaled inside the native module.
  const presentationScale = paperCanvasScaleForDisplayWidth(expandedWidth);
  const collapsedPresentationScale = baseWidth / expandedWidth;

  const handleFocus = () => {
    if (scribbleActive || suppressArtefactFocusRef?.current) {
      queueMicrotask(() => {
        localInputRef.current?.blur();
      });
      return;
    }
    onRequestType();
  };

  const handleBlur = () => {
    if (keepExpandedOnBlurRef?.current) {
      return;
    }
    onRequestDefault();
  };

  const scale = expanded ? 1 : collapsedPresentationScale;

  return (
    <EaseView
      style={[styles.displayFrame, { width: expandedWidth, height: expandedHeight }]}
      transformOrigin={{ x: 0.5, y: 0 }}
      initialAnimate={{ scale }}
      animate={{ scale }}
      transition={reduceMotionEnabled ? { type: "none" } : EASE_CREATE_EXPANSION_SPRING}
    >
      {/* Keep TextKit mounted at the final screen-space size for the whole
          session. Only this parent's single scale changes, so Type settles on
          an un-resampled UIView without swapping the first responder. */}
      <PaperCanvas presentationScale={presentationScale}>
        <PaperTextSurface
          ref={(node) => {
            localInputRef.current = node;
            assignRef(textInputRef, node);
          }}
          document={document}
          onChangeDocument={onChangeDocument}
          onSelectionStateChange={onSelectionStateChange}
          onFocus={handleFocus}
          onBlur={handleBlur}
          editable={editable && !scribbleActive}
          presentationScale={presentationScale}
          placeholder={PAPER_PLACEHOLDER}
          onContentReady={onContentReady}
        />
        {inkOverlayUri && !scribbleActive ? <InkOverlay uri={inkOverlayUri} /> : null}
        {scribbleCanvas}
      </PaperCanvas>
    </EaseView>
  );
};

const styles = StyleSheet.create({
  // CreatePaperScreen already reserves one expanded page slot. Scaling around
  // its top-center keeps Default visually centered without introducing a
  // second wrapper whose inverse transform would blur focused native content.
  displayFrame: {
    position: "relative",
    overflow: "visible",
  },
});

export default EditablePaper;
