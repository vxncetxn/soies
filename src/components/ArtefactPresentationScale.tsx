/**
 * ArtefactPresentationScale — display-only raster scale shared by Paper and Print.
 *
 * Stack owns the eventual expanded size and provides it before either renderer
 * mounts. Paper/Print then allocate native text, image and Ink geometry at that
 * size while their canonical layout remains unchanged. Capture/frame consumers
 * omit the provider and receive the canonical scale of one.
 */
import { createContext, type ReactNode, useContext } from "react";

import { clampArtefactTextPresentationScale } from "./artefactTextStyle";

/** Stack-owned raster multiplier; capture hosts deliberately inherit canonical one. */
const ArtefactPresentationScaleContext = createContext(1);

type ArtefactPresentationScaleProviderProps = {
  /** Ratio from the artefact's canonical width to its allocated native width. */
  presentationScale: number;
  /** Paper or Print renderer whose text, image and Ink share this allocation. */
  children: ReactNode;
};

/** Supplies the one display-only scale shared by text, image and Ink descendants. */
export function ArtefactPresentationScaleProvider({
  presentationScale,
  children,
}: ArtefactPresentationScaleProviderProps) {
  return (
    <ArtefactPresentationScaleContext value={clampArtefactTextPresentationScale(presentationScale)}>
      {children}
    </ArtefactPresentationScaleContext>
  );
}

/** Read the nearest presentation host; canonical output defaults to one. */
export function useArtefactPresentationScale(): number {
  return useContext(ArtefactPresentationScaleContext);
}
