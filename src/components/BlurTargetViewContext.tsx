import { createContext, useContext, type PropsWithChildren, type RefObject } from "react";
import { View } from "react-native";

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
