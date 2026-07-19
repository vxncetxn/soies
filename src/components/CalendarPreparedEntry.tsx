/**
 * Display-only Entry used during Calendar-to-Home navigation.
 *
 * The transition needs the selected Entry's visible face, not another
 * interactive Home pager. Rendering only the first Artefact keeps the native
 * commit small; plain white silhouettes retain the one-to-five Stack shape
 * until the canonical interactive Entry is ready behind this cover.
 */
import { View } from "react-native";
import Animated, { useSharedValue } from "react-native-reanimated";

import type { Entry } from "../data/entries";

import ArtefactWrapper from "./ArtefactWrapper";
import { deckClassName } from "./CollapsedDeck";
import { Icon } from "./Icon";
import { renderArtefactContent } from "./renderArtefactContent";

type CalendarPreparedEntryProps = {
  entry: Entry;
};

const CalendarPreparedEntry = ({ entry }: CalendarPreparedEntryProps) => {
  const progress = useSharedValue(0);
  const currentPage = useSharedValue(0);
  const activeIndex = useSharedValue(0);
  const firstArtefact = entry.artefacts[0];

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
              progress={progress}
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
            progress={progress}
            currentPage={currentPage}
            activeIndex={activeIndex}
          >
            {renderArtefactContent(firstArtefact, firstArtefact.id)}
          </ArtefactWrapper>
        ) : null}
      </Animated.View>

      <View pointerEvents="none" className="absolute -top-12 -right-2 z-[110] rounded-full p-2">
        <Icon name="ellipsis-horizontal" size={20} color="#79716B" />
      </View>
    </View>
  );
};

export default CalendarPreparedEntry;
