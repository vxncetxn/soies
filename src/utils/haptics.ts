import { Presets } from "react-native-pulsar";

/** Single haptic fired once when any long-press is recognised. Worklet-safe. */
export const triggerLongPressHaptic = () => {
  "worklet";
  Presets.System.impactMedium();
};
