import { ReactNode } from "react";
import { useWindowDimensions } from "react-native";
import Animated, {
  interpolate,
  SharedValue,
  useAnimatedStyle,
} from "react-native-reanimated";

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
    const active = activeIndex.value;

    const expandedX = (index - currentPage.value) * SCREEN_WIDTH;
    let collapsedX = 0;

    if (index !== active) {
      const distance = index - active;

      collapsedX = distance * LAYOUT.STACK_OFFSET;
    }

    const translateX = interpolate(progress.value, [0, 1], [collapsedX, expandedX]);

    const scale = interpolate(progress.value, [0, 1], [1, EXPANDED_WIDTH / BASE_WIDTH]);

    return {
      transform: [{ translateX }, { scale }],
      zIndex: index === active ? 100 : 100 - Math.abs(index - active),
    };
  });

  return (
    <Animated.View style={[animatedStyle]} className="absolute" pointerEvents="none">
      {children}
    </Animated.View>
  );
};

export default ArtefactWrapper;
