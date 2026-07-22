/**
 * DayPager — the vertical, paging ScrollView that shows one entry per "page".
 *
 * Each "page" is one day's entry rendered as a `Stack` (the collapsible deck of
 * artefacts). You swipe vertically to move between entries; the side
 * `ScrollIndicator` lets you jump to a specific entry and shows previews.
 *
 * The pager is the *vertical* counterpart to the `Stack`'s *horizontal* pager
 * (which pages through an entry's artefacts when expanded). Both follow the
 * same pattern: a `ScrollView` provides gestures + snapping, while shared
 * values carry the scroll position to other components without re-rendering.
 *
 * Height handling is subtle: the pager doesn't know its own height until it
 * lays out (it's flex-1 inside the screen). It reports the measured height up
 * via `onPagerHeightChange`, and only mounts the ScrollView once a non-zero
 * height is known (`pagerHeight > 0`) so `currentPage = scrollOffset / height`
 * in the parent never divides by zero.
 */
import { useLayoutEffect } from "react";
import { ScrollView, View } from "react-native";
import Animated, {
  useAnimatedRef,
  useAnimatedScrollHandler,
  type SharedValue,
} from "react-native-reanimated";
import { StyleSheet } from "react-native-unistyles";

import type { Entry } from "../data/entries";
import type { WidgetDeepLinkTarget } from "../widgets/widgetDeepLink";

import { entryChromeVisible } from "../entry-transition/entryTransition";
import { useEntryTransition } from "../entry-transition/EntryTransitionContext";
import { EntryChromeMotion } from "../entry-transition/EntryTransitionMotion";
import { EntryPreview, ScrollIndicator } from "./ScrollIndicator";
import Stack from "./Stack";
import { StackChromeMotion } from "./StackChromeMotion";

type DayPagerProps = {
  entries: Entry[];
  // Measured height of one page. 0 means "not measured yet" — the ScrollView
  // waits for a real value before mounting.
  pagerHeight: number;
  // Safe-area-bounded max height, used by the parent to clamp the measurement.
  computedHeight: number;
  // Shared scroll offset (written here-read-by-parent). The parent owns it so
  // the header and indicator can react to scrolling.
  scrollOffset: SharedValue<number>;
  // Fractional current page (entries[round(currentPage)] is the visible one).
  currentPage: SharedValue<number>;
  // Scroll handler created by the parent with `useAnimatedScrollHandler`. Owned
  // upstream so the same worklet writes the parent's shared value directly.
  onScroll: ReturnType<typeof useAnimatedScrollHandler>;
  // Callback to report the measured pager height back to the parent.
  onPagerHeightChange: (height: number) => void;
  // Stable entry/artefact command from a consumed widget URL.
  widgetTarget: Extract<WidgetDeepLinkTarget, { kind: "artefact" }> | null;
  // Stack calls this only after it has selected and expanded the exact child.
  onWidgetTargetConsumed: () => void;
  // Exact entry selected from the Recent tab. Unlike a widget target this
  // selects only the vertical entry page; it does not expand an artefact.
  entryTargetId: string | null;
  onEntryTargetConsumed: () => void;
  /** Entry-transition request targeting one canonical Entry's first Artefact. */
  entryContentReadinessRequest?: { requestId: number; entryId: string } | null;
  /** Reports readiness for the exact request and Entry that received it. */
  onEntryContentReady?: (requestId: number, entryId: string) => void;
};

