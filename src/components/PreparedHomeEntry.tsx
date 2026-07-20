/**
 * Display-only Entry used while a complete canonical Home Day is prepared.
 *
 * Calendar selection and successful Create Save share this cover. Rendering
 * only the first Artefact keeps the native commit small; white silhouettes
 * retain the one-to-five Stack shape until the canonical interactive Day is
 * ready behind the opaque cover.
 */
import { useEffect } from "react";
import { View } from "react-native";
import Animated, { useSharedValue } from "react-native-reanimated";

import type { Entry } from "../data/entries";

import { isUnknownArtefact } from "../data/entries";
import ArtefactWrapper from "./ArtefactWrapper";
import { deckClassName } from "./CollapsedDeck";
import { Icon } from "./Icon";
import { renderArtefactContent } from "./renderArtefactContent";

type PreparedHomeEntryProps = {
  entry: Entry;
  requestId: number;
  onContentReady: (requestId: number) => void;
};

const PreparedHomeEntry = ({ entry, requestId, onContentReady }: PreparedHomeEntryProps) => {
  const currentPage = useSharedValue(0);
  const activeIndex = useSharedValue(0);
  const firstArtefact = entry.artefacts[0];

  useEffect(() => {
    if (!firstArtefact || isUnknownArtefact(firstArtefact)) {
      onContentReady(requestId);
    }
  }, [firstArtefact, onContentReady, requestId]);

  return (
    <View className="relative">
      <Animated.View collapsable={false} className={deckClassName(entry.type)}>
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
              <View className="h-full w-full bg-paper" />
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

      <View pointerEvents="none" className="absolute -top-12 -right-2 z-[110] rounded-full p-2">
        <Icon name="ellipsis-horizontal" size={20} color="#79716B" />
      </View>
    </View>
  );
};

export default PreparedHomeEntry;
