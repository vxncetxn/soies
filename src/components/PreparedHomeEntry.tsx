/**
 * Display-only Entry used while a complete canonical Home Day is prepared.
 *
 * Calendar selection and successful Create Save share this cover. Rendering
 * only the first Artefact keeps the native commit small; white silhouettes
 * retain the one-to-five Stack shape until the canonical interactive Day is
 * ready behind the opaque cover.
 */
import { useEffect } from "react";
import { useWindowDimensions, View } from "react-native";
import Animated, { useSharedValue } from "react-native-reanimated";
import { StyleSheet, withUnistyles } from "react-native-unistyles";

import type { Entry } from "../data/entries";

import { isUnknownArtefact } from "../data/entries";
import { fixedTokens } from "../styles/tokens";
import ArtefactWrapper from "./ArtefactWrapper";
import { deckStyles } from "./CollapsedDeck";
import { Icon } from "./Icon";
import { renderArtefactContent } from "./renderArtefactContent";

const ThemedIcon = withUnistyles(Icon, (theme) => ({
  color: theme.colors.icon.default,
}));

type PreparedHomeEntryProps = {
  entry: Entry;
  requestId: number;
  onContentReady: (requestId: number) => void;
};

const PreparedHomeEntry = ({ entry, requestId, onContentReady }: PreparedHomeEntryProps) => {
  const currentPage = useSharedValue(0);
  const activeIndex = useSharedValue(0);
  const window = useWindowDimensions();
  const firstArtefact = entry.artefacts[0];

  useEffect(() => {
    if (!firstArtefact || isUnknownArtefact(firstArtefact)) {
      onContentReady(requestId);
    }
  }, [firstArtefact, onContentReady, requestId]);

  return (
    <View style={styles.root}>
      <Animated.View collapsable={false} style={deckStyles.deck(entry.type, window.width)}>
        {entry.artefacts.slice(1).map((artefact, offset) => {
          const index = offset + 1;
          return (
            <ArtefactWrapper
              key={artefact.id}
              type={entry.type}
              index={index}
              expanded={false}
              activePage={0}
              currentPage={currentPage}
              activeIndex={activeIndex}
            >
              <View style={styles.silhouette} />
            </ArtefactWrapper>
          );
        })}

        {firstArtefact ? (
          <ArtefactWrapper
            key={firstArtefact.id}
            type={entry.type}
            index={0}
            expanded={false}
            activePage={0}
            currentPage={currentPage}
            activeIndex={activeIndex}
          >
            {renderArtefactContent(firstArtefact, firstArtefact.id, {
              paperContentReadinessRequestId: requestId,
              onPaperContentReady: onContentReady,
              printContentReadinessRequestId: requestId,
              onPrintContentReady: onContentReady,
            })}
          </ArtefactWrapper>
        ) : null}
      </Animated.View>

      <View pointerEvents="none" style={styles.optionsButton}>
        <ThemedIcon name="ellipsis-horizontal" size={20} />
      </View>
    </View>
  );
};

export default PreparedHomeEntry;

const styles = StyleSheet.create({
  optionsButton: {
    borderRadius: 999,
    padding: 8,
    position: "absolute",
    right: -8,
    top: -48,
    zIndex: 110,
  },
  root: {
    position: "relative",
  },
  silhouette: {
    backgroundColor: fixedTokens.artefact.paperSurface,
    height: "100%",
    width: "100%",
  },
});
