/**
 * Tooltip — short-lived anchored label for lightweight hints.
 *
 * Dark solid background, light text. Auto-dismisses after `durationMs`.
 * Position with `anchor` (measureInWindow) or absolute `style` from the parent.
 * First consumer: max-artefacts hint on create document-plus.
 */
import { useEffect, useState } from "react";
import { Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from "react-native";
import { EaseView } from "react-native-ease";

import { EASE_DEFAULT_TIMING } from "../constants/animation";
import { useReducedMotionPreference } from "../hooks/useReducedMotionPreference";

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
  const reduceMotionEnabled = useReducedMotionPreference();
  const [display, setDisplay] = useState({ requested: visible, mounted: visible, shown: visible });

  if (display.requested !== visible) {
    setDisplay({
      requested: visible,
      mounted: visible || display.mounted,
      shown: visible,
    });
  }

  useEffect(() => {
    if (!visible) {
      return;
    }
    const timer = setTimeout(() => {
      setDisplay((current) => ({ ...current, shown: false }));
    }, durationMs);

    return () => clearTimeout(timer);
  }, [visible, durationMs]);

  if (!display.mounted) {
    return null;
  }

  return (
    <EaseView
      pointerEvents="box-none"
      style={[styles.wrap, style]}
      initialAnimate={{ opacity: 0 }}
      animate={{ opacity: display.shown ? 1 : 0 }}
      transition={
        reduceMotionEnabled ? { type: "none" } : { ...EASE_DEFAULT_TIMING, duration: FADE_MS }
      }
      onTransitionEnd={(event) => {
        if (!event.finished || display.shown) {
          return;
        }
        setDisplay((current) => ({ ...current, mounted: false }));
        onDismiss();
      }}
      accessibilityRole="text"
      accessibilityLabel={message}
    >
      <Pressable
        onPress={() => setDisplay((current) => ({ ...current, shown: false }))}
        accessibilityRole="button"
        accessibilityLabel="Dismiss tip"
      >
        <View style={styles.bubble}>
          <Text style={styles.text}>{message}</Text>
        </View>
      </Pressable>
    </EaseView>
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
