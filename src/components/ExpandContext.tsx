import { createContext, PropsWithChildren, useContext } from "react";
import { useSharedValue, type SharedValue } from "react-native-reanimated";

type ExpandContextValue = {
  chromeProgress: SharedValue<number>;
};

const ExpandContext = createContext<ExpandContextValue | null>(null);

export const ExpandProvider = ({ children }: PropsWithChildren) => {
  const chromeProgress = useSharedValue(0);

  return <ExpandContext.Provider value={{ chromeProgress }}>{children}</ExpandContext.Provider>;
};

export const useExpandContext = () => {
  const context = useContext(ExpandContext);

  if (!context) {
    throw new Error("useExpandContext must be used within ExpandProvider");
  }

  return context;
};