const DayPager = ({
  entries,
  pagerHeight,
  computedHeight,
  scrollOffset,
  currentPage,
  onScroll,
  onPagerHeightChange,
  widgetTarget,
  onWidgetTargetConsumed,
  entryTargetId,
  onEntryTargetConsumed,
  entryContentReadinessRequest,
  onEntryContentReady,
}: DayPagerProps) => {
  // Animated ref to the ScrollView so we can imperatively `scrollTo` when the
  // user jumps to an entry via the side indicator.
  const scrollRef = useAnimatedRef<ScrollView>();
  const { state: entryTransitionState } = useEntryTransition();
  const entryChromeIsVisible = entryChromeVisible(entryTransitionState, "home");

  // When the entries change (date navigation that updates us in place — index.tsx
  // intentionally does NOT key us by date, so a date change re-renders rather
  // than remounts), reset the vertical scroll to the top entry. With the old
  // `key={effectiveDate}` the ScrollView remounted and started at 0 for free;
  // updating in place preserves the scroll position, so we imperatively scroll
  // back to the top here. Runs before paint so the stale scroll position is
  // never visible (and the closing calendar overlay covers it anyway). The
  // parent's own `effectiveDate` effect resets the `scrollOffset` shared value
  // in parallel; this resets the actual ScrollView.
  // `scrollRef` is a stable AnimatedRef identity, so listing it satisfies
  // exhaustive-deps without re-firing (and avoids eslint-disable, which React
  // Compiler treats as a hard skip / panic under panicThreshold: 'all_errors').
  useLayoutEffect(() => {
    scrollRef.current?.scrollTo({ x: 0, y: 0, animated: false });
  }, [entries, scrollRef]);

  useLayoutEffect(() => {
    if (!widgetTarget || pagerHeight === 0) {
      return;
    }
    const entryIndex = entries.findIndex((entry) => entry.id === widgetTarget.entryId);
    if (entryIndex < 0) {
      return;
    }
    scrollRef.current?.scrollTo({ x: 0, y: entryIndex * pagerHeight, animated: false });
    scrollOffset.set(entryIndex * pagerHeight);
  }, [entries, pagerHeight, scrollOffset, scrollRef, widgetTarget]);

  useLayoutEffect(() => {
    if (!entryTargetId || pagerHeight === 0) {
      return;
    }
    const entryIndex = entries.findIndex((entry) => entry.id === entryTargetId);
    if (entryIndex >= 0) {
      const targetOffset = entryIndex * pagerHeight;
      scrollRef.current?.scrollTo({ x: 0, y: targetOffset, animated: false });
      scrollOffset.set(targetOffset);
    }
    // Consume even if the entry disappeared between preview query and complete
    // Day query; the screen then remains safely on its first available entry.
    onEntryTargetConsumed();
  }, [entries, entryTargetId, onEntryTargetConsumed, pagerHeight, scrollOffset, scrollRef]);

  /**
   * Jump directly to a given entry index (called by the ScrollIndicator when
   * the user taps a preview). Uses a non-animated scroll so it snaps instantly,
   * and manually writes `scrollOffset` so the shared value matches the new
   * position immediately (otherwise downstream animations would lag by a frame
   * until the next onScroll event). No-op until the pager has a real height.
   */
  const jumpToEntry = (index: number) => {
    if (pagerHeight === 0) {
      return;
    }

    scrollRef.current?.scrollTo({ x: 0, y: index * pagerHeight, animated: false });
    scrollOffset.set(index * pagerHeight);
  };

  return (
    <View style={styles.root}>
      {/* Measuring wrapper. On layout we read its height, clamp it to the
          safe-area max (`computedHeight`), and report it up. The ScrollView
          is only rendered once that height is known, so pages always have a
          concrete height to fill. */}
      <View
        style={styles.flex}
        onLayout={(event) => {
          const h = event.nativeEvent.layout.height;
          const finalH = Math.min(h, computedHeight);
          onPagerHeightChange(finalH);
        }}
      >
        {pagerHeight > 0 && (
          <Animated.ScrollView
            ref={scrollRef}
            pagingEnabled
            showsVerticalScrollIndicator={false}
            scrollEventThrottle={16}
            removeClippedSubviews
            onScroll={onScroll}
            style={styles.pager(pagerHeight)}
          >
            {entries.map((entry) => (
              <View key={entry.id} style={styles.page(pagerHeight)}>
                <Stack
                  entry={entry}
                  widgetArtefactId={
                    widgetTarget?.entryId === entry.id ? widgetTarget.artefactId : null
                  }
                  onWidgetTargetConsumed={onWidgetTargetConsumed}
                  firstArtefactReadinessRequestId={
                    entryContentReadinessRequest?.entryId === entry.id
                      ? entryContentReadinessRequest.requestId
                      : null
                  }
                  onFirstArtefactReady={
                    onEntryContentReady
                      ? (requestId) => onEntryContentReady(requestId, entry.id)
                      : undefined
                  }
                />
              </View>
            ))}
          </Animated.ScrollView>
        )}
      </View>

      {/* Side scroll indicator: a vertical rail of dots/previews pinned to the
          right edge, vertically centered. `pointerEvents="box-none"` lets taps
          pass through the empty areas of this container to the pager beneath,
          while the indicator's own interactive elements still receive taps.
          It's faded out while an entry is expanded (see indicatorFadeStyle). */}
      {pagerHeight > 0 && (
        <EntryChromeMotion
          visible={entryChromeIsVisible}
          pointerEvents="box-none"
          style={styles.indicatorPosition}
        >
          <StackChromeMotion pointerEvents="box-none">
            <ScrollIndicator
              orientation="vertical"
              count={entries.length}
              currentPage={currentPage}
              maxVisible={5}
              onJumpToIndex={jumpToEntry}
              renderPreview={(index) => <EntryPreview entry={entries[index]} />}
            />
          </StackChromeMotion>
        </EntryChromeMotion>
      )}
    </View>
  );
};

export default DayPager;

const styles = StyleSheet.create({
  flex: {
    flex: 1,
  },
  indicatorPosition: {
    position: "absolute",
    right: 12,
    top: "50%",
    transform: [{ translateY: "-50%" }],
    zIndex: 40,
  },
  page: (height: number) => ({
    alignItems: "center",
    height,
    justifyContent: "center",
    paddingHorizontal: 20,
  }),
  pager: (height: number) => ({
    height,
  }),
  root: {
    flex: 1,
    position: "relative",
  },
});
