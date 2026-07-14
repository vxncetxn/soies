/**
 * CollapsedDeck — the collapsed, "stacked cards" representation of an entry.
 *
 * An entry has multiple artefacts (e.g. several pages of a paper, or several
 * photos of a print). In the collapsed state they're shown as a fanned deck:
 * every artefact occupies the *same* frame, but the non-active cards are
 * translated a few pixels (`STACK_OFFSET`) so they peek out from behind the
 * active one. The active card sits on top (highest z-index).
 *
 * The actual per-card animation (translating between the collapsed stack slot
 * and the expanded pager slot, plus scaling) lives in `ArtefactWrapper`. This
 * file just (a) builds the list of wrapped artefacts and (b) renders them inside
 * a single frame that has the right aspect ratio for the entry type.
 *
 * It also exports two reusable pieces:
 *   - `deckClassName` — the Tailwind class string that gives a deck its aspect
 *     ratio + max height (shared by the collapsed deck here and the expanded
 *     frame in `Stack`, so the two states match in size).
 *   - `useWrappedArtefacts` — the hook that builds the array of `ArtefactWrapper`
 *     elements (also reused by `Stack` for the expanded pager, so both states
 *     render the same artefact components driven by the same shared values).
 */
import { ReactNode } from "react";
import Animated, { type AnimatedRef, type SharedValue } from "react-native-reanimated";

import type { Entry } from "../data/entries";

import ArtefactWrapper from "./ArtefactWrapper";
import { renderArtefactContent } from "./renderArtefactContent";

/**
 * Build the className for a deck/frame given the entry type.
 *
 * - `aspect-a4` (papers) or `aspect-print` (prints) sets the card's aspect
 *   ratio.
 * - `max-h-[calc((100vw-80px)/210*297)]` clamps the A4 ratio so a paper never
 *   grows taller than what fits the 40px-gutter width on screen.
 * - `w-[calc(100vw-80px)]` is the collapsed card width (40px gutter each side).
 *
 * This same string is used by `Stack` for the expanded frame so the collapsed
 * and expanded frames share a base size — the expand animation then only has
 * to scale + reposition, not resize from scratch.
 */
export const deckClassName = (type: Entry["type"]) =>
  `${type === "paper" ? "aspect-a4" : "aspect-print"} relative max-h-[calc((100vw-80px)/210*297)] w-[calc(100vw-80px)]`;

type UseWrappedArtefactsParams = {
  entry: Entry;
  // 0 = fully collapsed stack, 1 = fully expanded pager. Drives each
  // ArtefactWrapper's translate/scale interpolation.
  progress: SharedValue<number>;
  // Fractional visible page within the expanded pager (e.g. 1.5 = between
  // pages 1 and 2). Used for the expanded horizontal positioning.
  currentPage: SharedValue<number>;
  // The index of the card that's "on top" in the collapsed stack (the one
  // the user is currently on). Drives the collapsed horizontal offsets.
  activeIndex: SharedValue<number>;
};

/**
 * Build the array of `ArtefactWrapper` elements for an entry's artefacts.
 *
 * For each artefact this picks the right content component (`Paper` for text
 * artefacts, `Print` for image artefacts) and wraps it in an `ArtefactWrapper`
 * that handles the collapsed↔expanded animation. React Compiler handles render
 * caching for unchanged inputs, so this hook can return the mapped elements
 * directly instead of carrying a manual memo wrapper.
 */
export const useWrappedArtefacts = ({
  entry,
  progress,
  currentPage,
  activeIndex,
}: UseWrappedArtefactsParams) => {
  // Curried helper: wrap one artefact's JSX in an ArtefactWrapper with the
  // shared animation values and a stable key.
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

  // Pick the right content component per artefact (by the artefact's own shape,
  // see renderArtefactContent), then wrap each one in an ArtefactWrapper with
  // the shared animation values and a stable key.
  return entry.artefacts.map((artefact, index) =>
    wrapArtefact(index, renderArtefactContent(artefact, index)),
  );
};

type CollapsedDeckProps = {
  entry: Entry;
  progress: SharedValue<number>;
  currentPage: SharedValue<number>;
  activeIndex: SharedValue<number>;
  // Optional ref to the deck's outer view. `Stack` passes its `triggerRef`
  // here so that `FocusOverlay` (the long-press menu) can measure the deck's
  // on-screen frame and animate the overlay from it.
  triggerRef?: AnimatedRef<Animated.View>;
};

/**
 * CollapsedDeck — renders the collapsed deck: a single aspect-correct frame
 * containing all artefacts (each absolutely positioned + animated by its
 * `ArtefactWrapper`). The active card is on top; the others peek behind it.
 *
 * `collapsable={false}` is required so the outer view stays in the native tree
 * and can be measured by `triggerRef` (Android otherwise optimises pure-layout
 * views away, which would make `measure()` return null).
 */
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
