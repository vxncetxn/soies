import { forwardRef, PropsWithChildren } from "react";
import { Pressable, PressableProps, View } from "react-native";
import { StyleSheet } from "react-native-unistyles";

const Button = forwardRef<View, PropsWithChildren<PressableProps>>(
  ({ children, ...props }, ref) => {
    return (
      <Pressable ref={ref} {...props}>
        <View style={styles.surface}>{children}</View>
      </Pressable>
    );
  },
);

export default Button;

const styles = StyleSheet.create((theme) => ({
  surface: {
    alignItems: "center",
    backgroundColor: theme.colors.surface.control,
    borderColor: theme.colors.border.control,
    borderCurve: "continuous",
    borderRadius: 32,
    borderWidth: 1,
    justifyContent: "center",
  },
}));
