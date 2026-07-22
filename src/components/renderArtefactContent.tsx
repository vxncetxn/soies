/**
 * Shared per-artefact content renderer (Paper / Print / unknown placeholder).
 * Used by CollapsedDeck, ArtefactFrame, and capture/picker surfaces.
 */
import { ReactNode } from "react";
import { Text, View } from "react-native";
import { StyleSheet } from "react-native-unistyles";

import type { Artefact } from "../data/entries";

import { isPrintArtefact, isUnknownArtefact } from "../data/entries";
import Paper from "./Paper";
import Print from "./Print";

type RenderArtefactContentOptions = {
  paperContentReadinessRequestId?: number | null;
  onPaperContentReady?: (requestId: number) => void;
  printContentReadinessRequestId?: number | null;
  onPrintContentReady?: (requestId: number) => void;
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
        imageReadinessRequestId={options?.printContentReadinessRequestId}
        onImageReady={options?.onPrintContentReady}
      >
        {artefact.text}
      </Print>
    );
  }

  if (isUnknownArtefact(artefact)) {
    return (
      <View key={key} style={styles.unsupportedContainer}>
        <Text style={styles.unsupportedText}>Unsupported artefact</Text>
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

const styles = StyleSheet.create((theme) => ({
  unsupportedContainer: {
    alignItems: "center",
    backgroundColor: theme.colors.surface.elevated,
    flex: 1,
    height: "100%",
    justifyContent: "center",
    padding: 16,
    width: "100%",
  },
  unsupportedText: {
    ...theme.typography.ui.body,
    color: theme.colors.content.primary,
    textAlign: "center",
  },
}));
