/**
 * FocusOverlay — the long-press "actions" overlay for an entry.
 *
 * When you long-press a collapsed entry (or tap its ellipsis button), this
 * overlay appears: a blurred backdrop dims the screen, a **clone** of the
 * entry's deck is frozen on top of the original (so the deck looks "lifted"
 * out of the list), and a small menu of actions (Edit / Add to gallery / Share
 * / Delete) fades in above it.
 *
 * How it works (the measure-and-morph pattern):
 *   1. On open, measure the collapsed deck's on-screen frame (`triggerRef`)
 *      from a UI-thread worklet and store it in `origin`.
 *   2. Spring `progress` 0 → 1. The backdrop fades in, the clone blooms in at
 *      the deck's measured position, and the menu items stagger in.
 *   3. On close, spring `progress` back to 0. No post-close RN notification is
 *      required: the overlay is preloaded and stays mounted; `open={false}`
 *      alone drives the close spring. (An earlier `onClose` + `scheduleOnRN`
 *      bridge was unused by Stack and risked function-valued Worklets args.)
 *
 * The overlay always lives in the root `morph` portal host and is always
 * mounted (preloaded) by `Stack` so opening never mounts it fresh. It only
 * animates when `open` flips — see the `previousOpenRef` transition guard
 * (StrictMode-safe: mount / effect replay does not schedule a close spring).
 *
 * Note: the menu items are currently wired to a no-op (`noopAction`) — this is
 * a UI/interaction prototype; the actions aren't implemented yet.
 */
import { BlurView } from "expo-blur";
import { useEffect, useLayoutEffect, useRef } from "react";
import { BackHandler, Pressable, StyleSheet, Text, View } from "react-native";
import Animated, {
  type AnimatedRef,
  interpolate,
  measure,
  type SharedValue,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withSpring,
  withTiming,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Portal } from "react-native-teleport";
import { scheduleOnUI } from "react-native-worklets";

import type { Entry } from "../data/entries";

import { useAndroidBlurTargetProps } from "./BlurTargetViewContext";
import CollapsedDeck from "./CollapsedDeck";
import { Icon } from "./Icon";

// Spring for the open/close morph. `overshootClamping` keeps the clone from
// bouncing past its rest position (which would look like a glitch here).
const FOCUS_SPRING = { stiffness: 110, damping: 20, mass: 1, overshootClamping: true };
// Backdrop reaches full opacity over the first 20% of the animation.
const BACKDROP_FADE_END = 0.2;
// The clone fades in starting at 15% progress (after the backdrop has begun),
// so the deck appears to lift out as the blur comes up behind it.
const CLONE_BLOOM_START = 0.15;
// Menu items animate independently of the open spring so the stagger + fade are
// perceivable (the spring otherwise rushes through the menu range in ~100ms).
const MENU_BASE_DELAY_MS = 120;
const MENU_STAGGER_MS = 70;
const MENU_ITEM_DURATION_MS = 220;
const MENU_CLOSE_DURATION_MS = 150;
const MENU_TRANSLATE_Y = 14;
const BLUR_INTENSITY = 30;

// The fixed list of action menu items. The `icon` strings map to glyph names
// in the Icon component.
const MENU_ITEMS = [
  { label: "Edit", icon: "pencil" as const },
  { label: "Add to gallery", icon: "photo" as const },
  { label: "Share", icon: "share" as const },
  { label: "Delete", icon: "trash" as const },
];

type FocusOverlayProps = {
  // Ref to the collapsed deck (`Stack`'s `triggerRef`). Measured on open to
  // position the clone exactly over the original.
  triggerRef: AnimatedRef<Animated.View>;
  open: boolean;
  entry: Entry;
  // Which artefact page the deck is on; mirrored into the clone so the clone
  // shows the same card as the original.
  activePage: number;
  onRequestClose: () => void;
};

type FocusMenuItemProps = {
  label: string;
  icon: (typeof MENU_ITEMS)[number]["icon"];
  // The item's position in the menu, used to stagger its entrance.
  index: number;
  open: boolean;
  onPress: () => void;
};

/**
 * FocusMenuItem — a single action row in the menu.
 *
 * Each item owns a small `itemProgress` shared value (0 = hidden, 1 = shown).
 * On open, items animate in with a per-index delay so they stagger downward
 * (each item starts `MENU_STAGGER_MS` after the previous). On close they all
 * fade out together over a shorter duration. The entrance also slides the item
 * up by `MENU_TRANSLATE_Y` as it fades in, for a subtle "rise into place".
 */
