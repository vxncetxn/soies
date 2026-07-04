/**
 * CreateEntryButton — the floating "+" control that blooms into a create menu.
 *
 * It's a thin wrapper around `BloomButton` (variant="menu"): a round plus
 * trigger that stays inline (floating at the bottom-right of the screen,
 * levelled with the tab bar) and, on tap, a separate translucent panel blooms
 * upward into a centered menu of entry types. The menu currently holds two
 * placeholder options (Paper / Print) that only close the panel — the real
 * creation flows are wired later.
 *
 * Positioning:
 *   The trigger is absolutely positioned `bottom-5 right-5` (20px from the
 *   bottom and right safe-area edges). The tab bar sits at `bottom-4` and is
 *   ~48px tall (py-3 + 24px icon); this trigger is ~40px tall (p-2 + 24px
 *   icon), so `bottom-5` (20px) puts its vertical centre at 40px from the
 *   bottom — the same as the tab bar's centre (16 + 24). The two controls read
 *   as sitting on the same horizontal line, with the create button flushed to
 *   the right edge. This component is rendered inside `<Tabs>` (a relative
 *   container) in `(tabs)/_layout`, so its absolute coords share the tab bar's
 *   coordinate space.
 *
 * Chrome fade:
 *   The trigger fades out with `chromeProgress` — the same expand signal that
 *   hides the tab bar (`StyledTabList`) and the header (`HomeHeader`) — so it
 *   disappears when an entry expands to fullscreen. Its bloomed panel lives in
 *   the root `bloom` portal (outside this fade wrapper), so an open menu stays
 *   visible regardless of the fade.
 *
 * State:
 *   `BloomButton` is controlled, so this component owns the `open` state and
 *   passes it down. Tapping the trigger opens; tapping a menu item, the
 *   backdrop, or hardware-back closes. BloomButton handles the measure-and-morph
 *   (it measures this trigger on open and blooms a separate panel upward from
 *   it, since the trigger is in the lower half of the screen).
 */
import { useCallback, useState } from "react";
import { Pressable, Text, View } from "react-native";
import Animated, { interpolate, useAnimatedStyle } from "react-native-reanimated";

import { CHROME_FADE_END } from "../constants/animation";
import BloomButton from "./BloomButton";
import { useExpandContext } from "./ExpandContext";
import { Icon } from "./Icon";

// The placeholder creation options. Real flows (navigate to a paper/print
// composer) are wired later; for now both just close the menu.
const MENU_ITEMS = [{ label: "Paper" }, { label: "Print" }] as const;

// Trigger sizing: p-2 (8px) around a 24px icon → 40px square. The icon size/
// colour match the tab bar triggers so the two controls read as a set.
const TRIGGER_ICON_SIZE = 24;
const TRIGGER_ICON_COLOR = "#79716B";

/**
 * CreateEntryButton — see file header for the big picture.
 */
const CreateEntryButton = () => {
  // Expand chrome: 0 = collapsed, 1 = an entry is expanded fullscreen. Used to
  // fade this control out alongside the tab bar/header during expand.
  const { chromeProgress } = useExpandContext();
  // Controlled open state for the BloomButton. Tapping the trigger opens;
  // tapping a menu item, the backdrop, or hardware-back closes.
  const [open, setOpen] = useState(false);

  /**
   * Menu item handler. Every item currently just closes the panel — the real
   * per-item actions are placeholders. Stable identity via useCallback so the
   * item Pressables don't re-render when `open` changes.
   */
  const handleItemPress = useCallback(() => {
    setOpen(false);
  }, []);

  // Fade the trigger out over the first slice of the expand animation, matching
  // StyledTabList and HomeHeader. The wrapper uses `pointerEvents="box-none"` so
  // its empty corners don't intercept taps on the screen beneath; only the
  // trigger itself captures taps.
  const chromeFadeStyle = useAnimatedStyle(() => ({
    opacity: interpolate(chromeProgress.value, [0, CHROME_FADE_END], [1, 0]),
  }));

  // The bloomed menu content. Each row is a Pressable that closes the panel on
  // tap. BloomButton's menu measuring wrapper pins the width to screenWidth-40,
  // so these rows stretch to the full panel width.
  const panelNode = (
    <View className="py-2">
      {MENU_ITEMS.map((item) => (
        <Pressable
          key={item.label}
          onPress={handleItemPress}
          accessibilityRole="button"
          accessibilityLabel={`Create ${item.label}`}
          className="px-4 py-3"
        >
          <Text className="text-base text-primary">{item.label}</Text>
        </Pressable>
      ))}
    </View>
  );

  return (
    // Absolute, bottom-right, levelled with the tab bar. pointerEvents box-none
    // so only the trigger (not the wrapper's empty area) captures taps.
    <Animated.View
      style={chromeFadeStyle}
      pointerEvents="box-none"
      className="absolute right-5 bottom-5 z-50"
    >
      <BloomButton
        variant="menu"
        open={open}
        onOpenChange={setOpen}
        panelNode={panelNode}
        accessibilityRole="button"
        accessibilityLabel="Create entry"
      >
        {/* Trigger content: a plus icon centred in 8px of padding. The padding
            lives on this inner View (not the BloomButton wrapper) so the
            Pressable's hit area matches the visible 40px button, and the icon
            stays centred (items-center/justify-center) within it. */}
        <View className="flex items-center justify-center p-2">
          <Icon name="plus" size={TRIGGER_ICON_SIZE} color={TRIGGER_ICON_COLOR} />
        </View>
      </BloomButton>
    </Animated.View>
  );
};

export default CreateEntryButton;
