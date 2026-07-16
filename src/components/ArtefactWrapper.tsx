/**
 * ArtefactWrapper — responsive Stack frame around one logical artefact canvas.
 *
 * Translation and bloom scale deliberately live on separate ancestors. The
 * position frame moves each page through the Stack without scaling it; the
 * presentation frame owns the sole collapsed↔expanded scale and its shadow.
 * For Paper, that presentation frame is allocated at the current device's final
 * expanded size, centered over the collapsed slot, and scales from the collapsed
 * ratio to literal identity. This matters because reciprocal scales on nested
 * views can make Core Animation rasterize the TextKit layer while it is small and
 * enlarge those pixels later, leaving expanded glyphs blurry even though the
 * combined transform is mathematically 1. Print keeps its established responsive
 * base canvas and bloom behavior.
 */
import { ReactNode } from "react";
import { StyleSheet, useWindowDimensions } from "react-native";
import Animated, { interpolate, SharedValue, useAnimatedStyle } from "react-native-reanimated";

import { SHADOW_SM, SHADOW_XL } from "../constants/animation";
import { LAYOUT } from "../constants/layout";
import { getCollapsedArtefactLayout } from "./artefactLayout";
import { PaperPresentationScaleProvider } from "./Paper";
import { PAPER_CANVAS_HEIGHT, paperCanvasScaleForDisplayWidth } from "./paperLayout";

type ArtefactWrapperProps = {
  /** Persisted artefact discriminator; unknown values retain Print's legacy sizing. */
  type: string;
  /** Stable position in the owning Stack, used for collapsed offsets and page translation. */
  index: number;
  /** UI-thread 0 collapsed → 1 expanded animation shared by every artefact. */
  progress: SharedValue<number>;
  /** UI-thread fractional pager position used to place expanded siblings. */
  currentPage: SharedValue<number>;
  /** UI-thread collapsed front-card index that owns shadow/z-order priority. */
  activeIndex: SharedValue<number>;
  /** Canonical Paper or responsive Print renderer supplied by Stack. */
  children: ReactNode;
};

const ArtefactWrapper = ({
  type,
  index,
  progress,
  currentPage,
  activeIndex,
  children,
}: ArtefactWrapperProps) => {
  const { width: SCREEN_WIDTH } = useWindowDimensions();
  const kind = type === "paper" ? "paper" : "print";
  const { width: BASE_WIDTH, height: BASE_HEIGHT } = getCollapsedArtefactLayout(SCREEN_WIDTH, kind);
  const EXPANDED_WIDTH = SCREEN_WIDTH - 20;
  const paperPresentationScale = paperCanvasScaleForDisplayWidth(EXPANDED_WIDTH);
  const paperCollapsedScale = BASE_WIDTH / EXPANDED_WIDTH;
  const paperExpandedHeight = PAPER_CANVAS_HEIGHT * paperPresentationScale;

  // Translation is isolated from bloom scale so stacked-card offsets remain
  // screen-space distances rather than being scaled with Paper's large backing
  // surface. It also leaves no enlarging ancestor above Paper at expanded rest.
  const positionStyle = useAnimatedStyle(() => {
    const active = activeIndex.get();
    const page = currentPage.get();
    const p = progress.get();

    const expandedX = (index - page) * SCREEN_WIDTH;
    let collapsedX = 0;

    if (index !== active) {
      const distance = index - active;

      collapsedX = distance * LAYOUT.STACK_OFFSET;
    }

    const translateX = interpolate(p, [0, 1], [collapsedX, expandedX]);

    return {
      transform: [{ translateX }],
      zIndex: index === active ? 100 : 100 - Math.abs(index - active),
    };
  });

  // Paper begins as a device-sized native surface viewed through a downscale;
  // expanded rest is identity on every device, including large iPads. Print's
  // legacy base-sized canvas still blooms upward because it has no TextKit
  // resolution contract yet.
  const presentationStyle = useAnimatedStyle(() => {
    const p = progress.get();
    const scale =
      kind === "paper"
        ? interpolate(p, [0, 1], [paperCollapsedScale, 1])
        : interpolate(p, [0, 1], [1, EXPANDED_WIDTH / BASE_WIDTH]);

    return {
      transform: [{ scale }],
      shadowColor: "#000",
      shadowOffset: {
        width: 0,
        height: interpolate(p, [0, 1], [SHADOW_SM.offsetY, SHADOW_XL.offsetY]),
      },
      shadowOpacity: interpolate(p, [0, 1], [SHADOW_SM.opacity, SHADOW_XL.opacity]),
      shadowRadius: interpolate(p, [0, 1], [SHADOW_SM.radius, SHADOW_XL.radius]),
      elevation: interpolate(p, [0, 1], [SHADOW_SM.elevation, SHADOW_XL.elevation]),
    };
  });

  const presentationFrame =
    kind === "paper"
      ? {
          // The large frame is centered over the responsive collapsed slot.
          // Scaling around React Native's default center therefore lands on the
          // exact collapsed bounds at 0 and the screen-gutter bounds at 1.
          left: (BASE_WIDTH - EXPANDED_WIDTH) / 2,
          top: (BASE_HEIGHT - paperExpandedHeight) / 2,
          width: EXPANDED_WIDTH,
          height: paperExpandedHeight,
        }
      : { left: 0, top: 0, width: BASE_WIDTH, height: BASE_HEIGHT };

  return (
    <Animated.View
      style={[styles.positionFrame, { width: BASE_WIDTH, height: BASE_HEIGHT }, positionStyle]}
      pointerEvents="none"
    >
      {/* This is Paper's only scale-bearing ancestor. At expanded rest its
          transform is identity, so TextKit's device-sized layer reaches the
          screen without an intermediate resampling pass. */}
      <Animated.View style={[styles.presentationFrame, presentationFrame, presentationStyle]}>
        {kind === "paper" ? (
          <PaperPresentationScaleProvider presentationScale={paperPresentationScale}>
            {children}
          </PaperPresentationScaleProvider>
        ) : (
          children
        )}
      </Animated.View>
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  // Stack positions every artefact from the collapsed slot's origin. Visible
  // overflow lets the centered device-sized Paper extend to expanded gutters.
  positionFrame: {
    position: "absolute",
    overflow: "visible",
  },
  // Scaling around the centered frame preserves the original bloom geometry;
  // visible overflow keeps the animated shadow outside the page unclipped.
  presentationFrame: {
    position: "absolute",
    overflow: "visible",
  },
});

export default ArtefactWrapper;
