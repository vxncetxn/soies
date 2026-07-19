import { Component, type ErrorInfo, type ReactNode } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import type { CalendarEntryPreview as CalendarEntryPreviewModel } from "../data/calendarBrowse";

import { LAYOUT } from "../constants/layout";
import { isPrintArtefact, isUnknownArtefact } from "../data/entries";
import { getArtefactCanvasLayout } from "./artefactLayout";
import { ArtefactPresentationScaleProvider } from "./ArtefactPresentationScale";
import { renderArtefactContent } from "./renderArtefactContent";

const PAPER_MARKER = "#E4DF00";
const PRINT_MARKER = "#F32DD5";
const UNKNOWN_MARKER = "#99938E";
const CARD_BACKGROUND = "#F8F8F8";
const STACK_LIMIT = 5;

type PreviewBoundaryProps = {
  children: ReactNode;
  height: number;
  width: number;
};

class PreviewBoundary extends Component<PreviewBoundaryProps, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("Calendar Entry preview render failure", {
      errorName: error.name,
      componentStack: info.componentStack,
    });
  }

  render() {
    if (this.state.failed) {
      return (
        <View
          style={{ width: this.props.width, height: this.props.height }}
          className="items-center justify-center rounded-sm bg-white"
        >
          <Text className="text-xs text-secondary">Preview unavailable</Text>
        </View>
      );
    }
    return this.props.children;
  }
}

function markerColor(type: string): string {
  if (type === "paper") {
    return PAPER_MARKER;
  }
  if (type === "print") {
    return PRINT_MARKER;
  }
  return UNKNOWN_MARKER;
}

type PreviewStackProps = {
  entry: CalendarEntryPreviewModel;
  cardHeight: number;
  cardWidth: number;
  renderContent: boolean;
};

function PreviewStack({ entry, cardHeight, cardWidth, renderContent }: PreviewStackProps) {
  const artefact = entry.firstArtefact;
  const shape = artefact && isPrintArtefact(artefact) ? "print" : "paper";
  const natural = getArtefactCanvasLayout(0, shape);
  const maxHeight = Math.min(132, cardHeight * 0.7);
  const maxWidth = Math.min(112, cardWidth * 0.6);
  const presentationScale = Math.min(maxHeight / natural.height, maxWidth / natural.width);
  const width = natural.width * presentationScale;
  const height = natural.height * presentationScale;
  const count = Math.max(1, Math.min(STACK_LIMIT, entry.artefactCount || 1));
  const stackWidth = width + (count - 1) * LAYOUT.STACK_OFFSET;

  return (
    <PreviewBoundary key={entry.id} width={width} height={height}>
      <View style={{ width: stackWidth, height }}>
        {Array.from({ length: count - 1 }, (_, index) => {
          const offset = (count - index - 1) * LAYOUT.STACK_OFFSET;
          return (
            <View
              key={index}
              style={[
                styles.placeholder,
                {
                  width,
                  height,
                  transform: [{ translateX: offset }],
                },
              ]}
            />
          );
        })}
        <View style={[styles.artefact, { width, height }]}>
          {renderContent && artefact ? (
            <ArtefactPresentationScaleProvider presentationScale={presentationScale}>
              {renderArtefactContent(artefact)}
            </ArtefactPresentationScaleProvider>
          ) : (
            <View style={StyleSheet.absoluteFill} className="bg-white" />
          )}
        </View>
      </View>
    </PreviewBoundary>
  );
}

type CalendarEntryPreviewProps = {
  entry: CalendarEntryPreviewModel;
  height: number;
  width: number;
  renderContent: boolean;
  onPress: () => void;
};

export default function CalendarEntryPreview({
  entry,
  height,
  width,
  renderContent,
  onPress,
}: CalendarEntryPreviewProps) {
  const artefactLabel =
    entry.artefactCount === 1 ? "1 artefact" : `${entry.artefactCount} artefacts`;
  const unsupported = entry.firstArtefact && isUnknownArtefact(entry.firstArtefact);

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${entry.date}, ${entry.title}, ${entry.type} Entry, ${artefactLabel}`}
      accessibilityHint="Opens this entry on Home"
      style={({ pressed }) => [
        styles.card,
        {
          width,
          height,
          backgroundColor: CARD_BACKGROUND,
          opacity: pressed ? 0.78 : 1,
        },
      ]}
    >
      <View
        pointerEvents="none"
        style={[styles.marker, { backgroundColor: markerColor(entry.type) }]}
      />
      <View pointerEvents="none" style={styles.previewCenter}>
        <PreviewStack
          entry={entry}
          cardHeight={height}
          cardWidth={width}
          renderContent={renderContent}
        />
        {unsupported ? <Text style={styles.unsupportedLabel}>Unsupported</Text> : null}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 16,
    overflow: "hidden",
    position: "relative",
  },
  marker: {
    borderRadius: 8,
    height: 16,
    position: "absolute",
    right: 16,
    top: 16,
    width: 16,
    zIndex: 4,
  },
  previewCenter: {
    alignItems: "center",
    bottom: 0,
    justifyContent: "center",
    left: 0,
    position: "absolute",
    right: 0,
    top: 0,
  },
  placeholder: {
    backgroundColor: "#FFFFFF",
    borderColor: "#E7E5E4",
    borderWidth: StyleSheet.hairlineWidth,
    left: 0,
    position: "absolute",
    shadowColor: "#000000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 2,
    top: 0,
  },
  artefact: {
    left: 0,
    overflow: "hidden",
    position: "absolute",
    shadowColor: "#000000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 2,
    top: 0,
  },
  unsupportedLabel: {
    color: "#79716B",
    fontFamily: "Geist-Regular",
    fontSize: 10,
    marginTop: 4,
  },
});
