import { useEffect } from "react";
import { BackHandler } from "react-native";

/**
 * Subscribe to the Android hardware-back button while `active`, calling
 * `onDismiss` on press and suppressing the default back behavior (returning
 * `true` stops the press from navigating away). No subscription while inactive,
 * so a closed overlay/panel doesn't intercept back.
 *
 * `onDismiss` should be stable (e.g. a `useCallback` or a state setter) — the
 * effect re-subscribes when its identity changes.
 */
export function useHardwareBackDismiss(active: boolean, onDismiss: () => void) {
  useEffect(() => {
    if (!active) {
      return;
    }

    const subscription = BackHandler.addEventListener("hardwareBackPress", () => {
      onDismiss();
      return true;
    });

    return () => subscription.remove();
  }, [active, onDismiss]);
}
