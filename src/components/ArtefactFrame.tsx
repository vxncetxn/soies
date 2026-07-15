/**
 * ArtefactFrame — Astro portrait mat chrome around one live or cached Artefact.
 *
 * Exact source geometry (`temp/frames.astro`, portrait branch): the subject is
 * inside a 3:4 well (`18vw`×`24vw`); the mat is 132% of the well and the outer
 * board is 145%. This renderer and its pure `artefactFrameGeometry` sibling own
 * those ratios, so in-app previews and widget captures cannot drift into subtly
 * different frames.
 *
 * Live Paper, Print, and Ink are contained rather than cropped. Each artefact
 * is first laid out at its natural Home size, uniformly scaled into a protected
 * inner inset, then given Home's subtle collapsed-card shadow. Every shadow is
 * proportional to board width so a cached large render and a live small prompt
 * remain visually identical after fitting. Capture callers may provide
 * `children` with explicit image-readiness callbacks; normal callers receive
 * the standard live artefact renderer.
 */
import { type ReactNode } from "react";
import { StyleSheet, View, type StyleProp, type ViewStyle } from "react-native";

import type { Artefact } from "../data/entries";

import { isPrintArtefact, isUnknownArtefact } from "../data/entries";
import {
  FRAME_BOARD_SCALE,
  FRAME_BOARD_SHADOW_BLUR,
  FRAME_BOARD_SHADOW_OFFSET_Y,
  frameEffectScaleForBoardWidth,
} from "./artefactFrameGeometry";
import {
  getCollapsedArtefactLayout,
  PAPER_ASPECT_RATIO,
  PRINT_ASPECT_RATIO,
  type KnownArtefactType,
} from "./artefactLayout";
import { renderArtefactContent } from "./renderArtefactContent";

/** Astro portrait figure aspect (width / height). */
const FRAME_WELL_ASPECT = 3 / 4;
/** Inner mat vs well (Astro figure:before). */
const FRAME_MAT_SCALE = 1.32;
// Reserve 4% of the well width on every edge so no artefact can cover the
// well's inset shadow at the top or bottom.
const FRAME_CONTENT_INSET_SCALE = 0.04;
type FrameBoxShadows = {
  board: string;
  mat: string;
  well: string;
  artefact: string;
};

/** Materialize proportional CSS shadows from the pure board-width scale. */
function frameBoxShadows(scale: number): FrameBoxShadows {
  const px = (value: number) => `${value * scale}px`;
  return {
    board: `0 ${px(FRAME_BOARD_SHADOW_OFFSET_Y)} ${px(FRAME_BOARD_SHADOW_BLUR)} rgba(0,0,0,0.20), 0 ${px(5)} ${px(10)} rgba(0,0,0,0.11), inset 0 0 0 ${px(1)} rgba(255,255,255,0.72)`,
    mat: `inset 0 ${px(8)} ${px(7)} rgba(0,0,0,0.18), 0 ${px(3)} ${px(3)} rgba(255,255,255,0.92)`,
    well: `inset 0 ${px(4)} ${px(2)} rgba(0,0,0,0.18)`,
    // Match Home's collapsed SHADOW_SM. Against the white well this only
    // reveals the page boundary; it must not compete with the board shadow.
    artefact: `0 ${px(1)} ${px(2)} rgba(0,0,0,0.05)`,
  };
}

/** Fit an artefact aspect inside the 3:4 well (CSS object-fit: contain). */
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
  return isPrintArtefact(artefact) ? PRINT_ASPECT_RATIO : PAPER_ASPECT_RATIO;
}

type ArtefactFrameProps = {
  artefact: Artefact;
  /** Inner well width (3:4 height derived); mat and board scale out from it. */
  wellWidth: number;
  /** Viewport width used to derive the artefact's canonical Home layout. */
  viewportWidth: number;
  /** Optional stage styling supplied by the surrounding presentation. */
  style?: StyleProp<ViewStyle>;
  /** Optional capture-aware subject; defaults to the live artefact content. */
  children?: ReactNode;
};

const ArtefactFrame = ({
  artefact,
  wellWidth,
  viewportWidth,
  style,
  children,
}: ArtefactFrameProps) => {
  const wellW = wellWidth;
  const wellH = wellWidth / FRAME_WELL_ASPECT;
  const boardSize = { width: wellW * FRAME_BOARD_SCALE, height: wellH * FRAME_BOARD_SCALE };
  const matSize = { width: wellW * FRAME_MAT_SCALE, height: wellH * FRAME_MAT_SCALE };
  const shadows = frameBoxShadows(frameEffectScaleForBoardWidth(boardSize.width));
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

  return (
    <View style={[styles.stage, boardSize, style]}>
      <View pointerEvents="none" style={[styles.board, boardSize, { boxShadow: shadows.board }]} />
      <View pointerEvents="none" style={[styles.mat, matSize, { boxShadow: shadows.mat }]} />
      <View
        pointerEvents="none"
        // Extend beyond the opaque well so the centre light remains visible in
        // the surrounding mat ring instead of being fully occluded.
        style={[
          styles.matHighlight,
          { width: matSize.width * 0.96, height: matSize.height * 0.94 },
        ]}
      />
      <View style={[styles.well, { width: wellW, height: wellH, boxShadow: shadows.well }]}>
        {/* Keep the inner tree at Home's natural dimensions and scale it as a
            unit; fixed Print/Paper chrome therefore remains proportional. */}
        <View style={[styles.artefact, target, { boxShadow: shadows.artefact }]}>
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
  },
  mat: {
    position: "absolute",
    backgroundColor: "#F9F9F7",
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
  },
  // The page owns its clipping; this wrapper stays overflow-visible so the
  // boundary shadow can fall onto the surrounding white well.
  artefact: {
    overflow: "visible",
  },
});

export default ArtefactFrame;
