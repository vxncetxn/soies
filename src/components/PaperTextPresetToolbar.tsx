/**
 * PaperTextPresetToolbar — paragraph-size controls floating above the keyboard.
 *
 * CreatePaperScreen mounts this in CreateScreenChrome's final floating layer
 * only while Paper is in Type. The sticky wrapper follows the interactive
 * keyboard on the UI thread; tapping a button invokes the still-focused native
 * TextKit view, so selection and first responder are preserved. TextKit owns
 * availability: a larger preset is disabled when it would exceed Paper capacity.
 */
import { Pressable, StyleSheet, Text, View } from "react-native";
import { KeyboardStickyView } from "react-native-keyboard-controller";

import type { PaperParagraphPreset } from "../data/paperDocument";
import type { PaperSelectionState } from "./PaperTextSurface.types";

/** Product order progresses from body size to the two larger paragraph presets. */
const PRESET_BUTTONS: { preset: PaperParagraphPreset; label: string }[] = [
  { preset: "default", label: "Default" },
  { preset: "large", label: "Large" },
  { preset: "x-large", label: "X-Large" },
];

// Keep one small visual gap above the iOS keyboard while the sticky view tracks
// interactive dismissal. A negative opened offset moves upward because the
// keyboard controller's animated height is already a negative translation.
const TOOLBAR_KEYBOARD_GAP = 10;
// The pill sits above Create chrome and the pager, but below system keyboard UI.
const TOOLBAR_Z_INDEX = 1_000;
const TOOLBAR_HEIGHT = 48;
// Compact inset/capsule values make the three 44-ish-point targets read as one control.
const TOOLBAR_INSET = 4;
const TOOLBAR_CAPSULE_RADIUS = 999;
// Fixed shadow matches the existing light Paper surfaces without adding an animation dependency.
const TOOLBAR_SHADOW = "0 4px 16px rgba(0,0,0,0.16)";
// Disabled remains legible enough to explain unavailable capacity; pressed is
// subtler so feedback reads without competing with the selected fill state.
const DISABLED_BUTTON_OPACITY = 0.3;
const PRESSED_BUTTON_OPACITY = 0.65;

type PaperTextPresetToolbarProps = {
  /** Latest native selection + capacity result for the active artefact. */
  selectionState: PaperSelectionState;
  /** Routes a chosen token to the active native TextKit surface. */
  onSelectPreset: (preset: PaperParagraphPreset) => void;
};

export default function PaperTextPresetToolbar({
  selectionState,
  onSelectPreset,
}: PaperTextPresetToolbarProps) {
  return (
    <KeyboardStickyView
      enabled
      offset={{ opened: -TOOLBAR_KEYBOARD_GAP }}
      pointerEvents="box-none"
      style={styles.stickyLayer}
    >
      <View className="flex-row items-center gap-1" style={styles.toolbar}>
        {PRESET_BUTTONS.map(({ preset, label }) => {
          const selected = selectionState.selectedPreset === preset;
          const enabled = selectionState.canApply[preset];
          return (
            <Pressable
              key={preset}
              disabled={!enabled}
              onPress={() => onSelectPreset(preset)}
              accessibilityRole="button"
              accessibilityLabel={`${label} paragraph size`}
              accessibilityState={{ selected, disabled: !enabled }}
              className={`rounded-full px-4 py-2 ${selected ? "bg-primary" : "bg-transparent"}`}
              style={({ pressed }) => ({
                opacity: !enabled ? DISABLED_BUTTON_OPACITY : pressed ? PRESSED_BUTTON_OPACITY : 1,
              })}
            >
              <Text
                className={`font-sans-medium text-sm ${selected ? "text-paper" : "text-secondary"}`}
              >
                {label}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </KeyboardStickyView>
  );
}

const styles = StyleSheet.create({
  // The component's own worklet supplies translateY. Absolute positioning gives
  // that translation a stable screen-bottom origin independent of pager scroll.
  stickyLayer: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    height: TOOLBAR_HEIGHT,
    zIndex: TOOLBAR_Z_INDEX,
    alignItems: "center",
  },
  // One compact floating pill keeps the presets visually separate from both
  // the keyboard and Paper while retaining generous touch targets.
  toolbar: {
    padding: TOOLBAR_INSET,
    borderRadius: TOOLBAR_CAPSULE_RADIUS,
    borderCurve: "continuous",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "#D6D3D1",
    backgroundColor: "#FFFFFF",
    boxShadow: TOOLBAR_SHADOW,
  },
});
