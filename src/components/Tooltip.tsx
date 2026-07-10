/**
 * Tooltip — short-lived anchored label for lightweight hints.
 *
 * Dark solid background, light text. Auto-dismisses after `durationMs`.
 * Position with `anchor` (measureInWindow) or absolute `style` from the parent.
 * First consumer: max-artefacts hint on create document-plus.
 */
import { useEffect } from "react";
import { Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from "react-native";
import Animated, {
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";

const FADE_MS = 150;
const DEFAULT_DURATION_MS = 2000;

export type TooltipProps = {
  visible: boolean;
  message: string;
  onDismiss: () => void;
  /** Auto-hide delay; default 2000ms. */
  durationMs?: number;
  style?: StyleProp<ViewStyle>;
};

const Tooltip = ({
  visible,
  message,
  onDismiss,
  durationMs = DEFAULT_DURATION_MS,
  style,
}: TooltipProps) => {
  const opacity = useSharedValue(0);

  useEffect(() => {
    if (!visible) {
      opacity.set(withTiming(0, { duration: FADE_MS }));
      return;
    }

    opacity.set(withTiming(1, { duration: FADE_MS }));
    const timer = setTimeout(() => {
      opacity.set(
        withTiming(0, { duration: FADE_MS }, (finished) => {
          if (finished) {
            runOnJS(onDismiss)();
          }
        }),
      );
    }, durationMs);

    return () => clearTimeout(timer);
  }, [visible, durationMs, onDismiss, opacity]);

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: opacity.get(),
  }));

  if (!visible) {
    return null;
  }

  return (
    <Animated.View
      pointerEvents="box-none"
      style={[styles.wrap, style, animatedStyle]}
      accessibilityRole="text"
      accessibilityLabel={message}
    >
      <Pressable onPress={onDismiss} accessibilityRole="button" accessibilityLabel="Dismiss tip">
        <View style={styles.bubble}>
          <Text style={styles.text}>{message}</Text>
        </View>
      </Pressable>
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  wrap: {
    position: "absolute",
    zIndex: 300,
  },
  bubble: {
    backgroundColor: "#1C1917",
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    borderCurve: "continuous",
    maxWidth: 220,
  },
  text: {
    color: "#FAFAF9",
    fontFamily: "Geist-Medium",
    fontSize: 13,
    lineHeight: 18,
  },
});

export default Tooltip;
