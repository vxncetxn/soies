import { PropsWithChildren, useCallback, useEffect, useLayoutEffect, useRef } from "react";
import { BackHandler, Pressable, StyleSheet, useWindowDimensions, View } from "react-native";
import Animated, {
  AnimatedRef,
  interpolate,
  measure,
  runOnJS,
  runOnUI,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  type SharedValue,
} from "react-native-reanimated";
import { Portal } from "react-native-teleport";

const BUTTON_BORDER_RADIUS = 32;
// Slower spring so the shape morph is perceivable (~400ms).
const MORPH_SPRING = { stiffness: 110, damping: 20, mass: 1, overshootClamping: true };
// Panel fades in (transparent -> solid) over the first slice so the button
// cross-fades into the container instead of a foreign white pill appearing.
const PANEL_FADE_END = 0.2;
// Calendar blooms in once the container is solid, so the shape morph is visible.
const CONTENT_BLOOM_START = 0.2;

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
    screenW.value = screenWidth;
    screenH.value = screenHeight;
  }, [screenHeight, screenWidth, screenH, screenW]);

  const finishClose = useCallback(() => {
    onClose?.();
  }, [onClose]);

  const animateOpen = useCallback(() => {
    runOnUI(() => {
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

      progress.value = withSpring(1, MORPH_SPRING);
    })();
  }, [origin, progress, triggerRef]);

  const animateClose = useCallback(() => {
    runOnUI(() => {
      "worklet";
      progress.value = withSpring(0, MORPH_SPRING, (finished) => {
        if (finished) {
          runOnJS(finishClose)();
        }
      });
    })();
  }, [finishClose, progress]);

  // Always mounted (preloaded). Only animate on `open` changes, not on mount.
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

  const panelStyle = useAnimatedStyle(() => {
    const o = origin.value;
    const targetWidth = variant === "fullscreen" ? screenW.value : o.width;
    const targetHeight = variant === "fullscreen" ? screenH.value : o.height * 4;
    const targetX = variant === "fullscreen" ? 0 : o.x;
    const targetY = variant === "fullscreen" ? 0 : o.y + o.height + 8;

    return {
      opacity: solid
        ? interpolate(progress.value, [0, PANEL_FADE_END], [0, 1])
        : interpolate(progress.value, [0, 1], [0.92, 0.98]),
      transform: [
        { translateX: interpolate(progress.value, [0, 1], [o.x, targetX]) },
        { translateY: interpolate(progress.value, [0, 1], [o.y, targetY]) },
        { scaleX: interpolate(progress.value, [0, 1], [o.width / targetWidth, 1]) },
        { scaleY: interpolate(progress.value, [0, 1], [o.height / targetHeight, 1]) },
      ],
      borderRadius: interpolate(progress.value, [0, 1], [BUTTON_BORDER_RADIUS, 0]),
    };
  });

  const contentStyle = useAnimatedStyle(() => ({
    opacity: interpolate(progress.value, [CONTENT_BLOOM_START, 1], [0, 1]),
    transform: [{ scale: interpolate(progress.value, [CONTENT_BLOOM_START, 1], [0.96, 1]) }],
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
          style={[styles.panel, { width: panelWidth, height: panelHeight, backgroundColor }, panelStyle]}
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
