import { ReactNode, useEffect } from "react";
import { useSharedValue } from "react-native-reanimated";

import type { Entry } from "../data/entries";

import ArtefactWrapper from "./ArtefactWrapper";
import Paper from "./Paper";
import Print from "./Print";

type CollapsedDeckProps = {
  entry: Entry;
  activePage: number;
};

export function collapsedDeckContainerClass(type: Entry["type"]) {
  return `${type === "paper" ? "aspect-a4" : "aspect-print"} relative max-h-[calc((100vw-80px)/210*297)] w-[calc(100vw-80px)]`;
}

const CollapsedDeck = ({ entry, activePage }: CollapsedDeckProps) => {
  const progress = useSharedValue(0);
  const currentPage = useSharedValue(activePage);
  const activeIndex = useSharedValue(activePage);

  useEffect(() => {
    currentPage.value = activePage;
    activeIndex.value = activePage;
  }, [activeIndex, activePage, currentPage]);

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

  const wrappedArtefacts =
    entry.type === "paper"
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

  return <>{wrappedArtefacts}</>;
};

export default CollapsedDeck;
