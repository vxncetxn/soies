/**
 * ShareActionToast — ephemeral label that rises and fades above an action.
 * Used for Copied / Saved / app-not-installed confirmations while the sheet stays open.
 *
 * ShareSheet owns a permanently sized toast lane; this component only animates
 * within it. Mounting a transient node directly in the ModalBottomSheet
 * `content` subtree previously retargeted the detent while Copy was visible.
 */
import { useEffect } from "react";
import { StyleSheet, Text } from "react-native";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withTiming,
  runOnJS,
} from "react-native-reanimated";

const SHOW_MS = 1600;
const FADE_MS = 220;
const RISE_Y = 8;

type ShareActionToastProps = {
  message: string | null;
  onDone: () => void;
};

export function ShareActionToast({ message, onDone }: ShareActionToastProps) {
  const progress = useSharedValue(0);

  useEffect(() => {
    if (!message) {
      progress.set(0);
      return;
    }

    progress.set(0);
    progress.set(withTiming(1, { duration: FADE_MS }));

    const hide = () => {
      progress.set(
        withTiming(0, { duration: FADE_MS }, (finished) => {
          if (finished) {
            runOnJS(onDone)();
          }
        }),
      );
    };

    const timer = setTimeout(hide, SHOW_MS);
    return () => clearTimeout(timer);
  }, [message, onDone, progress]);

  const style = useAnimatedStyle(() => ({
    opacity: progress.get(),
    transform: [{ translateY: (1 - progress.get()) * RISE_Y }],
  }));

  if (!message) {
    return null;
  }

  return (
    <Animated.View pointerEvents="none" style={[styles.toast, style]}>
      <Text style={styles.text} numberOfLines={1}>
        {message}
      </Text>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  toast: {
    backgroundColor: "rgba(28, 25, 23, 0.92)",
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    borderCurve: "continuous",
    minWidth: 128,
    alignItems: "center",
  },
  text: {
    color: "#FAFAF9",
    fontFamily: "Geist-Medium",
    fontSize: 13,
  },
});
