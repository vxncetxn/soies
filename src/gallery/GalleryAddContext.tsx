/**
 * GalleryAddContext — opens the Add-to-Gallery sheet after Focus settles.
 * Mirrors ShareContext: Focus fully closes before the sheet presents.
 */
import { createContext, useContext, useRef, useState, type ReactNode } from "react";

import type { Entry } from "../data/entries";

import { GalleryAddSheet } from "./GalleryAddSheet";

type GalleryAddSession = {
  id: number;
  entry: Entry;
  initialPage: number;
  open: boolean;
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
  const nextSessionIdRef = useRef(1);

  const openGalleryAdd = (entry: Entry, initialPage: number) => {
    const id = nextSessionIdRef.current;
    nextSessionIdRef.current += 1;
    setSession({ id, entry, initialPage, open: true });
  };

  const closeGalleryAdd = () => {
    setSession((current) => (current ? { ...current, open: false } : null));
  };

  // Native settle can arrive after another session has opened. Mutate only the
  // session that owned the callback so an old sheet cannot close the new one.
  const closeSession = (sessionId: number) => {
    setSession((current) => (current?.id === sessionId ? { ...current, open: false } : current));
  };

  const clearSession = (sessionId: number) => {
    setSession((current) => (current?.id === sessionId ? null : current));
  };

  return (
    <GalleryAddContext.Provider value={{ openGalleryAdd, closeGalleryAdd }}>
      {children}
      {session ? (
        <GalleryAddSheet
          key={session.id}
          entry={session.entry}
          initialPage={session.initialPage}
          open={session.open}
          onClose={() => closeSession(session.id)}
          onClosed={() => clearSession(session.id)}
        />
      ) : null}
    </GalleryAddContext.Provider>
  );
}
