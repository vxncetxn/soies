import type { EaseViewProps } from "react-native-ease/uniwind";

import { EaseView } from "react-native-ease/uniwind";

import { EASE_STACK_CHROME_TIMING } from "../constants/animation";
import { useReducedMotionPreference } from "../hooks/useReducedMotionPreference";
import { useExpandContext } from "./ExpandContext";
import { stackChromeVisible } from "./stackExpansion";

type StackChromeMotionProps = Omit<
  EaseViewProps,
  "animate" | "initialAnimate" | "onTransitionEnd" | "transition"
>;

/** Opacity-only Stack companion; Entry navigation remains on its outer wrapper. */
export function StackChromeMotion({ pointerEvents, ...props }: StackChromeMotionProps) {
  const { state } = useExpandContext();
  const reduceMotionEnabled = useReducedMotionPreference();
  const visible = stackChromeVisible(state);
  const interactive = state.phase === "collapsed";
  const values = { opacity: visible ? 1 : 0 };

  return (
    <EaseView
      {...props}
      initialAnimate={values}
      animate={values}
      transition={reduceMotionEnabled ? { type: "none" } : EASE_STACK_CHROME_TIMING}
      pointerEvents={interactive ? pointerEvents : "none"}
      accessibilityElementsHidden={!interactive}
      importantForAccessibility={interactive ? "auto" : "no-hide-descendants"}
    />
  );
}
