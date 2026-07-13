/**
 * ShareArtefactCard — renders one known artefact (Paper or Print + Ink) for
 * share preview and export. Unknown artefacts are filtered before they reach
 * this component; we never invent a placeholder that could be shared.
 *
 * Layout starts from the same canonical collapsed size as Home/Create, then
 * uniformly scales to the requested width. Print is narrower than Paper at that
 * base size; treating both as `screenWidth - 80` scales its fixed top padding,
 * image gap, and caption from the wrong geometry.
 *
 * Export readiness is a small barrier over native layout, the Print photo, and
 * optional Ink. `onReady` fires once only after all required pixels report
 * `onDisplay`; any image error fails the capture instead of leaving the action
 * spinner pending forever.
 */
import { useCallback, useRef } from "react";
import { useWindowDimensions, View } from "react-native";

import type { PaperArtefact, PrintArtefact } from "../data/entries";

import { getCollapsedArtefactLayout } from "../components/artefactLayout";
import Paper from "../components/Paper";
import Print from "../components/Print";
import { isPrintArtefact } from "../data/entries";
import { SHARE_ARTEFACT_WIDTH } from "./constants";

type ShareArtefactCardProps = {
  artefact: PaperArtefact | PrintArtefact;
  /** Display width after scale; height follows A4 / print aspect. */
  width: number;
  onReady?: () => void;
  onError?: (error: Error) => void;
};

export function ShareArtefactCard({ artefact, width, onReady, onError }: ShareArtefactCardProps) {
  const { width: screenWidth } = useWindowDimensions();
  const isPrint = isPrintArtefact(artefact);
  const hasInk = Boolean(artefact.inkOverlayPath);
  const { width: layoutWidth, height: layoutHeight } = getCollapsedArtefactLayout(
    screenWidth,
    isPrint ? "print" : "paper",
  );
  const scale = width / layoutWidth;
  const displayHeight = layoutHeight * scale;
  const exportScale = width / SHARE_ARTEFACT_WIDTH;
  const caption = typeof artefact.text === "string" ? artefact.text : String(artefact.text ?? "");
  const layoutReadyRef = useRef(false);
  const photoReadyRef = useRef(!isPrint);
  const inkReadyRef = useRef(!hasInk);
  const reportedRef = useRef(false);
  const failedRef = useRef(false);

  const reportReadyIfComplete = useCallback(() => {
    if (
      failedRef.current ||
      reportedRef.current ||
      !layoutReadyRef.current ||
      !photoReadyRef.current ||
      !inkReadyRef.current
    ) {
      return;
    }
    reportedRef.current = true;
    onReady?.();
  }, [onReady]);

  const fail = useCallback(
    (source: "photo" | "ink") => {
      if (failedRef.current || reportedRef.current) {
        return;
      }
      failedRef.current = true;
      onError?.(new Error(`Share ${source} image failed to display`));
    },
    [onError],
  );

  const onLayout = useCallback(() => {
    layoutReadyRef.current = true;
    reportReadyIfComplete();
  }, [reportReadyIfComplete]);

  const onPhotoDisplay = useCallback(() => {
    photoReadyRef.current = true;
    reportReadyIfComplete();
  }, [reportReadyIfComplete]);

  const onInkDisplay = useCallback(() => {
    inkReadyRef.current = true;
    reportReadyIfComplete();
  }, [reportReadyIfComplete]);

  return (
    <View
      onLayout={onLayout}
      style={{
        width,
        height: displayHeight,
        boxShadow: `0 ${4 * exportScale}px ${16 * exportScale}px rgba(0,0,0,0.18)`,
      }}
    >
      <View style={{ width, height: displayHeight, overflow: "hidden" }}>
        <View
          style={{
            width: layoutWidth,
            height: layoutHeight,
            transform: [{ scale }],
            transformOrigin: "top left",
          }}
        >
          {isPrint ? (
            <Print
              imagePath={artefact.imagePath}
              inkOverlayPath={artefact.inkOverlayPath}
              onImageDisplay={onPhotoDisplay}
              onImageError={() => fail("photo")}
              onInkDisplay={onInkDisplay}
              onInkError={() => fail("ink")}
            >
              {caption}
            </Print>
          ) : (
            <Paper
              inkOverlayPath={artefact.inkOverlayPath}
              onInkDisplay={onInkDisplay}
              onInkError={() => fail("ink")}
            >
              {caption}
            </Paper>
          )}
        </View>
      </View>
    </View>
  );
}
