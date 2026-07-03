import { forwardRef, PropsWithChildren, ReactNode, useState } from "react";
import { View, Pressable, PressableProps, useWindowDimensions } from "react-native";
import Animated, {
  interpolate,
  interpolateColor,
  measure,
  useAnimatedRef,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from "react-native-reanimated";
import { Portal } from "react-native-teleport";
import { scheduleOnRN, scheduleOnUI } from "react-native-worklets";

import { BLOOM_SPRING } from "../constants/animation";

type BloomButtonProps = PressableProps & {
  panelNode: ReactNode;
  variant?: "fullscreen" | "menu";
};

const BloomButton = forwardRef<View, PropsWithChildren<BloomButtonProps>>(
  ({ panelNode, variant = "menu", children, ...props }, ref) => {
    const triggerRef = useAnimatedRef<Animated.View>();
    const [isPressed, setIsPressed] = useState(false);

    const { width: screenWidth, height: screenHeight } = useWindowDimensions();
    const screenW = useSharedValue(screenWidth);
    const screenH = useSharedValue(screenHeight);
    const progress = useSharedValue(0);
    const origin = useSharedValue({ x: 0, y: 0, width: 1, height: 1 });

    const handlePress = () => {
      if (isPressed) {
        scheduleOnUI(() => {
          "worklet";
          progress.value = withSpring(0, BLOOM_SPRING, (finished) => {
            if (finished) {
              scheduleOnRN(setIsPressed, false);
            }
          });
        });
        return;
      }
      scheduleOnUI(() => {
        "worklet";
        const layout = measure(triggerRef);
        if (layout) {
          origin.value = {
            x: layout.pageX,
            y: layout.pageY,
            width: layout.width,
            height: layout.height,
          };
        }
        scheduleOnRN(setIsPressed, true);
        progress.value = withSpring(1, BLOOM_SPRING);
      });
    };

    const panelStyle = useAnimatedStyle(() => {
      const targetX = 0;
      const targetY = 0;
      const targetWidth = screenW.value;
      const targetHeight = screenH.value;

      return {
        position: "absolute",
        top: 0,
        left: 0,
        width: interpolate(progress.value, [0, 1], [origin.value.width, targetWidth]),
        height: interpolate(progress.value, [0, 1], [origin.value.height, targetHeight]),
        transformOrigin: "top left",
        transform: [
          { translateX: interpolate(progress.value, [0, 1], [origin.value.x, targetX]) },
          { translateY: interpolate(progress.value, [0, 1], [origin.value.y, targetY]) },
        ],
        borderRadius: interpolate(progress.value, [0, 1], [32, 0]),
        backgroundColor: interpolateColor(
          progress.value,
          [0, 1],
          ["rgba(255, 255, 255, 0.5)", "rgba(255, 255, 255, 1.0)"],
        ),
      };
    });

    return (
      <>
        <Animated.View
          ref={triggerRef}
          collapsable={false}
          className={`flex items-center justify-center rounded-4xl border border-controls-border bg-controls-background ${isPressed ? "invisible" : "visible"}`}
        >
          <Pressable ref={ref} {...props} onPress={handlePress}>
            {children}
          </Pressable>
        </Animated.View>
        {isPressed ? (
          <Portal hostName="bloom">
            <Animated.View
              ref={triggerRef}
              collapsable={false}
              style={panelStyle}
              className="flex items-center justify-center rounded-4xl border border-controls-border bg-controls-background"
            >
              <Animated.View>{panelNode}</Animated.View>
            </Animated.View>
          </Portal>
        ) : null}
      </>
    );
  },
);

export default BloomButton;
