import { useEffect, useState } from "react";
import { AccessibilityInfo } from "react-native";

/** Tracks the platform Reduce Motion preference for declarative Ease transitions. */
export function useReducedMotionPreference() {
  // Unknown is treated conservatively so startup never animates before the
  // asynchronous platform preference has been read.
  const [reduceMotionEnabled, setReduceMotionEnabled] = useState<boolean | null>(null);

  useEffect(() => {
    let active = true;
    const subscription = AccessibilityInfo.addEventListener(
      "reduceMotionChanged",
      setReduceMotionEnabled,
    );
    void AccessibilityInfo.isReduceMotionEnabled().then((enabled) => {
      if (active) {
        setReduceMotionEnabled(enabled);
      }
    });
    return () => {
      active = false;
      subscription.remove();
    };
  }, []);

  return reduceMotionEnabled !== false;
}
