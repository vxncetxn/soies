/**
 * Paper — final renderer for one canonical, device-independent text artefact.
 *
 * `PaperTextSurface` is shared with Type, so read output and editing use the
 * same TextKit font resolution, paragraph attributes, wrapping, and line boxes.
 * Presentation may rasterize that logical 310-point page at a proportional
 * scale, but no consumer receives a new text width: padding and typography are
 * scaled by the same factor and capacity remains canonical.
 *
 * Home provides its final expanded scale up front. The resulting high-resolution
 * Paper is downscaled in Default and reaches transform scale 1 when expanded,
 * which keeps read glyphs sharp without reflow. Frames, widgets, and Share keep
 * the default scale of 1 and continue scaling/capturing the complete canvas.
 */
import { type PropsWithChildren, useEffect, useState } from "react";
import { View } from "react-native";
import { StyleSheet } from "react-native-unistyles";

import { PaperContentReadinessLatch } from "../data/paperContentReadiness";
import { serializePaperDocument, type PaperDocument } from "../data/paperDocument";
import { fixedTokens } from "../styles/tokens";
import { useArtefactPresentationScale } from "./ArtefactPresentationScale";
import InkOverlay from "./InkOverlay";
import {
  PAPER_CANVAS_HEIGHT,
  PAPER_CANVAS_WIDTH,
  clampPaperPresentationScale,
} from "./paperLayout";
import PaperTextSurface from "./PaperTextSurface";

type PaperProps = {
  /** Durable text + paragraph presets rendered identically to authoring. */
  document: PaperDocument;
  /** Derived transparent Ink cache, composed above final text. */
  inkOverlayPath?: string;
  /** Capture readiness signal once the optional Ink pixels are displayed. */
  onInkDisplay?: () => void;
  /** Capture failure signal for a missing/unreadable Ink cache. */
  onInkError?: () => void;
  /** Calendar request waiting for this exact Paper document to be ready. */
  textReadinessRequestId?: number | null;
  /** Signals that the requested document has completed native text layout. */
  onTextDisplay?: (requestId: number) => void;
};

type PaperCanvasProps = PropsWithChildren<{
  /** Explicit authoring scale; otherwise inherit Home's presentation provider. */
  presentationScale?: number;
}>;

/** Proportionally rasterized page chrome shared by output and authoring. */
export function PaperCanvas({ children, presentationScale }: PaperCanvasProps) {
  const inheritedScale = useArtefactPresentationScale();
  const scale = clampPaperPresentationScale(presentationScale ?? inheritedScale);

  return (
    <View
      style={[
        styles.canvas,
        {
          width: PAPER_CANVAS_WIDTH * scale,
          height: PAPER_CANVAS_HEIGHT * scale,
        },
      ]}
    >
      {children}
    </View>
  );
}

const Paper = ({
  document,
  inkOverlayPath,
  onInkDisplay,
  onInkError,
  textReadinessRequestId = null,
  onTextDisplay,
}: PaperProps) => {
  const presentationScale = useArtefactPresentationScale();
  const documentKey = serializePaperDocument(document);
  const [contentReadiness] = useState(() => new PaperContentReadinessLatch());

  const handleNativeTextReady = () => {
    if (
      contentReadiness.contentReady(documentKey, textReadinessRequestId) &&
      textReadinessRequestId !== null
    ) {
      onTextDisplay?.(textReadinessRequestId);
    }
  };

  // Native layout is an edge: an already-mounted Paper does not emit it again
  // merely because Calendar targets that Paper later. Replay the retained
  // document readiness once for each new handoff request.
  useEffect(() => {
    if (
      textReadinessRequestId !== null &&
      contentReadiness.request(documentKey, textReadinessRequestId)
    ) {
      onTextDisplay?.(textReadinessRequestId);
    }
  }, [contentReadiness, documentKey, onTextDisplay, textReadinessRequestId]);

  return (
    <PaperCanvas>
      <PaperTextSurface
        document={document}
        presentationScale={presentationScale}
        onContentReady={handleNativeTextReady}
      />
      {inkOverlayPath ? (
        <InkOverlay uri={inkOverlayPath} onDisplay={onInkDisplay} onError={onInkError} />
      ) : null}
    </PaperCanvas>
  );
};

const styles = StyleSheet.create({
  // Every consumer transforms/captures this complete proportional page. Hidden
  // overflow clips text, Ink, and the native surface at the same eventual edge.
  canvas: {
    backgroundColor: fixedTokens.artefact.paperSurface,
    position: "relative",
    overflow: "hidden",
  },
});

export default Paper;
