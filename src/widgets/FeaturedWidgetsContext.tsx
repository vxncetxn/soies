/** Android/web fallback: the feature is deliberately invisible for this milestone. */
import { createContext, useContext } from "react";

import type {
  FeaturedWidgetsContextValue,
  FeaturedWidgetsProviderProps,
} from "./FeaturedWidgetsContext.types";

const unsupportedValue: FeaturedWidgetsContextValue = {
  supported: false,
  openPicker: () => {},
  openFeatured: () => {},
};

const FeaturedWidgetsContext = createContext(unsupportedValue);

export function useFeaturedWidgets(): FeaturedWidgetsContextValue {
  return useContext(FeaturedWidgetsContext);
}

export function FeaturedWidgetsProvider({ children }: FeaturedWidgetsProviderProps) {
  return (
    <FeaturedWidgetsContext.Provider value={unsupportedValue}>
      {children}
    </FeaturedWidgetsContext.Provider>
  );
}
