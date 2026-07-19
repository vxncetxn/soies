import { interpolate, useAnimatedStyle } from "react-native-reanimated";

import { useExpandContext } from "../components/ExpandContext";
import { CHROME_FADE_END } from "../constants/animation";

/** Stack-expansion opacity; Entry navigation owns its separate Ease wrapper. */
export function useHomeChromeFade() {
  const { chromeProgress } = useExpandContext();

  return useAnimatedStyle(() => {
    const chromeOpacity = interpolate(chromeProgress.get(), [0, CHROME_FADE_END], [1, 0], "clamp");

    return {
      opacity: chromeOpacity,
    };
  });
}
