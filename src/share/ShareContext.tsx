/**
 * ShareContext — opens the Share sheet from Focus with an entry + initial page.
 * Focus fully closes before the sheet presents (controlled by the caller).
 */
import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";

import type { Entry } from "../data/entries";

import { ShareCaptureHost } from "./ShareCaptureHost";
import { ShareSheet } from "./ShareSheet";

type ShareSession = {
  entry: Entry;
  initialPage: number;
};

type ShareContextValue = {
  openShare: (entry: Entry, initialPage: number) => void;
  closeShare: () => void;
};

const ShareContext = createContext<ShareContextValue | null>(null);

export function useShare() {
  const value = useContext(ShareContext);
  if (!value) {
    throw new Error("useShare must be used within ShareProvider");
  }
  return value;
}

export function ShareProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<ShareSession | null>(null);

  const openShare = useCallback((entry: Entry, initialPage: number) => {
    setSession({ entry, initialPage });
  }, []);

  const closeShare = useCallback(() => {
    setSession(null);
  }, []);

  const value = useMemo(() => ({ openShare, closeShare }), [openShare, closeShare]);

  return (
    <ShareContext.Provider value={value}>
      <ShareCaptureHost cacheScope={session?.entry ?? null}>
        {children}
        <ShareSheet
          entry={session?.entry ?? null}
          initialPage={session?.initialPage ?? 0}
          open={session !== null}
          onClose={closeShare}
        />
      </ShareCaptureHost>
    </ShareContext.Provider>
  );
}
