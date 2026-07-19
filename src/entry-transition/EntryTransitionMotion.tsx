import type { EaseViewProps } from "react-native-ease/uniwind";

import { useLayoutEffect, useState } from "react";
import { EaseView } from "react-native-ease/uniwind";

import { ENTRY_TRANSITION_DURATION_MS } from "../constants/animation";
import { useReducedMotionPreference } from "../hooks/useReducedMotionPreference";
import { EntryMotionCompletionQueue, type EntryMotionCompletion } from "./entryTransition";

type MotionViewProps = Omit<
  EaseViewProps,
  "animate" | "initialAnimate" | "onTransitionEnd" | "transition"
>;

type EntrySurfaceMotionProps = MotionViewProps & {
  visible: boolean;
  viewportHeight: number;
  /** Resets geometry behind an opaque prepared cover without a visible animation. */
  instant?: boolean;
  completion: EntryMotionCompletion | null;
  onMotionEnd?: (completion: EntryMotionCompletion) => void;
};

/** Opacity plus one-full-window vertical travel for an Entry body. */
export function EntrySurfaceMotion({
  visible,
  viewportHeight,
  instant = false,
  completion,
  onMotionEnd,
  ...props
}: EntrySurfaceMotionProps) {
  const reduceMotionEnabled = useReducedMotionPreference();
  const [completionQueue] = useState(() => new EntryMotionCompletionQueue(visible, viewportHeight));
  const values = {
    opacity: visible ? 1 : 0,
    translateY: visible ? 0 : viewportHeight,
  };

  useLayoutEffect(() => {
    completionQueue.transition(visible, viewportHeight, completion);
  }, [completion, completionQueue, viewportHeight, visible]);

  return (
    <EaseView
      {...props}
      initialAnimate={values}
      animate={values}
      onTransitionEnd={(event) => {
        const finishedMotion = completionQueue.finish(event.finished);
        if (finishedMotion) {
          onMotionEnd?.(finishedMotion);
        }
      }}
      transition={
        reduceMotionEnabled || instant
          ? { type: "none" }
          : {
              type: "timing",
              duration: ENTRY_TRANSITION_DURATION_MS,
              easing: visible ? "easeOut" : "easeIn",
            }
      }
    />
  );
}

type EntryChromeMotionProps = MotionViewProps & {
  visible: boolean;
};

/** Opacity-only companion for Entry chrome; translation stays owned by the body. */
export function EntryChromeMotion({ visible, ...props }: EntryChromeMotionProps) {
  const reduceMotionEnabled = useReducedMotionPreference();
  const values = { opacity: visible ? 1 : 0 };

  return (
    <EaseView
      {...props}
      initialAnimate={values}
      animate={values}
      transition={
        reduceMotionEnabled
          ? { type: "none" }
          : {
              type: "timing",
              duration: ENTRY_TRANSITION_DURATION_MS,
              easing: visible ? "easeOut" : "easeIn",
            }
      }
    />
  );
}
