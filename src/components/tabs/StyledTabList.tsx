import { forwardRef, PropsWithChildren } from "react";
import { ViewProps } from "react-native";
import Animated, { interpolate, useAnimatedStyle } from "react-native-reanimated";

import { CHROME_FADE_END } from "../../constants/animation";
import { useExpandContext } from "../ExpandContext";

const StyledTabList = forwardRef<Animated.View, PropsWithChildren<ViewProps>>(
  ({ children, ...props }, ref) => {
    const { chromeProgress } = useExpandContext();

    const fadeStyle = useAnimatedStyle(() => ({
      opacity: interpolate(chromeProgress.value, [0, CHROME_FADE_END], [1, 0]),
    }));

    return (
      <Animated.View
        ref={ref}
        {...props}
        style={[props.style, fadeStyle]}
        pointerEvents="box-none"
        className="absolute bottom-4 left-1/2 z-50 -translate-x-1/2 flex-row rounded-4xl border border-controls-border bg-controls-background"
      >
        {children}
      </Animated.View>
    );
  },
);

export default StyledTabList;
