import { useCallback, useEffect, useLayoutEffect, useRef } from "react";
import { useWindowDimensions } from "react-native";
import Animated, {
  AnimatedRef,
  measure,
  useSharedValue,
  withSpring,
  type SharedValue,
} from "react-native-reanimated";
import { scheduleOnRN, scheduleOnUI } from "react-native-worklets";

import { MORPH_SPRING } from "../constants/animation";

type UseMorphFromTriggerOptions = {
  triggerRef: AnimatedRef<Animated.View>;
  open: boolean;
  onClose?: () => void;
  progress?: SharedValue<number>;
  spring?: typeof MORPH_SPRING;
};

export function useMorphFromTrigger({
  triggerRef,
  open,
  onClose,
  progress: progressProp,
  spring = MORPH_SPRING,
}: UseMorphFromTriggerOptions) {
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

      progress.value = withSpring(1, spring);
    });
  }, [origin, progress, spring, triggerRef]);

  const animateClose = useCallback(() => {
    scheduleOnUI(() => {
      "worklet";
      progress.value = withSpring(0, spring, (finished) => {
        if (finished) {
          scheduleOnRN(finishClose);
        }
      });
    });
  }, [finishClose, progress, spring]);

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

  return { progress, origin, screenW, screenH };
}
