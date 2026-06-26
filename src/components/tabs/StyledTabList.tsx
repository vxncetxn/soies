import { forwardRef, PropsWithChildren } from "react";
import { View, ViewProps } from "react-native";

const StyledTabList = forwardRef<View, PropsWithChildren<ViewProps>>(
  ({ children, ...props }, ref) => {
    return (
      <View
        ref={ref}
        {...props}
        pointerEvents="box-none"
        className="absolute bottom-4 left-1/2 z-50 -translate-x-1/2 flex-row rounded-4xl border border-controls-border bg-controls-background"
      >
        {children}
      </View>
    );
  },
);

export default StyledTabList;
