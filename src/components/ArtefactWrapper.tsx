/**
 * ArtefactWrapper — phase-synchronized Stack presentation around one canvas.
 *
 * Pager translation remains continuously driven by Reanimated. Ease owns a
 * nested correction transform plus the collapsed/expanded scale and shadow,
 * so the engines never write the same property on one native view.
 */
import type { ReactNode } from "react";

import { useLayoutEffect, useState } from "react";
import { StyleSheet, useWindowDimensions } from "react-native";
import { EaseView } from "react-native-ease";
import Animated, { type SharedValue, useAnimatedStyle } from "react-native-reanimated";

import { EASE_STACK_EXPANSION_SPRING, SHADOW_SM, SHADOW_XL } from "../constants/animation";
import { LAYOUT } from "../constants/layout";
import { useReducedMotionPreference } from "../hooks/useReducedMotionPreference";
import { EaseMotionCompletionQueue } from "../utils/easeMotionCompletion";
import { getArtefactCanvasLayout, getCollapsedArtefactLayout } from "./artefactLayout";
import { ArtefactPresentationScaleProvider } from "./ArtefactPresentationScale";

type ArtefactWrapperProps = {
  /** Persisted discriminator; unknown values use Print's established fallback. */
  type: string;
  index: number;
  /** Phase endpoint. Fractional pager motion is deliberately separate. */
  expanded: boolean;
  /** Frozen page used to calculate collapsed correction endpoints. */
  activePage: number;
  /** UI-thread fractional pager position used only for continuous translation. */
  currentPage: SharedValue<number>;
  /** UI-thread nearest page used only for live stacking order. */
  activeIndex: SharedValue<number>;
  /** Only the active card carries the reducer completion token. */
  motionRequestId?: number | null;
  onMotionEnd?: (requestId: number) => void;
  children: ReactNode;
};

const ArtefactWrapper = ({
  type,
  index,
  expanded,
  activePage,
  currentPage,
  activeIndex,
  motionRequestId = null,
  onMotionEnd,
  children,
}: ArtefactWrapperProps) => {
  const reduceMotionEnabled = useReducedMotionPreference();
  const { width: screenWidth } = useWindowDimensions();
  const kind = type === "paper" ? "paper" : "print";
  const hasCanonicalTextPresentation = type === "paper" || type === "print";
  const { width: baseWidth, height: baseHeight } = getCollapsedArtefactLayout(screenWidth, kind);
  const expandedWidth = screenWidth - 20;
  const natural = getArtefactCanvasLayout(screenWidth, kind);
  const presentationScale = expandedWidth / natural.width;
  const collapsedPresentationScale = baseWidth / expandedWidth;
  const expandedHeight = natural.height * presentationScale;
  const expandedRestX = (index - activePage) * screenWidth;
  const collapsedX = (index - activePage) * LAYOUT.STACK_OFFSET;
  const collapsedCorrectionX = collapsedX - expandedRestX;
  const scale = hasCanonicalTextPresentation
    ? expanded
      ? 1
      : collapsedPresentationScale
    : expanded
      ? expandedWidth / baseWidth
      : 1;
  const correction = { translateX: expanded ? 0 : collapsedCorrectionX };
  const presentation = {
    scale,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: expanded ? SHADOW_XL.offsetY : SHADOW_SM.offsetY },
    shadowOpacity: expanded ? SHADOW_XL.opacity : SHADOW_SM.opacity,
    shadowRadius: expanded ? SHADOW_XL.radius : SHADOW_SM.radius,
    elevation: expanded ? SHADOW_XL.elevation : SHADOW_SM.elevation,
  };
  const targetSignature = [
    expanded ? "expanded" : "collapsed",
    screenWidth,
    activePage,
    index,
    scale,
  ].join(":");
  const [completionQueue] = useState(() => new EaseMotionCompletionQueue<number>(targetSignature));

  useLayoutEffect(() => {
    completionQueue.transition(targetSignature, motionRequestId);
  }, [completionQueue, motionRequestId, targetSignature]);

  const pagePositionStyle = useAnimatedStyle(() => {
    const liveActiveIndex = activeIndex.get();
    return {
      transform: [{ translateX: (index - currentPage.get()) * screenWidth }],
      zIndex: index === liveActiveIndex ? 100 : 100 - Math.abs(index - liveActiveIndex),
    };
  });

  const presentationFrame = hasCanonicalTextPresentation
    ? {
        left: (baseWidth - expandedWidth) / 2,
        top: (baseHeight - expandedHeight) / 2,
        width: expandedWidth,
        height: expandedHeight,
      }
    : { left: 0, top: 0, width: baseWidth, height: baseHeight };
  const transition = reduceMotionEnabled ? { type: "none" as const } : EASE_STACK_EXPANSION_SPRING;

  return (
    <Animated.View
      style={[styles.positionFrame, { width: baseWidth, height: baseHeight }, pagePositionStyle]}
      pointerEvents="none"
    >
      <EaseView
        style={[styles.correctionFrame, { width: baseWidth, height: baseHeight }]}
        initialAnimate={correction}
        animate={correction}
        transition={transition}
      >
        <EaseView
          style={[styles.presentationFrame, presentationFrame]}
          initialAnimate={presentation}
          animate={presentation}
          transition={transition}
          onTransitionEnd={(event) => {
            const requestId = completionQueue.finish(event.finished);
            if (requestId !== null) {
              onMotionEnd?.(requestId);
            }
          }}
        >
          {hasCanonicalTextPresentation ? (
            <ArtefactPresentationScaleProvider presentationScale={presentationScale}>
              {children}
            </ArtefactPresentationScaleProvider>
          ) : (
            children
          )}
        </EaseView>
      </EaseView>
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  positionFrame: {
    position: "absolute",
    overflow: "visible",
  },
  correctionFrame: {
    position: "absolute",
    overflow: "visible",
  },
  presentationFrame: {
    position: "absolute",
    overflow: "visible",
  },
});

export default ArtefactWrapper;
