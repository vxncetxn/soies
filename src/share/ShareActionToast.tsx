/**
 * ShareActionToast — ephemeral label that rises and fades above an action.
 * Used for Copied / Saved / app-not-installed confirmations while the sheet stays open.
 *
 * ShareSheet owns a permanently sized toast lane; this component only animates
 * within it. Mounting a transient node directly in the ModalBottomSheet
 * `content` subtree previously retargeted the detent while Copy was visible.
 */
import { useEffect, useState } from "react";
import { StyleSheet, Text } from "react-native";
import { EaseView } from "react-native-ease";

import { EASE_DEFAULT_TIMING } from "../constants/animation";
import { useReducedMotionPreference } from "../hooks/useReducedMotionPreference";

const SHOW_MS = 1600;
const FADE_MS = 220;
const RISE_Y = 8;

type ShareActionToastProps = {
  message: string | null;
  onDone: () => void;
};

export function ShareActionToast({ message, onDone }: ShareActionToastProps) {
  const reduceMotionEnabled = useReducedMotionPreference();
  const [cycle, setCycle] = useState({ message, visible: Boolean(message) });

  if (cycle.message !== message) {
    setCycle({ message, visible: Boolean(message) });
  }

  useEffect(() => {
    if (!message) {
      return;
    }
    const timer = setTimeout(() => {
      setCycle((current) => ({ ...current, visible: false }));
    }, SHOW_MS);
    return () => clearTimeout(timer);
  }, [message]);

  if (!message) {
    return null;
  }

  return (
    <EaseView
      pointerEvents="none"
      style={styles.toast}
      initialAnimate={{ opacity: 0, translateY: RISE_Y }}
      animate={{ opacity: cycle.visible ? 1 : 0, translateY: cycle.visible ? 0 : RISE_Y }}
      transition={
        reduceMotionEnabled ? { type: "none" } : { ...EASE_DEFAULT_TIMING, duration: FADE_MS }
      }
      onTransitionEnd={(event) => {
        if (event.finished && !cycle.visible) {
          onDone();
        }
      }}
    >
      <Text style={styles.text} numberOfLines={1}>
        {message}
      </Text>
    </EaseView>
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
