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
 * On iOS, `PaperTextSurface.ios` delegates each proposed edit to TextKit before
 * paint. Only fitting documents reach `onChangeDocument`; this removes the old hidden
 * mirror → React truncation → dynamic maxLength loop that flashed overflow and
 * sometimes deleted an already-valid suffix. Final display uses the same
 * typography in `Paper.tsx`, so Type is the eventual output rather than an
 * approximation of it.
 */
import type { ReactNode, Ref, RefObject } from "react";

import { useRef } from "react";
import { StyleSheet, useWindowDimensions } from "react-native";
import Animated, {
  type SharedValue,
  interpolate,
  useAnimatedStyle,
  withSpring,
} from "react-native-reanimated";

import type { PaperDocument } from "../data/paperDocument";
import type { PaperSelectionState, PaperTextSurfaceHandle } from "./PaperTextSurface.types";

import { SPRING_CONFIG } from "../constants/animation";
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
  /** 0 collapsed → 1 expanded; shared with Create chrome and pager controls. */
  expandProgress: SharedValue<number>;
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
};

const EditablePaper = ({
  document,
  onChangeDocument,
  onSelectionStateChange,
  expandProgress,
  textInputRef,
  keepExpandedOnBlurRef,
  suppressArtefactFocusRef,
  editable = true,
  inkOverlayUri = null,
  scribbleActive = false,
  scribbleCanvas = null,
}: EditablePaperProps) => {
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
    expandProgress.set(withSpring(1, SPRING_CONFIG));
  };

  const handleBlur = () => {
    if (keepExpandedOnBlurRef?.current) {
      return;
    }
    expandProgress.set(withSpring(0, SPRING_CONFIG));
  };

  // The surface owns one transform from collapsed scale to identity. A previous
  // implementation put the reciprocal scales on nested views; that looked
  // mathematically equivalent but forced Core Animation to resample the native
  // text/caret layer even after Type had visually reached its expanded size.
  const frameStyle = useAnimatedStyle(() => ({
    transform: [
      {
        scale: interpolate(expandProgress.get(), [0, 1], [collapsedPresentationScale, 1]),
      },
    ],
  }));

  return (
    <Animated.View
      style={[
        styles.displayFrame,
        { width: expandedWidth, height: expandedHeight, transformOrigin: "top" },
        frameStyle,
      ]}
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
        />
        {inkOverlayUri && !scribbleActive ? <InkOverlay uri={inkOverlayUri} /> : null}
        {scribbleCanvas}
      </PaperCanvas>
    </Animated.View>
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
