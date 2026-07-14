/**
 * TabTransitionContext — camera-shift progress between Home (0) and Gallery (1).
 * Content slides; floating chrome stays fixed (ADR-0010).
 */
import { createContext, useContext, type ReactNode } from "react";
import { useSharedValue, type SharedValue } from "react-native-reanimated";

type TabTransitionContextValue = {
  /** 0 = Home, 1 = Gallery. */
  shiftProgress: SharedValue<number>;
};

const TabTransitionContext = createContext<TabTransitionContextValue | null>(null);

export function TabTransitionProvider({ children }: { children: ReactNode }) {
  const shiftProgress = useSharedValue(0);

  return (
    <TabTransitionContext.Provider value={{ shiftProgress }}>
      {children}
    </TabTransitionContext.Provider>
  );
}

export function useTabTransition() {
  const value = useContext(TabTransitionContext);
  if (!value) {
    throw new Error("useTabTransition must be used within TabTransitionProvider");
  }
  return value;
}
