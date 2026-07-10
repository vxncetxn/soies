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
import { Pressable, Text, View } from "react-native";
import Animated from "react-native-reanimated";

import { useHomeChromeFade } from "../hooks/useHomeChromeFade";
import { usePrintImagePickFlow } from "../hooks/usePrintImagePickFlow";
import { todayISO } from "../utils/date";
import BloomButton from "./BloomButton";
import { useCreateContext } from "./CreateContext";
import { Icon } from "./Icon";
import { PrintMediaBloomPanel } from "./PrintMediaBloomPanel";

const TRIGGER_ICON_SIZE = 24;
const TRIGGER_ICON_COLOR = "#79716B";

const CreateEntryButton = () => {
  const { date } = useLocalSearchParams<{ date?: string }>();
  const effectiveDate = date ?? todayISO();
  const { openCreate } = useCreateContext();
  const [open, setOpen] = useState(false);
  /** `main` = Paper/Print chooser; otherwise mirrors pick-flow media screen. */
  const [onMainMenu, setOnMainMenu] = useState(true);
  const chromeFadeStyle = useHomeChromeFade();

  const {
    picking,
    mediaScreen,
    setMediaScreen,
    permissionSource,
    errorMessage,
    handlePick,
    resetToMedia,
  } = usePrintImagePickFlow({
    onBeforePick: () => setOpen(false),
    onNeedsAttention: () => {
      setOnMainMenu(false);
      setOpen(true);
    },
    onSuccess: (uri) => {
      openCreate("print", effectiveDate, { imageUri: uri });
      setOnMainMenu(true);
      resetToMedia();
    },
  });

  const contentKey = onMainMenu ? "main" : mediaScreen;

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
        onPress={() => {
          setMediaScreen("media");
          setOnMainMenu(false);
        }}
        accessibilityRole="button"
        accessibilityLabel="Choose Print"
        className="px-4 py-3"
      >
        <Text className="text-base text-primary">Print</Text>
      </Pressable>
    </View>
  );

  const panelNode = onMainMenu ? (
    mainNode
  ) : (
    <PrintMediaBloomPanel
      screen={mediaScreen}
      picking={picking}
      permissionSource={permissionSource}
      errorMessage={errorMessage}
      onPick={(source) => {
        void handlePick(source);
      }}
      onBackToMedia={() => {
        resetToMedia();
      }}
      onDismiss={() => setOpen(false)}
      onBackToParent={
        mediaScreen === "media"
          ? () => {
              setOnMainMenu(true);
              resetToMedia();
            }
          : undefined
      }
    />
  );

  return (
    <Animated.View
      style={chromeFadeStyle}
      pointerEvents="box-none"
      className="absolute right-5 bottom-5 z-50"
    >
      <BloomButton
        variant="menu"
        open={open}
        onOpenChange={setOpen}
        onClose={() => {
          setOnMainMenu(true);
          resetToMedia();
        }}
        contentKey={contentKey}
        panelNode={panelNode}
        accessibilityRole="button"
        accessibilityLabel="Create entry"
      >
        <View className="flex items-center justify-center p-2">
          <Icon name="plus" size={TRIGGER_ICON_SIZE} color={TRIGGER_ICON_COLOR} />
        </View>
      </BloomButton>
    </Animated.View>
  );
};

export default CreateEntryButton;
