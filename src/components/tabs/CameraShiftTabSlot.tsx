import { usePathname } from "expo-router";
/**
 * Camera-shift TabSlot — keep Home + Gallery mounted; pan content sideways.
 *
 * Floating tab chrome stays outside this slot (fixed). `shiftProgress` 0 = Home,
 * 1 = Gallery. Content moves left as the camera “shifts right” into Gallery
 * (ADR-0010).
 */
import { TabSlot, type TabsDescriptor, type TabsSlotRenderOptions } from "expo-router/ui";
import { useEffect } from "react";
import { StyleSheet, useWindowDimensions } from "react-native";
import Animated, { useAnimatedStyle, withTiming } from "react-native-reanimated";

import { useTabTransition } from "./TabTransitionContext";

const SHIFT_MS = 320;

function CameraShiftScreen({
  descriptor,
  index,
  isFocused,
  screenWidth,
}: {
  descriptor: TabsDescriptor;
  index: number;
  isFocused: boolean;
  screenWidth: number;
}) {
  const { shiftProgress } = useTabTransition();

  const style = useAnimatedStyle(() => {
    // Home (0) sits at 0 when progress=0; Gallery (1) sits at width when progress=0.
    // As progress → 1, both translate left by width (camera shifts right).
    const base = index * screenWidth;
    const x = base - shiftProgress.get() * screenWidth;
    return {
      transform: [{ translateX: x }],
    };
  });

  return (
    <Animated.View
      style={[styles.screen, style]}
      className="bg-background"
      pointerEvents={isFocused ? "auto" : "none"}
      accessibilityElementsHidden={!isFocused}
      importantForAccessibility={isFocused ? "yes" : "no-hide-descendants"}
    >
      {descriptor.render()}
    </Animated.View>
  );
}

function renderCameraShiftScreen(screenWidth: number) {
  return (descriptor: TabsDescriptor, { index, isFocused, loaded }: TabsSlotRenderOptions) => {
    // Keep both tabs warm once visited; force-load gallery on first home so
    // the first Home→Gallery pan never mounts mid-transition.
    if (!loaded && !isFocused && index > 0) {
      // Still render after first focus of either tab — parent marks loaded.
    }

    return (
      <CameraShiftScreen
        descriptor={descriptor}
        index={index}
        isFocused={isFocused}
        screenWidth={screenWidth}
      />
    );
  };
}

export default function CameraShiftTabSlot() {
  const { width } = useWindowDimensions();
  const { shiftProgress } = useTabTransition();
  const pathname = usePathname();

  const target = pathname.includes("gallery") ? 1 : 0;

  useEffect(() => {
    shiftProgress.set(withTiming(target, { duration: SHIFT_MS }));
  }, [shiftProgress, target]);

  // Eager-load both routes: detachInactiveScreens=false + always render.
  return (
    <TabSlot
      detachInactiveScreens={false}
      style={styles.slot}
      renderFn={(descriptor, options) => {
        // Ensure both screens render even before first visit (keep-alive).
        const forced = { ...options, loaded: true };
        return renderCameraShiftScreen(width)(descriptor, forced);
      }}
    />
  );
}

const styles = StyleSheet.create({
  slot: {
    flex: 1,
    overflow: "hidden",
  },
  screen: {
    ...StyleSheet.absoluteFill,
  },
});
