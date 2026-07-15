import type { ReactNode } from "react";

import type { Entry } from "../data/entries";
import type { FeaturedWidgetSlotIndex } from "../db/repositories/featuredWidgetSlots";

export type FeaturedWidgetsContextValue = {
  /** False on platforms where this milestone intentionally exposes no widget UI. */
  supported: boolean;
  /** Open the entry artefact picker, or the management phase when capacity is full. */
  openPicker: (entry: Entry, initialPage: number) => void;
  /** Open management directly, optionally centred on a deep-linked slot. */
  openFeatured: (slotIndex?: FeaturedWidgetSlotIndex) => void;
};

export type FeaturedWidgetsProviderProps = {
  children: ReactNode;
};
