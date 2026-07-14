/**
 * FocusOverlay — long-press / ellipsis actions overlay (measure-and-morph).
 *
 * Home and Gallery share one morph system: a measured trigger, blurred
 * backdrop, frozen subject clone, and a staggered menu. Home's Stack preloads
 * its overlay; Gallery mounts one pager-owned overlay only for the active
 * opening/open/closing target. Starting from a logically closed ref preserves
 * the opening morph when that shared Gallery overlay first mounts open.
 */
import { BlurView } from "expo-blur";
import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
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
import { scheduleOnRN, scheduleOnUI } from "react-native-worklets";

import { useAndroidBlurTargetProps } from "./BlurTargetViewContext";
import { Icon } from "./Icon";

const FOCUS_SPRING = { stiffness: 110, damping: 20, mass: 1, overshootClamping: true };
const BACKDROP_FADE_END = 0.2;
const CLONE_BLOOM_START = 0.15;
const MENU_BASE_DELAY_MS = 120;
const MENU_STAGGER_MS = 70;
const MENU_ITEM_DURATION_MS = 220;
const MENU_CLOSE_DURATION_MS = 150;
const MENU_TRANSLATE_Y = 14;
const BLUR_INTENSITY = 30;

export type FocusMenuIcon = "pencil" | "photo" | "share" | "trash";

export type FocusMenuItem = {
  label: string;
  icon: FocusMenuIcon;
  onPress: () => void;
};

type FocusOverlayProps = {
  triggerRef: AnimatedRef<Animated.View>;
  open: boolean;
  /** Frozen clone rendered at the measured trigger frame. */
  subject: ReactNode;
  menuItems: FocusMenuItem[];
  onRequestClose: () => void;
  /** Fires on JS only after the close spring has fully settled at zero. */
  onCloseComplete?: () => void;
  accessibilityDismissLabel?: string;
};

type FocusMenuItemRowProps = {
  label: string;
  icon: FocusMenuIcon;
  index: number;
  open: boolean;
  onPress: () => void;
};

const FocusMenuItemRow = ({ label, icon, index, open, onPress }: FocusMenuItemRowProps) => {
  const itemProgress = useSharedValue(0);

  useEffect(() => {
    const delay = MENU_BASE_DELAY_MS + index * MENU_STAGGER_MS;

    if (open) {
      itemProgress.set(withDelay(delay, withTiming(1, { duration: MENU_ITEM_DURATION_MS })));
    } else {
      itemProgress.set(withTiming(0, { duration: MENU_CLOSE_DURATION_MS }));
    }
  }, [index, itemProgress, open]);

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

const animateClose = ({
  progress,
  closeSequence,
  setCloseSequence,
}: {
  progress: SharedValue<number>;
  closeSequence: SharedValue<number>;
  setCloseSequence: (value: number) => void;
}) => {
  scheduleOnUI(() => {
    "worklet";
    progress.set(
      withSpring(0, FOCUS_SPRING, (finished) => {
        if (finished) {
          const next = closeSequence.get() + 1;
          closeSequence.set(next);
          scheduleOnRN(setCloseSequence, next);
        }
      }),
    );
  });
};

const FocusOverlay = ({
  triggerRef,
  open,
  subject,
  menuItems,
  onRequestClose,
  onCloseComplete,
  accessibilityDismissLabel = "Dismiss options",
}: FocusOverlayProps) => {
  const insets = useSafeAreaInsets();
  const androidBlurProps = useAndroidBlurTargetProps();
  const progress = useSharedValue(0);
  const origin = useSharedValue({ x: 0, y: 0, width: 1, height: 1 });
  // Start from closed even when this overlay mounts for an already-selected
  // Gallery target. Gallery owns one transient overlay and mounts it on demand;
  // treating its first `open` as a transition preserves the opening morph.
  const previousOpenRef = useRef(false);
  const onCloseCompleteRef = useRef(onCloseComplete);
  const closeSequenceSV = useSharedValue(0);
  const [closeSequence, setCloseSequence] = useState(0);

  useEffect(() => {
    onCloseCompleteRef.current = onCloseComplete;
  }, [onCloseComplete]);

  useEffect(() => {
    if (closeSequence > 0) {
      onCloseCompleteRef.current?.();
    }
  }, [closeSequence]);

  useLayoutEffect(() => {
    if (previousOpenRef.current === open) {
      return;
    }

    previousOpenRef.current = open;

    if (open) {
      animateOpen({ triggerRef, origin, progress });
      return;
    }

    animateClose({ progress, closeSequence: closeSequenceSV, setCloseSequence });
  }, [closeSequenceSV, open, origin, progress, triggerRef]);

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

  const backdropStyle = useAnimatedStyle(() => ({
    opacity: interpolate(progress.get(), [0, BACKDROP_FADE_END], [0, 1]),
  }));

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

  const menuTop = insets.top + 12;

  const menuStyle = useAnimatedStyle(() => ({
    left: origin.get().x,
    width: origin.get().width,
  }));

  return (
    <Portal hostName="morph">
      <View
        style={styles.root}
        pointerEvents={open ? "auto" : "none"}
        accessibilityElementsHidden={!open}
        importantForAccessibility={open ? "yes" : "no-hide-descendants"}
        accessibilityViewIsModal={open}
      >
        <Pressable
          style={StyleSheet.absoluteFill}
          onPress={onRequestClose}
          accessibilityRole="button"
          accessibilityLabel={accessibilityDismissLabel}
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

        <Animated.View style={[styles.clone, cloneStyle]} pointerEvents="none">
          {subject}
        </Animated.View>

        <Animated.View style={[styles.menu, menuStyle, { top: menuTop }]} pointerEvents="box-none">
          {menuItems.map((item, index) => (
            <FocusMenuItemRow
              key={item.label}
              label={item.label}
              icon={item.icon}
              index={index}
              open={open}
              onPress={item.onPress}
            />
          ))}
        </Animated.View>
      </View>
    </Portal>
  );
};

const styles = StyleSheet.create({
  root: {
    ...StyleSheet.absoluteFill,
  },
  clone: {
    position: "absolute",
    top: 0,
    left: 0,
    overflow: "visible",
  },
  menu: {
    position: "absolute",
    alignItems: "flex-end",
  },
});

export default FocusOverlay;
