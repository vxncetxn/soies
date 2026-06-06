import { forwardRef, PropsWithChildren } from "react";
import { View, Pressable, PressableProps } from "react-native";

const StyledTabTrigger = forwardRef<View, PropsWithChildren<PressableProps>>(
  ({ children, ...props }, ref) => {
    return (
      <Pressable ref={ref} {...props}>
        <View className="flex items-center justify-center rounded-4xl px-6 py-3">{children}</View>
      </Pressable>
    );
  },
);

export default StyledTabTrigger;
