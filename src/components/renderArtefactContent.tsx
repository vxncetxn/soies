/**
 * Shared per-artefact content renderer (Paper / Print / unknown placeholder).
 * Used by CollapsedDeck, ArtefactFrame, and capture/picker surfaces.
 */
import { ReactNode } from "react";
import { Text, View } from "react-native";

import type { Artefact } from "../data/entries";

import { isPrintArtefact, isUnknownArtefact } from "../data/entries";
import Paper from "./Paper";
import Print from "./Print";

type RenderArtefactContentOptions = {
  paperContentReadinessRequestId?: number | null;
  onPaperContentReady?: (requestId: number) => void;
  onPrintContentReady?: () => void;
};

export function renderArtefactContent(
  artefact: Artefact,
  key?: string | number,
  options?: RenderArtefactContentOptions,
): ReactNode {
  if (isPrintArtefact(artefact)) {
    return (
      <Print
        key={key}
        imagePath={artefact.imagePath}
        inkOverlayPath={artefact.inkOverlayPath}
        onImageDisplay={options?.onPrintContentReady}
        onImageError={options?.onPrintContentReady}
      >
        {artefact.text}
      </Print>
    );
  }

  if (isUnknownArtefact(artefact)) {
    return (
      <View key={key} className="flex h-full w-full items-center justify-center bg-paper p-4">
        <Text className="text-center text-primary">Unsupported artefact</Text>
      </View>
    );
  }

  return (
    <Paper
      key={key}
      document={artefact}
      inkOverlayPath={artefact.inkOverlayPath}
      textReadinessRequestId={options?.paperContentReadinessRequestId}
      onTextDisplay={options?.onPaperContentReady}
    />
  );
}
