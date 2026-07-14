/**
 * GalleryAddContext — opens the Add-to-Gallery sheet after Focus settles.
 * Mirrors ShareContext: Focus fully closes before the sheet presents.
 */
import { createContext, useContext, useState, type ReactNode } from "react";

import type { Entry } from "../data/entries";

import { GalleryAddSheet } from "./GalleryAddSheet";

type GalleryAddSession = {
  entry: Entry;
  initialPage: number;
};

type GalleryAddContextValue = {
  openGalleryAdd: (entry: Entry, initialPage: number) => void;
  closeGalleryAdd: () => void;
};

const GalleryAddContext = createContext<GalleryAddContextValue | null>(null);

export function useGalleryAdd() {
  const value = useContext(GalleryAddContext);
  if (!value) {
    throw new Error("useGalleryAdd must be used within GalleryAddProvider");
  }
  return value;
}

export function GalleryAddProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<GalleryAddSession | null>(null);

  const openGalleryAdd = (entry: Entry, initialPage: number) => {
    setSession({ entry, initialPage });
  };

  const closeGalleryAdd = () => {
    setSession(null);
  };

  return (
    <GalleryAddContext.Provider value={{ openGalleryAdd, closeGalleryAdd }}>
      {children}
      <GalleryAddSheet
        entry={session?.entry ?? null}
        initialPage={session?.initialPage ?? 0}
        open={session !== null}
        onClose={closeGalleryAdd}
      />
    </GalleryAddContext.Provider>
  );
}
