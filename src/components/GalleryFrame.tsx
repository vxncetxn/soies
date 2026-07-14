/**
 * GalleryFrame — Astro portrait mat chrome around a live Artefact.
 *
 * Exact source geometry (`temp/frames.astro`, portrait branch): the subject is
 * `object-cover` inside a 3:4 well (`18vw`×`24vw`) with `2vw` padding; the mat
 * is 132% of the well and the outer board is 145%. This module preserves those
 * well/mat/board ratios and their back-to-front order.
 *
 * The live app deliberately adapts the subject treatment: user-authored Paper,
 * Print, and Ink are contained rather than cropped, and no extra source padding
 * is added inside the artefact itself. Paper owns its text padding; Print owns
 * its top padding and caption gap. Each artefact is first laid out at its
 * natural Home size, uniformly scaled into a protected inner inset, then given
 * Home's subtle collapsed-card shadow. The inset keeps white pages clear of the
 * well's inner edge, while the reduced frame shadow stack preserves the source's
 * board depth and light mat centre without copying every web layer.
 */
import { type ReactNode } from "react";
import { Pressable, StyleSheet, View, type ViewStyle } from "react-native";
import Animated, { type AnimatedRef } from "react-native-reanimated";

import type { Artefact } from "../data/entries";

import { isPrintArtefact, isUnknownArtefact } from "../data/entries";
import {
  getCollapsedArtefactLayout,
  PAPER_ASPECT_RATIO,
  PRINT_ASPECT_RATIO,
  type KnownArtefactType,
} from "./artefactLayout";
import { Icon } from "./Icon";
import LongPressable from "./LongPressable";
import { renderArtefactContent } from "./renderArtefactContent";

/** Astro portrait figure aspect (width / height). */
const FRAME_WELL_ASPECT = 3 / 4;
/** Outer board vs well (Astro figure:after). */
export const FRAME_BOARD_SCALE = 1.45;
/** Inner mat vs well (Astro figure:before). */
const FRAME_MAT_SCALE = 1.32;
// Reserve 4% of the well width on every edge. This is deliberately quieter
// than the web reference's 2vw padding, but it guarantees that no artefact can
// cover the well's inset shadow at the top or bottom.
const FRAME_CONTENT_INSET_SCALE = 0.04;
// Match Home's collapsed SHADOW_SM (1px offset, 2px blur, 5% opacity). Against
// the white well this is just enough to reveal a white page boundary.
const FRAME_ARTEFACT_SHADOW = "0 1px 2px rgba(0,0,0,0.05)";

function wellSizeForMaxWidth(maxWellWidth: number): { width: number; height: number } {
  return { width: maxWellWidth, height: maxWellWidth / FRAME_WELL_ASPECT };
}

/** Largest 3:4 well whose board (well × 1.45) fits inside maxBoard bounds. */
export function wellSizeFittingBoard(
  maxBoardWidth: number,
  maxBoardHeight: number,
): { width: number; height: number } {
  const wellW = Math.min(
    maxBoardWidth / FRAME_BOARD_SCALE,
    (maxBoardHeight / FRAME_BOARD_SCALE) * FRAME_WELL_ASPECT,
  );
  return wellSizeForMaxWidth(wellW);
}

/** Fit artefact aspect inside the 3:4 well (CSS object-fit: contain). */
function containSize(
  wellW: number,
  wellH: number,
  aspect: number,
): { width: number; height: number } {
  const wellAspect = wellW / wellH;
  if (aspect >= wellAspect) {
    return { width: wellW, height: wellW / aspect };
  }
  return { width: wellH * aspect, height: wellH };
}

function artefactKind(artefact: Artefact): KnownArtefactType | "unknown" {
  if (isPrintArtefact(artefact)) {
    return "print";
  }
  if (isUnknownArtefact(artefact)) {
    return "unknown";
  }
  return "paper";
}

function artefactAspect(artefact: Artefact): number {
  if (isPrintArtefact(artefact)) {
    return PRINT_ASPECT_RATIO;
  }
  return PAPER_ASPECT_RATIO;
}

type GalleryFrameProps = {
  artefact: Artefact;
  /** Inner well width (3:4 height derived). Mat/board scale out from this. */
  wellWidth: number;
  /** Viewport width used to derive the artefact's natural Home layout. */
  viewportWidth: number;
  /** Present only for the interactive frame that FocusOverlay must measure. */
  triggerRef?: AnimatedRef<Animated.View>;
  /** Adds long-press/ellipsis affordances around the otherwise presentational frame. */
  interactive?: boolean;
  /** Opens the pager-owned shared FocusOverlay for this frame. */
  onRequestFocus?: () => void;
  /** Optional stage styling supplied by a presentation surface. */
  style?: ViewStyle;
  /** Optional pre-rendered subject; defaults to the artefact's live content. */
  children?: ReactNode;
};

