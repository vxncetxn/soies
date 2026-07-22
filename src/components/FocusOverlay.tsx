/**
 * FocusOverlay — long-press / ellipsis actions overlay (measure-and-morph).
 *
 * Reanimated owns trigger measurement and the clone/menu geometry. Ease owns
 * the discrete backdrop, frozen-clone, and row fades. A Stack mounts this tree
 * before opening and retains it through the Ease close completion.
 */
import { BlurView } from "expo-blur";
import { useEffect, useLayoutEffect, useReducer, useRef, useState, type ReactNode } from "react";
import { BackHandler, Pressable, Text, View } from "react-native";
import { EaseView } from "react-native-ease";
import Animated, {
  type AnimatedRef,
  measure,
  type SharedValue,
  useAnimatedStyle,
  useSharedValue,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Portal } from "react-native-teleport";
import { StyleSheet, withUnistyles } from "react-native-unistyles";
import { scheduleOnRN, scheduleOnUI } from "react-native-worklets";

import {
  EASE_DEFAULT_TIMING,
  EASE_FOCUS_BACKDROP_TIMING,
  EASE_FOCUS_CLONE_TIMING,
} from "../constants/animation";
import { useReducedMotionPreference } from "../hooks/useReducedMotionPreference";
import { EaseMotionCompletionQueue } from "../utils/easeMotionCompletion";
import { useAndroidBlurTargetProps } from "./BlurTargetViewContext";
import {
  focusOverlayTargetVisible,
  type FocusOverlayTransitionEvent,
  focusOverlayTransitionReducer,
  focusOverlayTransitionState,
} from "./focusOverlayTransition";
import { Icon } from "./Icon";

const StyledEaseView = withUnistyles(EaseView);
const ThemedMenuIcon = withUnistyles(Icon, (theme) => ({
  color: theme.colors.content.onAction,
}));

const MENU_BASE_DELAY_MS = 120;
const MENU_STAGGER_MS = 70;
const MENU_ITEM_DURATION_MS = 220;
const MENU_CLOSE_DURATION_MS = 150;
const MENU_TRANSLATE_Y = 14;
const BACKDROP_CLOSE_DELAY_MS = 100;
const CLONE_OPEN_DELAY_MS = 30;
const CLONE_CLOSE_DELAY_MS = 100;
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
  /** Starts presentation only after the portaled blur has a native layout. */
  onNativeReady: () => void;
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
  reduceMotionEnabled: boolean;
  onPress: () => void;
};

const FocusMenuItemRow = ({
  label,
  icon,
  index,
  open,
  reduceMotionEnabled,
  onPress,
}: FocusMenuItemRowProps) => {
  return (
    <StyledEaseView
      initialAnimate={{ opacity: 0, translateY: MENU_TRANSLATE_Y }}
      animate={{ opacity: open ? 1 : 0, translateY: open ? 0 : MENU_TRANSLATE_Y }}
      transition={
        reduceMotionEnabled
          ? { type: "none" }
          : {
              ...EASE_DEFAULT_TIMING,
              duration: open ? MENU_ITEM_DURATION_MS : MENU_CLOSE_DURATION_MS,
              delay: open ? MENU_BASE_DELAY_MS + index * MENU_STAGGER_MS : 0,
            }
      }
    >
      <Pressable
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel={label}
        style={styles.menuItem}
      >
        <Text style={styles.menuItemLabel}>{label}</Text>
        <ThemedMenuIcon name={icon} size={22} />
      </Pressable>
    </StyledEaseView>
  );
};

type OverlayOrigin = { x: number; y: number; width: number; height: number };

const measureOpenOrigin = ({
  triggerRef,
  origin,
  requestId,
  dispatchTransition,
}: {
  triggerRef: AnimatedRef<Animated.View>;
  origin: SharedValue<OverlayOrigin>;
  requestId: number;
  dispatchTransition: (event: FocusOverlayTransitionEvent) => void;
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
    scheduleOnRN(dispatchTransition, { type: "request", target: "open", requestId });
  });
};

type FocusShellCompletion = {
  requestId: number;
  target: "open" | "closed";
};

