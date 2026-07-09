import { ReactNode } from "react";
import { useWindowDimensions } from "react-native";
import Animated, { interpolate, SharedValue, useAnimatedStyle } from "react-native-reanimated";

import { SHADOW_SM, SHADOW_XL } from "../constants/animation";
import { LAYOUT } from "../constants/layout";

type ArtefactWrapperProps = {
  type: string;
  index: number;
  progress: SharedValue<number>;
  currentPage: SharedValue<number>;
  activeIndex: SharedValue<number>;
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
  const BASE_WIDTH =
    type === "paper" ? SCREEN_WIDTH - 80 : (53 / 86) * (((SCREEN_WIDTH - 80) / 210) * 297);
  const EXPANDED_WIDTH = SCREEN_WIDTH - 20;

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
    <Animated.View style={[animatedStyle]} className="absolute" pointerEvents="none">
      {children}
    </Animated.View>
  );
};

export default ArtefactWrapper;
