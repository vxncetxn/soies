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
 *   - `deckStyles` — the Unistyles geometry that gives a deck its aspect
 *     ratio + max height (shared by the collapsed deck here and the expanded
 *     frame in `Stack`, so the two states match in size).
 *   - `useWrappedArtefacts` — the hook that builds a canonical or portal copy
 *     of the wrapped artefacts from the same phase and pager inputs.
 */
import { useWindowDimensions } from "react-native";
import Animated, { type AnimatedRef, type SharedValue } from "react-native-reanimated";
import { StyleSheet } from "react-native-unistyles";

import type { Entry } from "../data/entries";

import ArtefactWrapper from "./ArtefactWrapper";
import { renderArtefactContent } from "./renderArtefactContent";

/**
 * Build the style for a deck/frame given the entry type and viewport width.
 *
 * - `aspect-a4` (papers) or `aspect-print` (prints) sets the card's aspect
 *   ratio.
 * - `max-h-[calc((100vw-80px)/210*297)]` clamps the A4 ratio so a paper never
 *   grows taller than what fits the 40px-gutter width on screen.
 * - `w-[calc(100vw-80px)]` is the collapsed card width (40px gutter each side).
 *
 * This same string is used by `Stack` for the retained portal frame so the
 * canonical and portal trees share the same base coordinate system.
 */
export const deckStyles = StyleSheet.create({
  deck: (type: Entry["type"], viewportWidth: number) => {
    const width = Math.max(0, viewportWidth - 80);

    return {
      aspectRatio: type === "paper" ? 210 / 297 : 53 / 86,
      maxHeight: (width / 210) * 297,
      position: "relative",
      width,
    };
  },
});

type UseWrappedArtefactsParams = {
  entry: Entry;
  /** Discrete Stack presentation endpoint owned by Ease. */
  expanded: boolean;
  /** Frozen page used by every card's collapsed endpoint. */
  activePage: number;
  // Fractional visible page within the expanded pager (e.g. 1.5 = between
  // pages 1 and 2). Used for the expanded horizontal positioning.
  currentPage: SharedValue<number>;
  // The index of the card that's "on top" in the collapsed stack (the one
  // the user is currently on). Drives the collapsed horizontal offsets.
  activeIndex: SharedValue<number>;
  /** Entry-transition request targeting this Entry's first Artefact. */
  firstArtefactReadinessRequestId?: number | null;
  /** Canonical first-Artefact readiness used by Calendar and Save handoffs. */
  onFirstArtefactReady?: (requestId: number) => void;
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
  expanded,
  activePage,
  currentPage,
  activeIndex,
  firstArtefactReadinessRequestId,
  onFirstArtefactReady,
}: UseWrappedArtefactsParams) => {
  // Pick the right content component per artefact (by the artefact's own shape,
  // see renderArtefactContent), then wrap each one in an ArtefactWrapper with
  // the shared animation values. Durable Artefact identity is essential here:
  // Calendar navigation updates the DayPager in place, and reusing an index-keyed
  // native TextKit view for another Paper can leave its old backing layer attached.
  return entry.artefacts.map((artefact, index) => (
    <ArtefactWrapper
      type={entry.type}
      key={artefact.id}
      index={index}
      expanded={expanded}
      activePage={activePage}
      currentPage={currentPage}
      activeIndex={activeIndex}
    >
      {renderArtefactContent(
        artefact,
        artefact.id,
        index === 0
          ? {
              paperContentReadinessRequestId: firstArtefactReadinessRequestId,
              onPaperContentReady: onFirstArtefactReady,
              printContentReadinessRequestId: firstArtefactReadinessRequestId,
              onPrintContentReady: onFirstArtefactReady,
            }
          : undefined,
      )}
    </ArtefactWrapper>
  ));
};

type CollapsedDeckProps = {
  entry: Entry;
  expanded?: boolean;
  activePage: number;
  currentPage: SharedValue<number>;
  activeIndex: SharedValue<number>;
  // Optional ref to the deck's outer view. `Stack` passes its `triggerRef`
  // here so that `FocusOverlay` (the long-press menu) can measure the deck's
  // on-screen frame and animate the overlay from it.
  triggerRef?: AnimatedRef<Animated.View>;
  firstArtefactReadinessRequestId?: number | null;
  onFirstArtefactReady?: (requestId: number) => void;
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
  expanded = false,
  activePage,
  currentPage,
  activeIndex,
  triggerRef,
  firstArtefactReadinessRequestId,
  onFirstArtefactReady,
}: CollapsedDeckProps) => {
  const window = useWindowDimensions();
  const wrappedArtefacts = useWrappedArtefacts({
    entry,
    expanded,
    activePage,
    currentPage,
    activeIndex,
    firstArtefactReadinessRequestId,
    onFirstArtefactReady,
  });

  return (
    <Animated.View
      ref={triggerRef}
      collapsable={false}
      style={deckStyles.deck(entry.type, window.width)}
    >
      {wrappedArtefacts}
    </Animated.View>
  );
};

export default CollapsedDeck;
