/**
 * CreateEntryButton — the floating "+" control that blooms into a create menu.
 *
 * It's a thin wrapper around `BloomButton` (variant="menu"): a round plus
 * trigger that stays inline (floating at the bottom-right of the screen,
 * levelled with the tab bar) and, on tap, a separate frosted panel blooms
 * upward into a create menu.
 *
 * Flow:
 *   Paper → close bloom → openCreate("paper")
 *   Print → bloom cross-fades to Take picture / Camera roll
 *     success → close bloom → openCreate("print", { imageUri })
 *     system cancel → quiet Home (bloom already closed for the system UI)
 *     permission denied / hard error → bloom alert panel with CTAs
 *
 * Image acquisition lives in `pickPrintImage` (system picker for v1; seam for
 * a future in-app camera). Create only opens after a URI exists.
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
import { Linking, Pressable, Text, View } from "react-native";
import Animated from "react-native-reanimated";

import { useHomeChromeFade } from "../hooks/useHomeChromeFade";
import {
  pickPrintImage,
  type PickPrintImageSource,
} from "../media/pickPrintImage";
import { todayISO } from "../utils/date";
import BloomButton from "./BloomButton";
import { useCreateContext } from "./CreateContext";
import { Icon } from "./Icon";

type CreateMenuScreen = "main" | "print" | "permission" | "error";

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
  const [permissionSource, setPermissionSource] =
    useState<PickPrintImageSource>("camera");
  const [errorMessage, setErrorMessage] = useState("Couldn’t get that image.");
  const [picking, setPicking] = useState(false);
  const chromeFadeStyle = useHomeChromeFade();

  const handlePick = async (source: PickPrintImageSource) => {
    if (picking) {
      return;
    }

    // Close the bloom before presenting system UI so Home is clean behind the
    // camera/library. On deny/error we re-open already on the alert screen.
    setOpen(false);
    setPicking(true);

    const result = await pickPrintImage(source)
      .catch(() => ({
        status: "error" as const,
        message: "Couldn’t get that image.",
      }))
      .finally(() => {
        setPicking(false);
      });

    if (result.status === "success") {
      openCreate("print", effectiveDate, { imageUri: result.uri });
      setScreen("main");
      return;
    }

    if (result.status === "cancelled") {
      setScreen("main");
      return;
    }

    if (result.status === "permission_denied") {
      setPermissionSource(result.source);
      setScreen("permission");
      setOpen(true);
      return;
    }

    setErrorMessage(result.message || "Couldn’t get that image.");
    setScreen("error");
    setOpen(true);
  };

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
        <Text className="text-base text-primary">‹ Back</Text>
      </Pressable>
      <Pressable
        onPress={() => {
          void handlePick("camera");
        }}
        disabled={picking}
        accessibilityRole="button"
        accessibilityLabel="Take picture"
        className="px-4 py-3"
      >
        <Text className="text-base text-primary">Take picture</Text>
      </Pressable>
      <Pressable
        onPress={() => {
          void handlePick("library");
        }}
        disabled={picking}
        accessibilityRole="button"
        accessibilityLabel="Camera roll"
        className="px-4 py-3"
      >
        <Text className="text-base text-primary">Camera roll</Text>
      </Pressable>
    </View>
  );

  const permissionMessage =
    permissionSource === "camera"
      ? "Camera access is needed to take a picture."
      : "Photo access is needed to choose from Camera roll.";

  const permissionNode = (
    <View className="py-2">
      <Text className="px-4 py-3 text-base text-primary">{permissionMessage}</Text>
      <Pressable
        onPress={() => {
          setOpen(false);
          void Linking.openSettings();
        }}
        accessibilityRole="button"
        accessibilityLabel="Open Settings"
        className="px-4 py-3"
      >
        <Text className="text-base text-primary">Open Settings</Text>
      </Pressable>
      <Pressable
        onPress={() => setOpen(false)}
        accessibilityRole="button"
        accessibilityLabel="Dismiss"
        className="px-4 py-3"
      >
        <Text className="text-base text-secondary">OK</Text>
      </Pressable>
    </View>
  );

  const errorNode = (
    <View className="py-2">
      <Text className="px-4 py-3 text-base text-primary">{errorMessage}</Text>
      <Pressable
        onPress={() => setScreen("print")}
        accessibilityRole="button"
        accessibilityLabel="Try again"
        className="px-4 py-3"
      >
        <Text className="text-base text-primary">Try again</Text>
      </Pressable>
      <Pressable
        onPress={() => setOpen(false)}
        accessibilityRole="button"
        accessibilityLabel="Dismiss"
        className="px-4 py-3"
      >
        <Text className="text-base text-secondary">OK</Text>
      </Pressable>
    </View>
  );

  const panelNode =
    screen === "print"
      ? printNode
      : screen === "permission"
        ? permissionNode
        : screen === "error"
          ? errorNode
          : mainNode;

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
