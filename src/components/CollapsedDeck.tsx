import { ReactNode, useMemo } from "react";
import Animated, { type AnimatedRef, type SharedValue } from "react-native-reanimated";

import type { Entry } from "../data/entries";

import ArtefactWrapper from "./ArtefactWrapper";
import Paper from "./Paper";
import Print from "./Print";

export const deckClassName = (type: Entry["type"]) =>
  `${type === "paper" ? "aspect-a4" : "aspect-print"} relative max-h-[calc((100vw-80px)/210*297)] w-[calc(100vw-80px)]`;

type UseWrappedArtefactsParams = {
  entry: Entry;
  progress: SharedValue<number>;
  currentPage: SharedValue<number>;
  activeIndex: SharedValue<number>;
};

export const useWrappedArtefacts = ({
  entry,
  progress,
  currentPage,
  activeIndex,
}: UseWrappedArtefactsParams) => {
  return useMemo(() => {
    const wrapArtefact = (index: number, artefact: ReactNode) => (
      <ArtefactWrapper
        type={entry.type}
        key={index}
        index={index}
        progress={progress}
        currentPage={currentPage}
        activeIndex={activeIndex}
      >
        {artefact}
      </ArtefactWrapper>
    );

    return entry.type === "paper"
      ? entry.artefacts.map((artefact, index) =>
          wrapArtefact(index, <Paper key={index}>{artefact.text}</Paper>),
        )
      : entry.artefacts.map((artefact, index) =>
          wrapArtefact(
            index,
            <Print key={index} img={artefact.img}>
              {artefact.text}
            </Print>,
          ),
        );
  }, [activeIndex, currentPage, entry, progress]);
};

type CollapsedDeckProps = {
  entry: Entry;
  progress: SharedValue<number>;
  currentPage: SharedValue<number>;
  activeIndex: SharedValue<number>;
  triggerRef?: AnimatedRef<Animated.View>;
};

const CollapsedDeck = ({
  entry,
  progress,
  currentPage,
  activeIndex,
  triggerRef,
}: CollapsedDeckProps) => {
  const wrappedArtefacts = useWrappedArtefacts({ entry, progress, currentPage, activeIndex });

  return (
    <Animated.View ref={triggerRef} collapsable={false} className={deckClassName(entry.type)}>
      {wrappedArtefacts}
    </Animated.View>
  );
};

export default CollapsedDeck;
