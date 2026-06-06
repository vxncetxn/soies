import { forwardRef, PropsWithChildren } from "react";
import { View, ViewProps } from "react-native";

const StyledTabList = forwardRef<View, PropsWithChildren<ViewProps>>(
  ({ children, ...props }, ref) => {
    return (
      <View
        ref={ref}
        {...props}
        className="mx-auto flex-row rounded-4xl border border-controls-border bg-controls-background"
      >
        {children}
      </View>
    );
  },
);

export default StyledTabList;