const GalleryFrame = ({
  artefact,
  wellWidth,
  viewportWidth,
  triggerRef,
  interactive = false,
  onRequestFocus,
  style,
  children,
}: GalleryFrameProps) => {
  const wellW = wellWidth;
  const wellH = wellWidth / FRAME_WELL_ASPECT;
  const boardSize = { width: wellW * FRAME_BOARD_SCALE, height: wellH * FRAME_BOARD_SCALE };
  const matSize = { width: wellW * FRAME_MAT_SCALE, height: wellH * FRAME_MAT_SCALE };
  const contentInset = wellW * FRAME_CONTENT_INSET_SCALE;
  const contentBounds = {
    width: wellW - contentInset * 2,
    height: wellH - contentInset * 2,
  };

  const kind = artefactKind(artefact);
  const natural =
    kind === "unknown"
      ? containSize(wellW, wellH, artefactAspect(artefact))
      : getCollapsedArtefactLayout(viewportWidth, kind);
  const target = containSize(
    contentBounds.width,
    contentBounds.height,
    natural.width / natural.height,
  );
  const scale = target.width / natural.width;

  const content = children ?? renderArtefactContent(artefact);

  const frame = (
    <Animated.View
      ref={triggerRef}
      // Only the focus trigger needs a native node for UI-thread measurement.
      // Clones and picker frames may remain collapsible to reduce native views.
      collapsable={triggerRef ? false : undefined}
      style={[
        styles.stage,
        {
          width: boardSize.width,
          height: boardSize.height,
        },
        style,
      ]}
    >
      <View
        pointerEvents="none"
        style={[styles.board, { width: boardSize.width, height: boardSize.height }]}
      />
      <View
        pointerEvents="none"
        style={[styles.mat, { width: matSize.width, height: matSize.height }]}
      />
      <View
        pointerEvents="none"
        // Extend beyond the opaque well so the centre light remains visible in
        // the surrounding mat ring instead of being fully occluded.
        style={[
          styles.matHighlight,
          { width: matSize.width * 0.96, height: matSize.height * 0.94 },
        ]}
      />
      <View style={[styles.well, { width: wellW, height: wellH }]}>
        {/*
          Same contain pattern as ShareArtefactCard: outer slot is the fitted
          size; inner keeps Home natural size so fixed Print/Paper chrome scales
          uniformly via transformOrigin top-left.
        */}
        <View style={[styles.artefact, { width: target.width, height: target.height }]}>
          <View
            style={{
              width: natural.width,
              height: natural.height,
              transform: [{ scale }],
              transformOrigin: "top left",
            }}
          >
            {content}
          </View>
        </View>
      </View>
    </Animated.View>
  );

  if (!interactive) {
    return frame;
  }

  return (
    <View className="relative items-center justify-center">
      <LongPressable onLongPress={onRequestFocus} accessibilityRole="button">
        {frame}
      </LongPressable>
      <Pressable
        onPress={onRequestFocus}
        accessibilityRole="button"
        accessibilityLabel="Gallery artefact options"
        className="absolute -top-12 -right-2 z-[110] rounded-full p-2"
        hitSlop={8}
      >
        <Icon name="ellipsis-horizontal" size={20} color="#79716B" />
      </Pressable>
    </View>
  );
};

const styles = StyleSheet.create({
  stage: {
    alignItems: "center",
    justifyContent: "center",
  },
  board: {
    position: "absolute",
    backgroundColor: "#F8F8F8",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(255,255,255,0.9)",
    boxShadow:
      "0 18px 34px rgba(0,0,0,0.20), 0 5px 10px rgba(0,0,0,0.11), inset 0 0 0 1px rgba(255,255,255,0.72)",
  },
  mat: {
    position: "absolute",
    backgroundColor: "#F9F9F7",
    boxShadow: "inset 0 8px 7px rgba(0,0,0,0.18), 0 3px 3px rgba(255,255,255,0.92)",
  },
  // A low-contrast ellipse approximates the reference's radial centre light
  // without introducing a gradient/rendering dependency for a subtle cue.
  matHighlight: {
    position: "absolute",
    borderRadius: 9999,
    backgroundColor: "rgba(255,255,255,0.18)",
  },
  well: {
    overflow: "hidden",
    backgroundColor: "#FFFFFF",
    alignItems: "center",
    justifyContent: "center",
    boxShadow: "inset 0 4px 2px rgba(0,0,0,0.18)",
  },
  // The page owns its clipping; this wrapper stays overflow-visible so the
  // boundary shadow can fall onto the surrounding white well.
  artefact: {
    boxShadow: FRAME_ARTEFACT_SHADOW,
  },
});

export default GalleryFrame;
