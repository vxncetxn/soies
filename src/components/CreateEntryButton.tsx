/**
 * CreateEntryButton — the floating "+" control that blooms into a create menu.
 *
 * It's a thin wrapper around `BloomButton` (variant="menu"): a round plus
 * trigger that stays inline (floating at the bottom-right of the screen,
 * levelled with the tab bar) and, on tap, a separate frosted panel blooms
 * upward into a create menu. Tapping "Paper" closes the bloom and opens the
 * Create overlay (see `CreateContext.openCreate`); "Print" is a stub for now.
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
 *   The trigger fades out with `chromeProgress` (entry expand) and
 *   `createProgress` (create overlay open) — combined via `useHomeChromeFade`,
 *   the same signal that hides the tab bar (`StyledTabList`) and the header
 *   (`HomeHeader`). Its bloomed panel lives in the root `bloom` portal (outside
 *   this fade wrapper), so an open menu stays visible regardless of the fade.
 *
 * State:
 *   `BloomButton` is controlled, so this component owns the `open` state and
 *   passes it down. Tapping the trigger opens; tapping the backdrop or hardware-
 *   back closes. `onClose` resets `screen` to `"main"` after the close morph so
 *   the next open starts at the main menu (invisible while closed thanks to
 *   BloomButton's `open` gate on cross-fade). BloomButton handles the measure-
 *   and-morph (it measures this trigger on open and blooms a separate panel
 *   upward from it, since the trigger is in the lower half of the screen).
 */
import { useLocalSearchParams } from "expo-router";
import { useState } from "react";
import { Pressable, Text, View } from "react-native";
import Animated from "react-native-reanimated";

import { useHomeChromeFade } from "../hooks/useHomeChromeFade";
import { todayISO } from "../utils/date";
import BloomButton from "./BloomButton";
import { useCreateContext } from "./CreateContext";
import { Icon } from "./Icon";

type CreateMenuScreen = "main" | "print";

// Trigger sizing: p-2 (8px) around a 24px icon → 40px square. The icon size/
// colour match the tab bar triggers so the two controls read as a set.
const TRIGGER_ICON_SIZE = 24;
const TRIGGER_ICON_COLOR = "#79716B";

/**
 * CreateEntryButton — see file header for the big picture.
 */
const CreateEntryButton = () => {
  const { date } = useLocalSearchParams<{ date?: string }>();
  const effectiveDate = date ?? todayISO();
  const { openCreate } = useCreateContext();
  const [open, setOpen] = useState(false);
  const [screen, setScreen] = useState<CreateMenuScreen>("main");
  const chromeFadeStyle = useHomeChromeFade();

  const mainNode = (
    <View className="py-2">
      <Pressable
        onPress={() => {
          setOpen(false);
          openCreate("paper", effectiveDate);
        }}
        accessibilityRole="button"
        accessibilityLabel="Choose Paper"
        className="px-4 py-3"
      >
        <Text className="text-base text-primary">Paper</Text>
      </Pressable>
      <Pressable
        onPress={() => setScreen("print")}
        accessibilityRole="button"
        accessibilityLabel="Choose Print"
        className="px-4 py-3"
      >
        <Text className="text-base text-primary">Print</Text>
      </Pressable>
    </View>
  );

  const printNode = (
    <View className="py-2">
      <Pressable
        onPress={() => setScreen("main")}
        accessibilityRole="button"
        accessibilityLabel="Back to main menu"
        className="px-4 py-3"
      >
        <Text className="text-base text-primary">‹ Print coming soon</Text>
      </Pressable>
    </View>
  );

  const panelNode = screen === "print" ? printNode : mainNode;

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
        onClose={() => setScreen("main")}
        contentKey={screen}
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
