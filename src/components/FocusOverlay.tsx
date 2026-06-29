import { BlurView } from "expo-blur";
import { useEffect } from "react";
import {
  BackHandler,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from "react-native";
import Animated, { AnimatedRef, interpolate, useAnimatedStyle } from "react-native-reanimated";
import { Portal } from "react-native-teleport";

import type { Entry } from "../data/entries";

import {
  CONTENT_BLOOM_START,
  MORPH_BORDER_RADIUS,
  PANEL_FADE_END,
  SHADOW_XL,
} from "../constants/animation";
import { useMorphFromTrigger } from "../hooks/useMorphFromTrigger";
import { useBlurTargetRef } from "./BlurTargetViewContext";
import CollapsedDeck, { collapsedDeckContainerClass } from "./CollapsedDeck";

const CHIP_PANEL_HEIGHT = 52;
const CHIP_PANEL_WIDTH_RATIO = 0.88;
const LONG_PRESS_FOCUS_CHIPS = ["Edit", "Add to Gallery", "Share", "Delete"] as const;

type FocusOverlayProps = {
  triggerRef: AnimatedRef<Animated.View>;
  open: boolean;
  entry: Entry;
  activePage: number;
  onRequestClose: () => void;
  onClose?: () => void;
};

const FocusOverlay = ({
  triggerRef,
  open,
  entry,
  activePage,
  onRequestClose,
  onClose,
}: FocusOverlayProps) => {
  const { width: screenWidth } = useWindowDimensions();
  const blurTargetRef = useBlurTargetRef();
  const { progress, origin, screenW } = useMorphFromTrigger({
    triggerRef,
    open,
    onClose,
  });

  const blurFallback = Platform.OS === "android" && Platform.Version < 31;

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
    opacity: interpolate(progress.value, [0, PANEL_FADE_END], [0, 1]),
  }));

  const cloneStyle = useAnimatedStyle(() => {
    const o = origin.value;

    return {
      position: "absolute",
      left: o.x,
      top: o.y,
      width: o.width,
      height: o.height,
      opacity: interpolate(progress.value, [0, PANEL_FADE_END], [0, 1]),
      transform: [{ scale: interpolate(progress.value, [0, 1], [0.96, 1.02]) }],
      shadowColor: "#000",
      shadowOffset: { width: 0, height: SHADOW_XL.offsetY },
      shadowOpacity: interpolate(progress.value, [0, 1], [0, SHADOW_XL.opacity]),
      shadowRadius: SHADOW_XL.radius,
      elevation: SHADOW_XL.elevation,
    };
  });

  const chipPanelStyle = useAnimatedStyle(() => {
    const o = origin.value;
    const targetWidth = screenW.value * CHIP_PANEL_WIDTH_RATIO;
    const targetHeight = CHIP_PANEL_HEIGHT;
    const targetX = o.x + (o.width - targetWidth) / 2;
    const targetY = o.y + o.height + 8;

    return {
      opacity: interpolate(progress.value, [0, PANEL_FADE_END], [0, 1]),
      transform: [
        { translateX: interpolate(progress.value, [0, 1], [o.x, targetX]) },
        { translateY: interpolate(progress.value, [0, 1], [o.y, targetY]) },
        { scaleX: interpolate(progress.value, [0, 1], [o.width / targetWidth, 1]) },
        { scaleY: interpolate(progress.value, [0, 1], [o.height / targetHeight, 1]) },
      ],
      borderRadius: interpolate(progress.value, [0, 1], [MORPH_BORDER_RADIUS, 16]),
    };
  });

  const chipContentStyle = useAnimatedStyle(() => ({
    opacity: interpolate(progress.value, [CONTENT_BLOOM_START, 1], [0, 1]),
    transform: [{ scale: interpolate(progress.value, [CONTENT_BLOOM_START, 1], [0.96, 1]) }],
  }));

  const chipPanelWidth = screenWidth * CHIP_PANEL_WIDTH_RATIO;

  return (
    <Portal hostName="morph">
      <View style={styles.root} pointerEvents={open ? "auto" : "none"}>
        <Animated.View style={[styles.backdrop, backdropStyle]}>
          {blurFallback ? (
            <View style={styles.dimFallback} />
          ) : (
            <BlurView
              blurTarget={blurTargetRef}
              intensity={40}
              tint="dark"
              blurMethod="dimezisBlurViewSdk31Plus"
              style={StyleSheet.absoluteFill}
            />
          )}
          <Pressable
            style={StyleSheet.absoluteFill}
            onPress={onRequestClose}
            accessibilityRole="button"
            accessibilityLabel="Close focus menu"
          />
        </Animated.View>

        <Animated.View style={cloneStyle} pointerEvents="none">
          <View className={collapsedDeckContainerClass(entry.type)} style={styles.cloneFrame}>
            <CollapsedDeck entry={entry} activePage={activePage} />
          </View>
        </Animated.View>

        <Animated.View
          style={[
            styles.chipPanel,
            { width: chipPanelWidth, height: CHIP_PANEL_HEIGHT },
            chipPanelStyle,
          ]}
          pointerEvents="auto"
        >
          <Animated.View style={[styles.chipRow, chipContentStyle]}>
            {LONG_PRESS_FOCUS_CHIPS.map((label) => (
              <Pressable
                key={label}
                onPress={() => {}}
                accessibilityRole="button"
                accessibilityLabel={label}
                className="border-controls-border bg-controls-background flex-1 items-center justify-center rounded-xl border px-2 py-2"
              >
                <Text className="text-primary text-center font-sans text-xs" numberOfLines={2}>
                  {label}
                </Text>
              </Pressable>
            ))}
          </Animated.View>
        </Animated.View>
      </View>
    </Portal>
  );
};

const styles = StyleSheet.create({
  root: {
    ...StyleSheet.absoluteFill,
  },
  backdrop: {
    ...StyleSheet.absoluteFill,
  },
  dimFallback: {
    ...StyleSheet.absoluteFill,
    backgroundColor: "rgba(0, 0, 0, 0.45)",
  },
  cloneFrame: {
    flex: 1,
  },
  chipPanel: {
    position: "absolute",
    top: 0,
    left: 0,
    overflow: "hidden",
    backgroundColor: "#FFFFFF",
    transformOrigin: "top left",
  },
  chipRow: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 8,
  },
});

export default FocusOverlay;
