/**
 * GalleryFrame — Astro portrait mat chrome around a live Artefact.
 *
 * Source (`temp/frames.astro` portrait): figure well is 3:4 (`18vw`×`24vw`);
 * mat `:before` is 132% of the well; outer board `:after` is 145%. The artefact
 * is *contained* inside the fixed 3:4 well (centered), matching a classic
 * passe-partout frame — the well does not adopt Paper/Print aspect.
 *
 * Paper/Print use fixed chrome (pt-8, 16pt type, gaps) sized for the Home deck.
 * Shrinking only the wrapper lets that chrome overflow and get clipped. Instead
 * we lay the artefact out at its natural Home size and uniformly scale it to
 * fit the well (object-fit: contain).
 */
import { type ReactNode } from "react";
import { Pressable, StyleSheet, useWindowDimensions, View, type ViewStyle } from "react-native";
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
export const FRAME_WELL_ASPECT = 3 / 4;
/** Outer board vs well (Astro figure:after). */
export const FRAME_BOARD_SCALE = 1.45;
/** Inner mat vs well (Astro figure:before). */
export const FRAME_MAT_SCALE = 1.32;

/** @deprecated Use FRAME_WELL_ASPECT. */
const WELL_ASPECT = FRAME_WELL_ASPECT;

export function wellSizeForMaxWidth(maxWellWidth: number): { width: number; height: number } {
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
  triggerRef?: AnimatedRef<Animated.View>;
  interactive?: boolean;
  onRequestFocus?: () => void;
  style?: ViewStyle;
  children?: ReactNode;
};

const GalleryFrame = ({
  artefact,
  wellWidth,
  triggerRef,
  interactive = false,
  onRequestFocus,
  style,
  children,
}: GalleryFrameProps) => {
  const { width: screenWidth } = useWindowDimensions();
  const wellW = wellWidth;
  const wellH = wellWidth / FRAME_WELL_ASPECT;
  const boardSize = { width: wellW * FRAME_BOARD_SCALE, height: wellH * FRAME_BOARD_SCALE };
  const matSize = { width: wellW * FRAME_MAT_SCALE, height: wellH * FRAME_MAT_SCALE };

  const kind = artefactKind(artefact);
  const natural =
    kind === "unknown"
      ? containSize(wellW, wellH, artefactAspect(artefact))
      : getCollapsedArtefactLayout(screenWidth, kind);
  const target = containSize(wellW, wellH, natural.width / natural.height);
  const scale = target.width / natural.width;

  const content = children ?? renderArtefactContent(artefact);

  const frame = (
    <Animated.View
      ref={triggerRef}
      collapsable={false}
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
      <View style={[styles.well, { width: wellW, height: wellH }]}>
        {/*
          Same contain pattern as ShareArtefactCard: outer slot is the fitted
          size; inner keeps Home natural size so fixed Print/Paper chrome scales
          uniformly via transformOrigin top-left.
        */}
        <View
          style={{
            width: target.width,
            height: target.height,
            overflow: "hidden",
          }}
        >
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
        accessibilityLabel="Gallery item options"
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
    boxShadow: "0 16px 32px rgba(0,0,0,0.22), 0 4px 8px rgba(0,0,0,0.12)",
  },
  mat: {
    position: "absolute",
    backgroundColor: "#F8F8F8",
    boxShadow:
      "inset 0 10px 8px rgba(0,0,0,0.22), inset 2px 0 2px rgba(0,0,0,0.08), inset -2px 0 2px rgba(0,0,0,0.05), 0 4px 3px #fff",
  },
  well: {
    overflow: "hidden",
    backgroundColor: "#FFFFFF",
    alignItems: "center",
    justifyContent: "center",
    boxShadow: "inset 0 4px 2px rgba(0,0,0,0.18)",
  },
});

export default GalleryFrame;
export { WELL_ASPECT };
