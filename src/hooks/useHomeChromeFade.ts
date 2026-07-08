import { interpolate, useAnimatedStyle } from "react-native-reanimated";

import { useCreateContext } from "../components/CreateContext";
import { useExpandContext } from "../components/ExpandContext";
import { CHROME_FADE_END, CREATE_HOME_EXIT_END } from "../constants/animation";

/** Combined chrome + create fade for Home header, tab bar, and create button. */
export function useHomeChromeFade() {
  const { chromeProgress } = useExpandContext();
  const { createProgress } = useCreateContext();

  return useAnimatedStyle(() => {
    const chromeOpacity = interpolate(chromeProgress.value, [0, CHROME_FADE_END], [1, 0], "clamp");
    const createOpacity = interpolate(
      createProgress.value,
      [0, CREATE_HOME_EXIT_END],
      [1, 0],
      "clamp",
    );

    return {
      opacity: chromeOpacity * createOpacity,
    };
  });
}