const FocusMenuItem = ({ label, icon, index, open, onPress }: FocusMenuItemProps) => {
  const itemProgress = useSharedValue(0);

  // Drive itemProgress from the `open` prop. The open animation uses
  // `withDelay(index * stagger)` for the stagger; the close animation skips
  // the delay so the whole menu clears quickly.
  useEffect(() => {
    const delay = MENU_BASE_DELAY_MS + index * MENU_STAGGER_MS;

    if (open) {
      itemProgress.set(withDelay(delay, withTiming(1, { duration: MENU_ITEM_DURATION_MS })));
    } else {
      itemProgress.set(withTiming(0, { duration: MENU_CLOSE_DURATION_MS }));
    }
  }, [index, itemProgress, open]);

  // Map progress to opacity + a small upward translate as the item appears.
  const itemStyle = useAnimatedStyle(() => ({
    opacity: itemProgress.get(),
    transform: [{ translateY: interpolate(itemProgress.get(), [0, 1], [MENU_TRANSLATE_Y, 0]) }],
  }));

  return (
    <Animated.View style={itemStyle}>
      <Pressable
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel={label}
        className="flex-row items-center gap-3 py-1.5"
      >
        <Text className="font-sans-medium text-base text-white">{label}</Text>
        <Icon name={icon} size={22} color="#FFFFFF" />
      </Pressable>
    </Animated.View>
  );
};

type OverlayOrigin = { x: number; y: number; width: number; height: number };

const animateOpen = ({
  triggerRef,
  origin,
  progress,
}: {
  triggerRef: AnimatedRef<Animated.View>;
  origin: SharedValue<OverlayOrigin>;
  progress: SharedValue<number>;
}) => {
  scheduleOnUI(() => {
    "worklet";
    const layout = measure(triggerRef);

    if (layout) {
      origin.set({
        x: layout.pageX,
        y: layout.pageY,
        width: layout.width,
        height: layout.height,
      });
    }

    progress.set(withSpring(1, FOCUS_SPRING));
  });
};

const animateClose = ({ progress }: { progress: SharedValue<number> }) => {
  scheduleOnUI(() => {
    "worklet";
    progress.set(withSpring(0, FOCUS_SPRING));
  });
};

/**
 * FocusOverlay — the overlay component (see file header for the big picture).
 */
