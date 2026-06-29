import { PropsWithChildren, useEffect } from "react";
import { BackHandler, Pressable, StyleSheet, useWindowDimensions, View } from "react-native";
import Animated, {
  AnimatedRef,
  interpolate,
  useAnimatedStyle,
  type SharedValue,
} from "react-native-reanimated";
import { Portal } from "react-native-teleport";

import { CONTENT_BLOOM_START, MORPH_BORDER_RADIUS, PANEL_FADE_END } from "../constants/animation";
import { useMorphFromTrigger } from "../hooks/useMorphFromTrigger";

type MorphOverlayProps = PropsWithChildren<{
  triggerRef: AnimatedRef<Animated.View>;
  open: boolean;
  onRequestClose: () => void;
  onClose?: () => void;
  progress?: SharedValue<number>;
  variant?: "fullscreen" | "menu";
  solid?: boolean;
  backdrop?: boolean;
  backgroundColor?: string;
}>;

const MorphOverlay = ({
  triggerRef,
  open,
  onRequestClose,
  onClose,
  children,
  progress: progressProp,
  variant = "fullscreen",
  solid = true,
  backdrop = false,
  backgroundColor = "#FFFFFF",
}: MorphOverlayProps) => {
  const { width: screenWidth, height: screenHeight } = useWindowDimensions();
  const { progress, origin, screenW, screenH } = useMorphFromTrigger({
    triggerRef,
    open,
    onClose,
    progress: progressProp,
  });

  useEffect(() => {
    if (!open) {
      return;
    }

    const subscription = BackHandler.addEventListener("hardwareBackPress", () => {
      onRequestClose();
      return true;
    });

    return () => subscription.remove();
  }, [onRequestClose, open]);

  const panelStyle = useAnimatedStyle(() => {
    const o = origin.value;
    const targetWidth = variant === "fullscreen" ? screenW.value : o.width;
    const targetHeight = variant === "fullscreen" ? screenH.value : o.height * 4;
    const targetX = variant === "fullscreen" ? 0 : o.x;
    const targetY = variant === "fullscreen" ? 0 : o.y + o.height + 8;

    return {
      opacity: solid
        ? interpolate(progress.value, [0, PANEL_FADE_END], [0, 1])
        : interpolate(progress.value, [0, 1], [0.92, 0.98]),
      transform: [
        { translateX: interpolate(progress.value, [0, 1], [o.x, targetX]) },
        { translateY: interpolate(progress.value, [0, 1], [o.y, targetY]) },
        { scaleX: interpolate(progress.value, [0, 1], [o.width / targetWidth, 1]) },
        { scaleY: interpolate(progress.value, [0, 1], [o.height / targetHeight, 1]) },
      ],
      borderRadius: interpolate(progress.value, [0, 1], [MORPH_BORDER_RADIUS, 0]),
    };
  });

  const contentStyle = useAnimatedStyle(() => ({
    opacity: interpolate(progress.value, [CONTENT_BLOOM_START, 1], [0, 1]),
    transform: [{ scale: interpolate(progress.value, [CONTENT_BLOOM_START, 1], [0.96, 1]) }],
  }));

  const panelWidth = variant === "fullscreen" ? screenWidth : screenWidth * 0.88;
  const panelHeight = variant === "fullscreen" ? screenHeight : screenHeight * 0.5;

  return (
    <Portal hostName="morph">
      <View style={styles.root} pointerEvents={open ? "auto" : "none"}>
        {backdrop && variant === "menu" && (
          <Pressable
            style={styles.backdrop}
            onPress={onRequestClose}
            accessibilityRole="button"
            accessibilityLabel="Close menu"
          />
        )}

        <Animated.View
          style={[
            styles.panel,
            { width: panelWidth, height: panelHeight, backgroundColor },
            panelStyle,
          ]}
          pointerEvents="auto"
        >
          <Animated.View style={[styles.content, contentStyle]}>{children}</Animated.View>
        </Animated.View>
      </View>
    </Portal>
  );
};

const styles = StyleSheet.create({
  root: {
    ...StyleSheet.absoluteFill,
  },
  backdrop: {
    ...StyleSheet.absoluteFill,
    backgroundColor: "rgba(0, 0, 0, 0.35)",
  },
  panel: {
    position: "absolute",
    top: 0,
    left: 0,
    overflow: "hidden",
    transformOrigin: "top left",
  },
  content: {
    flex: 1,
  },
});

export default MorphOverlay;
