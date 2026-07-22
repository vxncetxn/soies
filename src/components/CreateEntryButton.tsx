/**
 * CreateEntryButton — the floating "+" control that blooms into a create menu.
 *
 * It's a thin wrapper around `BloomButton` (variant="menu"): a round plus
 * trigger that stays inline at the bottom-right of Home and, on tap, a
 * separate frosted panel blooms upward into a create menu.
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
 *   bottom and right safe-area edges). Home's root view is the relative
 *   positioning container, and the Featured launcher mirrors this control at
 *   bottom-left.
 *
 * Chrome fade:
 *   Separate nested Ease wrappers map the Stack-expansion phase and root Entry
 *   transition to opacity. Its bloomed panel lives in the root `bloom` portal
 *   outside these wrappers, so an open menu stays visible during either fade.
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
import { StyleSheet, withUnistyles } from "react-native-unistyles";

import { entryChromeVisible } from "../entry-transition/entryTransition";
import { useEntryTransition } from "../entry-transition/EntryTransitionContext";
import { EntryChromeMotion } from "../entry-transition/EntryTransitionMotion";
import { usePrintImagePickFlow } from "../hooks/usePrintImagePickFlow";
import { todayISO } from "../utils/date";
import BloomButton from "./BloomButton";
import { useCreateContext } from "./CreateContext";
import { Icon } from "./Icon";
import { PrintMediaBloomPanel } from "./PrintMediaBloomPanel";
import { StackChromeMotion } from "./StackChromeMotion";

const TRIGGER_ICON_SIZE = 24;
const ThemedIcon = withUnistyles(Icon, (theme) => ({
  color: theme.colors.icon.default,
}));

const CreateEntryButton = () => {
  const { date } = useLocalSearchParams<{ date?: string }>();
  const effectiveDate = date ?? todayISO();
  const { createMode, openCreate } = useCreateContext();
  const [open, setOpen] = useState(false);
  /** `main` = Paper/Print chooser; otherwise mirrors pick-flow media screen. */
  const [onMainMenu, setOnMainMenu] = useState(true);
  const { state: entryTransitionState } = useEntryTransition();
  const entryChromeIsVisible = entryChromeVisible(entryTransitionState, "home");

  const {
    picking,
    mediaScreen,
    setMediaScreen,
    permissionSource,
    errorMessage,
    handlePick,
    resetToMedia,
  } = usePrintImagePickFlow({
    recoverPending: createMode === null,
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
    <View style={styles.panel}>
      <Pressable
        onPress={() => {
          setOpen(false);
          openCreate("paper", effectiveDate);
        }}
        accessibilityRole="button"
        accessibilityLabel="Choose Paper"
        style={styles.row}
      >
        <Text style={styles.rowText}>Paper</Text>
      </Pressable>
      <Pressable
        onPress={() => {
          setMediaScreen("media");
          setOnMainMenu(false);
        }}
        accessibilityRole="button"
        accessibilityLabel="Choose Print"
        style={styles.row}
      >
        <Text style={styles.rowText}>Print</Text>
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
    <EntryChromeMotion
      visible={entryChromeIsVisible}
      pointerEvents="box-none"
      style={styles.position}
    >
      <StackChromeMotion pointerEvents="box-none">
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
          <View style={styles.triggerContent}>
            <ThemedIcon name="plus" size={TRIGGER_ICON_SIZE} />
          </View>
        </BloomButton>
      </StackChromeMotion>
    </EntryChromeMotion>
  );
};

export default CreateEntryButton;

const styles = StyleSheet.create((theme) => ({
  panel: {
    paddingVertical: 8,
  },
  position: {
    bottom: 20,
    position: "absolute",
    right: 20,
    zIndex: 50,
  },
  row: {
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  rowText: {
    ...theme.typography.ui.body,
    color: theme.colors.content.primary,
  },
  triggerContent: {
    alignItems: "center",
    justifyContent: "center",
    padding: 8,
  },
}));
