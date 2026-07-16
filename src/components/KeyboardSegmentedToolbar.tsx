/**
 * KeyboardSegmentedToolbar — reusable floating control for keyboard text actions.
 *
 * Paper maps paragraph sizes into this pill. Keeping keyboard tracking and
 * visual treatment generic prevents the formatting adapter from owning sticky
 * native bounds, z-order, touch targets, disabled feedback or accessibility
 * mechanics itself.
 */
import { Pressable, StyleSheet, Text, View } from "react-native";
import { KeyboardStickyView } from "react-native-keyboard-controller";

export type KeyboardSegmentedToolbarOption = {
  /** Stable adapter token returned to its owning Create screen. */
  id: string;
  /** Visible compact label inside the pill. */
  label: string;
  /** Full VoiceOver description of this choice. */
  accessibilityLabel: string;
  /** Current adapter selection. */
  selected: boolean;
  /** False when native capacity preflight rejects this choice. */
  enabled: boolean;
};

type KeyboardSegmentedToolbarProps = {
  /** Adapter-owned ordered choices. */
  options: KeyboardSegmentedToolbarOption[];
  /** Routes a token back to the still-focused native text view. */
  onSelect: (id: string) => void;
};

/** Keeps the pill visually separate from interactive keyboard chrome. */
const TOOLBAR_KEYBOARD_GAP = 10;
/** Keeps the accessory above Create chrome/pager but below system keyboard UI. */
const TOOLBAR_Z_INDEX = 1_000;
/** Fixed host height gives KeyboardStickyView a stable screen-bottom origin. */
const TOOLBAR_HEIGHT = 48;
/** Equal inset makes the selected segment read as a capsule inside a capsule. */
const TOOLBAR_INSET = 4;
/** Deliberately exceeds the pill height so varying option widths stay fully rounded. */
const TOOLBAR_CAPSULE_RADIUS = 999;
/** Stable elevation separates the formatting accessory from authored content. */
const TOOLBAR_SHADOW = "0 4px 16px rgba(0,0,0,0.16)";
/** Unavailable capacity remains visible without looking actionable. */
const DISABLED_BUTTON_OPACITY = 0.3;
/** Press feedback stays subtler than the selected fill state. */
const PRESSED_BUTTON_OPACITY = 0.65;

/**
 * Renders adapter-owned choices on React's JS thread while KeyboardStickyView
 * moves the native host with interactive keyboard progress.
 */
export default function KeyboardSegmentedToolbar({
  options,
  onSelect,
}: KeyboardSegmentedToolbarProps) {
  return (
    <KeyboardStickyView
      enabled
      offset={{ opened: -TOOLBAR_KEYBOARD_GAP }}
      pointerEvents="box-none"
      style={styles.stickyLayer}
    >
      <View className="flex-row items-center gap-1" style={styles.toolbar}>
        {options.map((option) => (
          <Pressable
            key={option.id}
            disabled={!option.enabled}
            onPress={() => onSelect(option.id)}
            accessibilityRole="button"
            accessibilityLabel={option.accessibilityLabel}
            accessibilityState={{ selected: option.selected, disabled: !option.enabled }}
            className={`rounded-full px-4 py-2 ${option.selected ? "bg-primary" : "bg-transparent"}`}
            style={({ pressed }) => ({
              opacity: !option.enabled
                ? DISABLED_BUTTON_OPACITY
                : pressed
                  ? PRESSED_BUTTON_OPACITY
                  : 1,
            })}
          >
            <Text
              className={`font-sans-medium text-sm ${option.selected ? "text-paper" : "text-secondary"}`}
            >
              {option.label}
            </Text>
          </Pressable>
        ))}
      </View>
    </KeyboardStickyView>
  );
}

const styles = StyleSheet.create({
  // The keyboard controller supplies translateY. Absolute positioning gives
  // that worklet a stable screen-bottom origin independent of pager scrolling.
  stickyLayer: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    height: TOOLBAR_HEIGHT,
    zIndex: TOOLBAR_Z_INDEX,
    alignItems: "center",
  },
  // One compact pill remains visually separate from both authored content and keyboard.
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
