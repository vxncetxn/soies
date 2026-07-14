/**
 * GalleryContext — reload signal for Gallery membership changes.
 *
 * Split from CreateContext the same way `entriesVersion` is: only screens that
 * re-fetch gallery data (Gallery tab, Add sheet featured checks) subscribe, so
 * bumping after add/remove does not re-render Home chrome.
 */
import { createContext, PropsWithChildren, useContext, useState } from "react";

type GalleryVersionContextValue = {
  galleryVersion: number;
  bumpGalleryVersion: () => void;
};

const GalleryVersionContext = createContext<GalleryVersionContextValue | null>(null);

export const GalleryProvider = ({ children }: PropsWithChildren) => {
  const [galleryVersion, setGalleryVersion] = useState(0);
  const bumpGalleryVersion = () => {
    setGalleryVersion((previous) => previous + 1);
  };

  return (
    <GalleryVersionContext.Provider value={{ galleryVersion, bumpGalleryVersion }}>
      {children}
    </GalleryVersionContext.Provider>
  );
};

export const useGalleryVersion = () => {
  const context = useContext(GalleryVersionContext);
  if (!context) {
    throw new Error("useGalleryVersion must be used within GalleryProvider");
  }
  return context;
};