const FocusOverlay = ({
  triggerRef,
  open,
  entry,
  activePage,
  onRequestClose,
}: FocusOverlayProps) => {
  const insets = useSafeAreaInsets();
  // Android-only blurTarget — see useAndroidBlurTargetProps (avoids StrictMode
  // findNodeHandle from expo-blur on iOS).
  const androidBlurProps = useAndroidBlurTargetProps();
  // 0 = closed, 1 = open. Drives backdrop, clone, and (indirectly) the menu.
  const progress = useSharedValue(0);
  // The collapsed deck's measured screen frame. The clone is positioned here.
  const origin = useSharedValue({ x: 0, y: 0, width: 1, height: 1 });
  // The clone's own progress/currentPage/activeIndex. We DON'T share the deck's
  // real shared values because the clone must stay frozen at the captured page
  // even if the underlying list scrolls while the overlay is open. We mirror
  // `activePage` into these on change, below.
  const cloneProgress = useSharedValue(0);
  const cloneCurrentPage = useSharedValue(0);
  const cloneActiveIndex = useSharedValue(0);
  // Transition guard: only animate when `open` actually flips. Initialized from
  // `open` so mount / StrictMode effect replay does not schedule a close spring.
  const previousOpenRef = useRef(open);

  // Mirror the deck's current page into the clone's shared values whenever it
  // changes. This way the clone shows the same card as the original when it
  // opens, but won't move if the list scrolls behind the overlay.
  useEffect(() => {
    cloneCurrentPage.set(activePage);
    cloneActiveIndex.set(activePage);
  }, [activePage, cloneActiveIndex, cloneCurrentPage]);

  // Trigger open/close on `open` transitions only. useLayoutEffect runs before
  // paint so the animation starts in the same frame as the state change.
  useLayoutEffect(() => {
    if (previousOpenRef.current === open) {
      return;
    }

    previousOpenRef.current = open;

    if (open) {
      animateOpen({ triggerRef, origin, progress });
      return;
    }

    animateClose({ progress });
  }, [open, origin, progress, triggerRef]);

  // Hardware-back (Android) closes the overlay when open. Returning true
  // suppresses the default back behavior (navigating away).
  useEffect(() => {
    if (!open) {
      return;
    }

    const subscription = BackHandler.addEventListener("hardwareBackPress", () => {
      onRequestClose();
      return true;
    });

    return () => subscription.remove();
  }, [onRequestClose, open]);

  // Backdrop opacity follows `progress`, reaching full opacity by
  // BACKDROP_FADE_END so the blur is at full strength shortly into the anim.
  const backdropStyle = useAnimatedStyle(() => ({
    opacity: interpolate(progress.get(), [0, BACKDROP_FADE_END], [0, 1]),
  }));

  // The clone: positioned at the deck's measured frame (origin) and faded in
  // starting at CLONE_BLOOM_START. A tiny scale-up (1 -> 1.02) gives a subtle
  // "lifted" feel. Width/height are fixed to the measured frame so the clone
  // exactly covers the original deck.
  const cloneStyle = useAnimatedStyle(() => ({
    opacity: interpolate(progress.get(), [CLONE_BLOOM_START, CLONE_BLOOM_START + 0.15], [0, 1]),
    transform: [
      { translateX: origin.get().x },
      { translateY: origin.get().y },
      { scale: interpolate(progress.get(), [CLONE_BLOOM_START, 1], [1, 1.02]) },
    ],
    width: origin.get().width,
    height: origin.get().height,
  }));

  // Placeholder action handler — the menu actions aren't implemented yet, so
  // tapping an item does nothing.
  const noopAction = () => {};

  // The menu sits just below the top safe area.
  const menuTop = insets.top + 12;

  // Anchor the menu to the artefact's measured frame so the right-aligned items
  // line up with the artefact's right edge (not the screen edge).
  const menuStyle = useAnimatedStyle(() => ({
    left: origin.get().x,
    width: origin.get().width,
  }));

  return (
    // Rendered into the root `morph` portal host so it floats above the app.
    <Portal hostName="morph">
      {/* Root covers the screen. pointerEvents follow `open` so a closed
          overlay can't intercept touches. */}
      <View style={styles.root} pointerEvents={open ? "auto" : "none"}>
        {/* The dismiss layer: a full-screen Pressable that closes the overlay
            on tap, with the blurred backdrop as its visual content. */}
        <Pressable
          style={StyleSheet.absoluteFill}
          onPress={onRequestClose}
          accessibilityRole="button"
          accessibilityLabel="Dismiss entry options"
        >
          <Animated.View style={[StyleSheet.absoluteFill, backdropStyle]}>
            <BlurView
              {...androidBlurProps}
              tint="dark"
              intensity={BLUR_INTENSITY}
              style={StyleSheet.absoluteFill}
            />
          </Animated.View>
        </Pressable>

        {/* The frozen clone of the deck. pointerEvents none so it never
            intercepts taps (the dismiss layer behind it handles closes). It
            reuses CollapsedDeck with the clone's own (frozen) shared values. */}
        <Animated.View style={[styles.clone, cloneStyle]} pointerEvents="none">
          <CollapsedDeck
            entry={entry}
            progress={cloneProgress}
            currentPage={cloneCurrentPage}
            activeIndex={cloneActiveIndex}
          />
        </Animated.View>

        {/* The actions menu, anchored to the deck's frame (right-aligned via
            alignItems flex-end in styles.menu) and topped at `menuTop`.
            pointerEvents box-none so gaps between items don't block the
            dismiss layer. */}
        <Animated.View style={[styles.menu, menuStyle, { top: menuTop }]} pointerEvents="box-none">
          {MENU_ITEMS.map((item, index) => (
            <FocusMenuItem
              key={item.label}
              label={item.label}
              icon={item.icon}
              index={index}
              open={open}
              onPress={noopAction}
            />
          ))}
        </Animated.View>
      </View>
    </Portal>
  );
};

const styles = StyleSheet.create({
  // Root fills the screen (absoluteFill) so the overlay covers everything.
  root: {
    ...StyleSheet.absoluteFill,
  },
  // The clone is positioned absolutely from (0,0) and translated to `origin`
  // by the animated style. overflow visible so shadows aren't clipped.
  clone: {
    position: "absolute",
    top: 0,
    left: 0,
    overflow: "visible",
  },
  // The menu is positioned absolutely; `alignItems: "flex-end"` right-aligns
  // the items against the deck's right edge (set via menuStyle.width/left).
  menu: {
    position: "absolute",
    alignItems: "flex-end",
  },
});

export default FocusOverlay;
