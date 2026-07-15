import { forwardRef, PropsWithChildren } from "react";
import { ViewProps } from "react-native";
import Animated from "react-native-reanimated";

import { useHomeChromeFade } from "../../hooks/useHomeChromeFade";

const StyledTabList = forwardRef<Animated.View, PropsWithChildren<ViewProps>>(
  ({ children, ...props }, ref) => {
    const fadeStyle = useHomeChromeFade();

    return (
      <Animated.View
        ref={ref}
        {...props}
        style={[props.style, fadeStyle]}
        pointerEvents="box-none"
        className="border-controls-border bg-controls-background absolute bottom-4 left-1/2 z-50 -translate-x-1/2 flex-row rounded-4xl border"
      >
        {children}
      </Animated.View>
    );
  },
);

export default StyledTabList;
