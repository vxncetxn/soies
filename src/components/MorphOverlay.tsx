/**
 * MorphOverlay — legacy measure-and-morph overlay (superseded by BloomPanel /
 * FocusOverlay for active calendar and focus flows).
 *
 * EXCEPTION (React Compiler / Worklets closure): this file is intentionally
 * left unchanged and has **no callsite** under `src/` (`rg "MorphOverlay" src`
 * finds only this definition). It still uses `scheduleOnRN(finishClose, onClose)`
 * — a function-valued Worklets argument that is unsafe after React Compiler
 * rerenders. Do not wire a callsite without first applying the BloomPanel
 * pattern (stable dispatcher + primitive sequence, RN effect → callback ref).
 */
import { PropsWithChildren, useEffect, useLayoutEffect, useRef } from "react";
import { BackHandler, Pressable, StyleSheet, useWindowDimensions, View } from "react-native";
import Animated, {
  type AnimatedRef,
  interpolate,
  measure,
  type SharedValue,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from "react-native-reanimated";
import { Portal } from "react-native-teleport";
import { scheduleOnRN, scheduleOnUI } from "react-native-worklets";

const BUTTON_BORDER_RADIUS = 32;
// Slower spring so the shape morph is perceivable (~400ms).
const MORPH_SPRING = { stiffness: 110, damping: 20, mass: 1, overshootClamping: true };
// Panel fades in (transparent -> solid) over the first slice so the button
// cross-fades into the container instead of a foreign white pill appearing.
const PANEL_FADE_END = 0.2;
// Calendar blooms in once the container is solid, so the shape morph is visible.
const CONTENT_BLOOM_START = 0.2;

type MorphOrigin = { x: number; y: number; width: number; height: number };

const finishClose = (onClose?: () => void) => {
  onClose?.();
};

const animateOpen = ({
  triggerRef,
  origin,
  progress,
}: {
  triggerRef: AnimatedRef<Animated.View>;
  origin: SharedValue<MorphOrigin>;
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

    progress.set(withSpring(1, MORPH_SPRING));
  });
};

const animateClose = ({
  progress,
  onClose,
}: {
  progress: SharedValue<number>;
  onClose?: () => void;
}) => {
  scheduleOnUI(() => {
    "worklet";
    progress.set(
      withSpring(0, MORPH_SPRING, (finished) => {
        if (finished) {
          scheduleOnRN(finishClose, onClose);
        }
      }),
    );
  });
};

type MorphOverlayProps = PropsWithChildren<{
  triggerRef: AnimatedRef<Animated.View>;
  open: boolean;
  onRequestClose: () => void;
  onClose?: () => void;
  progress?: SharedValue<number>;
  variant?: "fullscreen" | "menu";
  solid?: boolean;
  backdrop?: boolean;
  backgroundColor?: string;
}>;

const MorphOverlay = ({
  triggerRef,
  open,
  onRequestClose,
  onClose,
  children,
  progress: progressProp,
  variant = "fullscreen",
  solid = true,
  backdrop = false,
  backgroundColor = "#FFFFFF",
}: MorphOverlayProps) => {
  const { width: screenWidth, height: screenHeight } = useWindowDimensions();

  const internalProgress = useSharedValue(0);
  const progress = progressProp ?? internalProgress;
  const origin = useSharedValue({ x: 0, y: 0, width: 1, height: 1 });
  const screenW = useSharedValue(screenWidth);
  const screenH = useSharedValue(screenHeight);
  const isFirstRun = useRef(true);

  useEffect(() => {
    screenW.set(screenWidth);
    screenH.set(screenHeight);
  }, [screenHeight, screenWidth, screenH, screenW]);

  // Always mounted (preloaded). Only animate on `open` changes, not on mount.
  useLayoutEffect(() => {
    if (isFirstRun.current) {
      isFirstRun.current = false;
      return;
    }

    if (open) {
      animateOpen({ triggerRef, origin, progress });
      return;
    }

    animateClose({ progress, onClose });
  }, [onClose, open, origin, progress, triggerRef]);

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

  const panelStyle = useAnimatedStyle(() => {
    const o = origin.get();
    const targetWidth = variant === "fullscreen" ? screenW.get() : o.width;
    const targetHeight = variant === "fullscreen" ? screenH.get() : o.height * 4;
    const targetX = variant === "fullscreen" ? 0 : o.x;
    const targetY = variant === "fullscreen" ? 0 : o.y + o.height + 8;

    return {
      opacity: solid
        ? interpolate(progress.get(), [0, PANEL_FADE_END], [0, 1])
        : interpolate(progress.get(), [0, 1], [0.92, 0.98]),
      transform: [
        { translateX: interpolate(progress.get(), [0, 1], [o.x, targetX]) },
        { translateY: interpolate(progress.get(), [0, 1], [o.y, targetY]) },
        { scaleX: interpolate(progress.get(), [0, 1], [o.width / targetWidth, 1]) },
        { scaleY: interpolate(progress.get(), [0, 1], [o.height / targetHeight, 1]) },
      ],
      borderRadius: interpolate(progress.get(), [0, 1], [BUTTON_BORDER_RADIUS, 0]),
    };
  });

  const contentStyle = useAnimatedStyle(() => ({
    opacity: interpolate(progress.get(), [CONTENT_BLOOM_START, 1], [0, 1]),
    transform: [{ scale: interpolate(progress.get(), [CONTENT_BLOOM_START, 1], [0.96, 1]) }],
  }));

  const panelWidth = variant === "fullscreen" ? screenWidth : screenWidth * 0.88;
  const panelHeight = variant === "fullscreen" ? screenHeight : screenHeight * 0.5;

  return (
    <Portal hostName="morph">
      <View style={styles.root} pointerEvents={open ? "auto" : "none"}>
        {backdrop && variant === "menu" && (
          <Pressable
            style={styles.backdrop}
            onPress={onRequestClose}
            accessibilityRole="button"
            accessibilityLabel="Close menu"
          />
        )}

        <Animated.View
          style={[
            styles.panel,
            { width: panelWidth, height: panelHeight, backgroundColor },
            panelStyle,
          ]}
          pointerEvents="auto"
        >
          {/* Children are always mounted (preloaded) so opening never re-renders them. */}
          <Animated.View style={[styles.content, contentStyle]}>{children}</Animated.View>
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
    backgroundColor: "rgba(0, 0, 0, 0.35)",
  },
  panel: {
    position: "absolute",
    top: 0,
    left: 0,
    overflow: "hidden",
    transformOrigin: "top left",
  },
  content: {
    flex: 1,
  },
});

export default MorphOverlay;
