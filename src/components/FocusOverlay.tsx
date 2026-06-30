import { BlurView } from "expo-blur";
import { useCallback, useEffect, useLayoutEffect, useRef } from "react";
import { BackHandler, Pressable, StyleSheet, Text, View } from "react-native";
import Animated, {
  AnimatedRef,
  interpolate,
  measure,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withSpring,
  withTiming,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Portal } from "react-native-teleport";
import { scheduleOnRN, scheduleOnUI } from "react-native-worklets";

import type { Entry } from "../data/entries";

import { useBlurTargetRef } from "./BlurTargetViewContext";
import CollapsedDeck from "./CollapsedDeck";
import { Icon } from "./Icon";

const FOCUS_SPRING = { stiffness: 110, damping: 20, mass: 1, overshootClamping: true };
const BACKDROP_FADE_END = 0.2;
const CLONE_BLOOM_START = 0.15;
// Menu items animate independently of the open spring so the stagger + fade are
// perceivable (the spring otherwise rushes through the menu range in ~100ms).
const MENU_BASE_DELAY_MS = 120;
const MENU_STAGGER_MS = 70;
const MENU_ITEM_DURATION_MS = 220;
const MENU_CLOSE_DURATION_MS = 150;
const MENU_TRANSLATE_Y = 14;
const BLUR_INTENSITY = 30;

const MENU_ITEMS = [
  { label: "Edit", icon: "pencil" as const },
  { label: "Add to gallery", icon: "photo" as const },
  { label: "Share", icon: "share" as const },
  { label: "Delete", icon: "trash" as const },
];

type FocusOverlayProps = {
  triggerRef: AnimatedRef<Animated.View>;
  open: boolean;
  entry: Entry;
  activePage: number;
  onRequestClose: () => void;
  onClose?: () => void;
};

type FocusMenuItemProps = {
  label: string;
  icon: (typeof MENU_ITEMS)[number]["icon"];
  index: number;
  open: boolean;
  onPress: () => void;
};

const FocusMenuItem = ({ label, icon, index, open, onPress }: FocusMenuItemProps) => {
  const itemProgress = useSharedValue(0);

  useEffect(() => {
    const delay = MENU_BASE_DELAY_MS + index * MENU_STAGGER_MS;

    if (open) {
      itemProgress.value = withDelay(delay, withTiming(1, { duration: MENU_ITEM_DURATION_MS }));
    } else {
      itemProgress.value = withTiming(0, { duration: MENU_CLOSE_DURATION_MS });
    }
  }, [index, itemProgress, open]);

  const itemStyle = useAnimatedStyle(() => ({
    opacity: itemProgress.value,
    transform: [{ translateY: interpolate(itemProgress.value, [0, 1], [MENU_TRANSLATE_Y, 0]) }],
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

const FocusOverlay = ({
  triggerRef,
  open,
  entry,
  activePage,
  onRequestClose,
  onClose,
}: FocusOverlayProps) => {
  const insets = useSafeAreaInsets();
  const blurTargetRef = useBlurTargetRef();
  const progress = useSharedValue(0);
  const origin = useSharedValue({ x: 0, y: 0, width: 1, height: 1 });
  const cloneProgress = useSharedValue(0);
  const cloneCurrentPage = useSharedValue(0);
  const cloneActiveIndex = useSharedValue(0);
  const isFirstRun = useRef(true);

  useEffect(() => {
    cloneCurrentPage.value = activePage;
    cloneActiveIndex.value = activePage;
  }, [activePage, cloneActiveIndex, cloneCurrentPage]);

  const finishClose = useCallback(() => {
    onClose?.();
  }, [onClose]);

  const animateOpen = useCallback(() => {
    scheduleOnUI(() => {
      "worklet";
      const layout = measure(triggerRef);

      if (layout) {
        origin.value = {
          x: layout.pageX,
          y: layout.pageY,
          width: layout.width,
          height: layout.height,
        };
      }

      progress.value = withSpring(1, FOCUS_SPRING);
    });
  }, [origin, progress, triggerRef]);

  const animateClose = useCallback(() => {
    scheduleOnUI(() => {
      "worklet";
      progress.value = withSpring(0, FOCUS_SPRING, (finished) => {
        if (finished) {
          scheduleOnRN(finishClose);
        }
      });
    });
  }, [finishClose, progress]);

  useLayoutEffect(() => {
    if (isFirstRun.current) {
      isFirstRun.current = false;
      return;
    }

    if (open) {
      animateOpen();
      return;
    }

    animateClose();
  }, [animateClose, animateOpen, open]);

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
    opacity: interpolate(progress.value, [0, BACKDROP_FADE_END], [0, 1]),
  }));

  const cloneStyle = useAnimatedStyle(() => ({
    opacity: interpolate(progress.value, [CLONE_BLOOM_START, CLONE_BLOOM_START + 0.15], [0, 1]),
    transform: [
      { translateX: origin.value.x },
      { translateY: origin.value.y },
      { scale: interpolate(progress.value, [CLONE_BLOOM_START, 1], [1, 1.02]) },
    ],
    width: origin.value.width,
    height: origin.value.height,
  }));

  const noopAction = useCallback(() => {}, []);

  const menuTop = insets.top + 12;

  // Anchor the menu to the artefact's measured frame so the right-aligned items
  // line up with the artefact's right edge (not the screen edge).
  const menuStyle = useAnimatedStyle(() => ({
    left: origin.value.x,
    width: origin.value.width,
  }));

  return (
    <Portal hostName="morph">
      <View style={styles.root} pointerEvents={open ? "auto" : "none"}>
        <Pressable
          style={StyleSheet.absoluteFill}
          onPress={onRequestClose}
          accessibilityRole="button"
          accessibilityLabel="Dismiss entry options"
        >
          <Animated.View style={[StyleSheet.absoluteFill, backdropStyle]}>
            <BlurView
              blurTarget={blurTargetRef}
              blurMethod="dimezisBlurViewSdk31Plus"
              tint="dark"
              intensity={BLUR_INTENSITY}
              style={StyleSheet.absoluteFill}
            />
          </Animated.View>
        </Pressable>

        <Animated.View style={[styles.clone, cloneStyle]} pointerEvents="none">
          <CollapsedDeck
            entry={entry}
            progress={cloneProgress}
            currentPage={cloneCurrentPage}
            activeIndex={cloneActiveIndex}
          />
        </Animated.View>

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
