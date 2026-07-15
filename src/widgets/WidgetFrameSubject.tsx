/**
 * WidgetFrameSubject — capture-aware live Artefact content.
 *
 * ArtefactFrame owns geometry; this child owns only readiness. Capture starts
 * after native layout plus every required Print photo and Ink overlay report
 * display. Any image error fails the pending job instead of publishing a
 * partially blank frame or waiting until the outer timeout.
 *
 * Map:
 * - artefact shape declares which photo/Ink barriers are required;
 * - `CaptureReadinessBarrier` accepts callbacks in any native event order;
 * - Paper/Print receive display callbacks while unknown content needs layout only.
 */
import { useRef } from "react";
import { View } from "react-native";

import type { Artefact } from "../data/entries";

import Paper from "../components/Paper";
import Print from "../components/Print";
import { renderArtefactContent } from "../components/renderArtefactContent";
import { isPrintArtefact, isUnknownArtefact } from "../data/entries";
import { CaptureReadinessBarrier } from "./CaptureReadinessBarrier";

type WidgetFrameSubjectProps = {
  artefact: Artefact;
  /** Called once after all pixels required by this artefact are display-ready. */
  onReady: () => void;
  /** Fails the owning capture immediately with source-specific context. */
  onError: (error: Error) => void;
};

export function WidgetFrameSubject({ artefact, onReady, onError }: WidgetFrameSubjectProps) {
  const isPrint = isPrintArtefact(artefact);
  const hasInk = !isUnknownArtefact(artefact) && Boolean(artefact.inkOverlayPath);
  // The component is keyed by artefact revision in the capture host, so this
  // barrier owns exactly one native subject lifetime and one callback pair.
  const barrier = useRef(new CaptureReadinessBarrier(isPrint, hasInk, onReady, onError)).current;

  return (
    <View className="flex-1" onLayout={() => barrier.markLayoutReady()}>
      {isPrint ? (
        <Print
          imagePath={artefact.imagePath}
          inkOverlayPath={artefact.inkOverlayPath}
          onImageDisplay={() => barrier.markPhotoReady()}
          onImageError={() => barrier.fail("photo")}
          onInkDisplay={() => barrier.markInkReady()}
          onInkError={() => barrier.fail("ink")}
        >
          {artefact.text}
        </Print>
      ) : isUnknownArtefact(artefact) ? (
        renderArtefactContent(artefact)
      ) : (
        <Paper
          inkOverlayPath={artefact.inkOverlayPath}
          onInkDisplay={() => barrier.markInkReady()}
          onInkError={() => barrier.fail("ink")}
        >
          {artefact.text}
        </Paper>
      )}
    </View>
  );
}
