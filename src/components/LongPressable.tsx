import { forwardRef, type ComponentRef } from "react";
import { Pressable, type PressableProps } from "react-native";

import { LONG_PRESS_MIN_DURATION_MS } from "../constants/interaction";
import { triggerLongPressHaptic } from "../utils/haptics";

type LongPressableProps = PressableProps;

const LongPressable = forwardRef<ComponentRef<typeof Pressable>, LongPressableProps>(
  ({ onLongPress, delayLongPress = LONG_PRESS_MIN_DURATION_MS, ...props }, ref) => {
    const handleLongPress: NonNullable<PressableProps["onLongPress"]> = (event) => {
      triggerLongPressHaptic();
      onLongPress?.(event);
    };

    return (
      <Pressable
        ref={ref}
        delayLongPress={delayLongPress}
        onLongPress={handleLongPress}
        {...props}
      />
    );
  },
);

LongPressable.displayName = "LongPressable";

export default LongPressable;
