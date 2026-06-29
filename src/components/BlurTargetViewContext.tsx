import { createContext, PropsWithChildren, RefObject, useContext } from "react";
import { View } from "react-native";

type BlurTargetViewContextValue = {
  blurTargetRef: RefObject<View | null>;
};

const BlurTargetViewContext = createContext<BlurTargetViewContextValue | null>(null);

export function BlurTargetViewProvider({
  blurTargetRef,
  children,
}: PropsWithChildren<{ blurTargetRef: RefObject<View | null> }>) {
  return (
    <BlurTargetViewContext.Provider value={{ blurTargetRef }}>
      {children}
    </BlurTargetViewContext.Provider>
  );
}

export function useBlurTargetRef() {
  const context = useContext(BlurTargetViewContext);

  if (!context) {
    throw new Error("useBlurTargetRef must be used within BlurTargetViewProvider");
  }

  return context.blurTargetRef;
}