const FocusOverlay = ({
  triggerRef,
  open,
  subject,
  menuItems,
  onNativeReady,
  onRequestClose,
  onCloseComplete,
  accessibilityDismissLabel = "Dismiss options",
}: FocusOverlayProps) => {
  const insets = useSafeAreaInsets();
  const reduceMotionEnabled = useReducedMotionPreference();
  const androidBlurProps = useAndroidBlurTargetProps();
  const origin = useSharedValue({ x: 0, y: 0, width: 1, height: 1 });
  const [transitionState, dispatchTransition] = useReducer(
    focusOverlayTransitionReducer,
    undefined,
    focusOverlayTransitionState,
  );
  const targetVisible = focusOverlayTargetVisible(transitionState);
  const targetName = targetVisible ? "open" : "closed";
  const [completionQueue] = useState(
    () => new EaseMotionCompletionQueue<FocusShellCompletion>("closed"),
  );
  // The parent first mounts Focus closed so the Portal can lay out, then flips
  // `open`. Measuring before dispatching the opening phase avoids a one-frame
  // clone flash at the fallback 1×1 origin.
  const previousOpenRef = useRef(false);
  const nextRequestIdRef = useRef(0);
  const latestRequestIdRef = useRef(0);
  const nativeReadySignalledRef = useRef(false);
  const onCloseCompleteRef = useRef(onCloseComplete);

  // Synchronize before the animation layout effect below. Reduced-motion can
  // settle a close immediately, so a passive effect would leave that callback
  // observing the preceding render's owner.
  useLayoutEffect(() => {
    onCloseCompleteRef.current = onCloseComplete;
  }, [onCloseComplete]);

  useLayoutEffect(() => {
    if (previousOpenRef.current === open) {
      return;
    }

    previousOpenRef.current = open;
    nextRequestIdRef.current += 1;
    const requestId = nextRequestIdRef.current;
    latestRequestIdRef.current = requestId;

    if (open) {
      measureOpenOrigin({ triggerRef, origin, requestId, dispatchTransition });
      return;
    }

    dispatchTransition({ type: "request", target: "closed", requestId });
    if (transitionState.phase === "closed") {
      onCloseCompleteRef.current?.();
    }
  }, [open, origin, transitionState.phase, triggerRef]);

  useLayoutEffect(() => {
    completionQueue.transition(
      targetName,
      transitionState.requestId === null
        ? null
        : { requestId: transitionState.requestId, target: targetName },
    );
  }, [completionQueue, targetName, transitionState.requestId]);

  useEffect(() => {
    if (!targetVisible) {
      return;
    }

    const subscription = BackHandler.addEventListener("hardwareBackPress", () => {
      onRequestClose();
      return true;
    });

    return () => subscription.remove();
  }, [onRequestClose, targetVisible]);

  const cloneGeometryStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: origin.get().x }, { translateY: origin.get().y }],
    width: origin.get().width,
    height: origin.get().height,
  }));

  const menuTop = insets.top + 12;

  const menuStyle = useAnimatedStyle(() => ({
    left: origin.get().x,
    width: origin.get().width,
  }));

  const signalNativeReady = () => {
    if (nativeReadySignalledRef.current) {
      return;
    }

    nativeReadySignalledRef.current = true;
    onNativeReady();
  };

  const handleShellMotionEnd = (finished: boolean) => {
    const completion = completionQueue.finish(finished);
    if (completion === null || completion.requestId !== latestRequestIdRef.current) {
      return;
    }

    dispatchTransition({ type: "motionFinished", requestId: completion.requestId });
    if (completion.target === "closed") {
      onCloseCompleteRef.current?.();
    }
  };

  const backdropTransition = reduceMotionEnabled
    ? ({ type: "none" } as const)
    : {
        ...EASE_FOCUS_BACKDROP_TIMING,
        delay: targetVisible ? 0 : BACKDROP_CLOSE_DELAY_MS,
      };
  const cloneTransition = reduceMotionEnabled
    ? ({ type: "none" } as const)
    : {
        ...EASE_FOCUS_CLONE_TIMING,
        delay: targetVisible ? CLONE_OPEN_DELAY_MS : CLONE_CLOSE_DELAY_MS,
      };

  return (
    <Portal hostName="morph">
      <View
        style={styles.root}
        onLayout={signalNativeReady}
        pointerEvents={targetVisible ? "auto" : "none"}
        accessibilityElementsHidden={!targetVisible}
        importantForAccessibility={targetVisible ? "yes" : "no-hide-descendants"}
        accessibilityViewIsModal={targetVisible}
      >
        <Pressable
          style={StyleSheet.absoluteFill}
          onPress={onRequestClose}
          accessibilityRole="button"
          accessibilityLabel={accessibilityDismissLabel}
        >
          <StyledEaseView
            style={StyleSheet.absoluteFill}
            initialAnimate={{ opacity: 0 }}
            animate={{ opacity: targetVisible ? 1 : 0 }}
            transition={backdropTransition}
          >
            <BlurView
              {...androidBlurProps}
              tint="dark"
              intensity={BLUR_INTENSITY}
              style={StyleSheet.absoluteFill}
            />
          </StyledEaseView>
        </Pressable>

        <Animated.View style={[styles.clone, cloneGeometryStyle]} pointerEvents="none">
          <StyledEaseView
            style={styles.cloneFade}
            initialAnimate={{ opacity: 0 }}
            animate={{ opacity: targetVisible ? 1 : 0 }}
            transition={cloneTransition}
            onTransitionEnd={(event) => handleShellMotionEnd(event.finished)}
          >
            {subject}
          </StyledEaseView>
        </Animated.View>

        <Animated.View style={[styles.menu, menuStyle, { top: menuTop }]} pointerEvents="box-none">
          {menuItems.map((item, index) => (
            <FocusMenuItemRow
              key={item.label}
              label={item.label}
              icon={item.icon}
              index={index}
              open={targetVisible}
              reduceMotionEnabled={reduceMotionEnabled}
              onPress={item.onPress}
            />
          ))}
        </Animated.View>
      </View>
    </Portal>
  );
};

const styles = StyleSheet.create((theme) => ({
  root: {
    ...StyleSheet.absoluteFill,
  },
  clone: {
    position: "absolute",
    top: 0,
    left: 0,
    overflow: "visible",
  },
  cloneFade: {
    flex: 1,
  },
  menu: {
    position: "absolute",
    alignItems: "flex-end",
  },
  menuItem: {
    alignItems: "center",
    flexDirection: "row",
    gap: 12,
    paddingVertical: 6,
  },
  menuItemLabel: {
    ...theme.typography.ui.bodyMedium,
    color: theme.colors.content.onAction,
  },
}));

export default FocusOverlay;
