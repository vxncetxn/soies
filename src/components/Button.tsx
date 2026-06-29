import { forwardRef, PropsWithChildren } from "react";
import { View, Pressable, PressableProps } from "react-native";

const Button = forwardRef<View, PropsWithChildren<PressableProps>>(
  ({ children, ...props }, ref) => {
    return (
      <Pressable ref={ref} {...props}>
        <View className="border-controls-border bg-controls-background flex items-center justify-center rounded-4xl border">
          {children}
        </View>
      </Pressable>
    );
  },
);

export default Button;
