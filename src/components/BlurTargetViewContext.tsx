import { createContext, useContext, type PropsWithChildren, type RefObject } from "react";
import { Platform, View } from "react-native";

const BlurTargetViewContext = createContext<RefObject<View | null> | null>(null);

type BlurTargetViewProviderProps = PropsWithChildren<{
  blurTargetRef: RefObject<View | null>;
}>;

export const BlurTargetViewProvider = ({
  blurTargetRef,
  children,
}: BlurTargetViewProviderProps) => {
  return (
    <BlurTargetViewContext.Provider value={blurTargetRef}>
      {children}
    </BlurTargetViewContext.Provider>
  );
};

export const useBlurTargetRef = () => {
  const blurTargetRef = useContext(BlurTargetViewContext);

  if (!blurTargetRef) {
    throw new Error("useBlurTargetRef must be used within BlurTargetViewProvider");
  }

  return blurTargetRef;
};

/**
 * `expo-blur`'s `blurTarget` / `blurMethod` are Android-only. Passing a target
 * on iOS still runs `findNodeHandle` inside BlurView, which StrictMode reports
 * as deprecated. Omit the props off Android so calendar/focus/create blurs stay
 * quiet under StrictMode without changing the iOS visual path (UIVisualEffect).
 */
export const useAndroidBlurTargetProps = (
  blurMethod: "dimezisBlurView" | "dimezisBlurViewSdk31Plus" = "dimezisBlurViewSdk31Plus",
) => {
  const blurTargetRef = useBlurTargetRef();

  if (Platform.OS !== "android") {
    return {};
  }

  return { blurTarget: blurTargetRef, blurMethod };
};
