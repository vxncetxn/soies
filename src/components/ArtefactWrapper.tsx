/**
 * ArtefactWrapper — responsive Stack frame around one logical artefact canvas.
 *
 * The outer frame retains the existing collapsed↔expanded translation, scale,
 * and shadow animation. Paper adds a second, non-animated inner transform: its
 * logical 310-point canvas is rasterized at the final expanded resolution and
 * downscaled into the responsive collapsed frame. The outer bloom cancels that
 * downscale, landing at native scale 1 so expanded text is sharp. Typography,
 * padding, and capacity remain proportional to one canonical layout; Print
 * keeps its established responsive base canvas.
 */
import { ReactNode } from "react";
import { StyleSheet, View, useWindowDimensions } from "react-native";
import Animated, { interpolate, SharedValue, useAnimatedStyle } from "react-native-reanimated";

import { SHADOW_SM, SHADOW_XL } from "../constants/animation";
import { LAYOUT } from "../constants/layout";
import { getCollapsedArtefactLayout } from "./artefactLayout";
import { PaperPresentationScaleProvider } from "./Paper";
import {
  PAPER_CANVAS_HEIGHT,
  PAPER_CANVAS_WIDTH,
  paperCanvasScaleForDisplayWidth,
} from "./paperLayout";

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

  const animatedStyle = useAnimatedStyle(() => {
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

    const scale = interpolate(p, [0, 1], [1, EXPANDED_WIDTH / BASE_WIDTH]);

    return {
      transform: [{ translateX }, { scale }],
      zIndex: index === active ? 100 : 100 - Math.abs(index - active),
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

  return (
    <Animated.View
      style={[styles.frame, { width: BASE_WIDTH, height: BASE_HEIGHT }, animatedStyle]}
      pointerEvents="none"
    >
      {kind === "paper" ? (
        // Start with an expanded-resolution proportional Paper and downscale it
        // into Default. The outer bloom cancels this exact transform at rest.
        <View
          style={{
            width: PAPER_CANVAS_WIDTH * paperPresentationScale,
            height: PAPER_CANVAS_HEIGHT * paperPresentationScale,
            transform: [{ scale: paperCollapsedScale }],
            transformOrigin: "top left",
          }}
        >
          <PaperPresentationScaleProvider presentationScale={paperPresentationScale}>
            {children}
          </PaperPresentationScaleProvider>
        </View>
      ) : (
        children
      )}
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  // Stack positions every artefact from the same origin; visible overflow lets
  // expanded shadows and the scaled page extend beyond the collapsed frame.
  frame: {
    position: "absolute",
    overflow: "visible",
  },
});

export default ArtefactWrapper;
