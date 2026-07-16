/**
 * ArtefactWrapper — responsive Stack frame around one logical artefact canvas.
 *
 * Translation and bloom scale deliberately live on separate ancestors. The
 * position frame moves each page through the Stack without scaling it; the
 * presentation frame owns the sole collapsed↔expanded scale and its shadow.
 * For both known text artefacts, that presentation frame is allocated at the
 * current device's final expanded size, centered over the collapsed slot, and
 * scales from the collapsed ratio to literal identity. This matters because
 * reciprocal scales on nested views can make Core Animation rasterize a native
 * text layer while it is small and enlarge those pixels later, leaving expanded
 * glyphs blurry even though the combined transform is mathematically 1. Unknown
 * future types retain the legacy Print-shaped fallback instead of inheriting a
 * text-specific rendering contract they do not declare.
 */
import { ReactNode } from "react";
import { StyleSheet, useWindowDimensions } from "react-native";
import Animated, { interpolate, SharedValue, useAnimatedStyle } from "react-native-reanimated";

import { SHADOW_SM, SHADOW_XL } from "../constants/animation";
import { LAYOUT } from "../constants/layout";
import { getArtefactCanvasLayout, getCollapsedArtefactLayout } from "./artefactLayout";
import { ArtefactPresentationScaleProvider } from "./ArtefactPresentationScale";

type ArtefactWrapperProps = {
  /** Persisted discriminator; unknown values use Print's established card shape. */
  type: string;
  /** Stable position in the owning Stack, used for collapsed offsets and page translation. */
  index: number;
  /** UI-thread 0 collapsed → 1 expanded animation shared by every artefact. */
  progress: SharedValue<number>;
  /** UI-thread fractional pager position used to place expanded siblings. */
  currentPage: SharedValue<number>;
  /** UI-thread collapsed front-card index that owns shadow/z-order priority. */
  activeIndex: SharedValue<number>;
  /** Canonical Paper or Print renderer supplied by Stack. */
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
  const hasCanonicalTextPresentation = type === "paper" || type === "print";
  const { width: BASE_WIDTH, height: BASE_HEIGHT } = getCollapsedArtefactLayout(SCREEN_WIDTH, kind);
  const EXPANDED_WIDTH = SCREEN_WIDTH - 20;
  const natural = getArtefactCanvasLayout(SCREEN_WIDTH, kind);
  const presentationScale = EXPANDED_WIDTH / natural.width;
  const collapsedPresentationScale = BASE_WIDTH / EXPANDED_WIDTH;
  const expandedHeight = natural.height * presentationScale;

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

  // Known text artefacts begin as device-sized native surfaces viewed through a
  // downscale; expanded rest is identity on every device, including large iPads.
  // Unknown future types keep the established base-canvas enlargement path.
  const presentationStyle = useAnimatedStyle(() => {
    const p = progress.get();
    const scale = hasCanonicalTextPresentation
      ? interpolate(p, [0, 1], [collapsedPresentationScale, 1])
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

  const presentationFrame = hasCanonicalTextPresentation
    ? {
        // The large frame is centered over the responsive collapsed slot.
        // Scaling around React Native's default center lands on the exact
        // collapsed bounds at 0 and the screen-gutter bounds at 1.
        left: (BASE_WIDTH - EXPANDED_WIDTH) / 2,
        top: (BASE_HEIGHT - expandedHeight) / 2,
        width: EXPANDED_WIDTH,
        height: expandedHeight,
      }
    : { left: 0, top: 0, width: BASE_WIDTH, height: BASE_HEIGHT };

  return (
    <Animated.View
      style={[styles.positionFrame, { width: BASE_WIDTH, height: BASE_HEIGHT }, positionStyle]}
      pointerEvents="none"
    >
      {/* This is known authored text's only scale-bearing ancestor. At expanded
          rest it is identity, so the device-sized native layer reaches the
          screen without an intermediate resampling pass. */}
      <Animated.View style={[styles.presentationFrame, presentationFrame, presentationStyle]}>
        {hasCanonicalTextPresentation ? (
          <ArtefactPresentationScaleProvider presentationScale={presentationScale}>
            {children}
          </ArtefactPresentationScaleProvider>
        ) : (
          children
        )}
      </Animated.View>
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  // Stack positions every artefact from the collapsed slot's origin. Visible
  // overflow lets the centered device-sized artefact extend to expanded gutters.
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
