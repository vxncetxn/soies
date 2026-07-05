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
import { useCallback, useLayoutEffect } from "react";
import { ScrollView, View } from "react-native";
import Animated, {
  useAnimatedRef,
  useAnimatedStyle,
  interpolate,
  useAnimatedScrollHandler,
  type SharedValue,
} from "react-native-reanimated";

import type { Entry } from "../data/entries";

import { CHROME_FADE_END } from "../constants/animation";
import { useExpandContext } from "./ExpandContext";
import { EntryPreview, ScrollIndicator } from "./ScrollIndicator";
import Stack from "./Stack";

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
};

const DayPager = ({
  entries,
  pagerHeight,
  computedHeight,
  scrollOffset,
  currentPage,
  onScroll,
  onPagerHeightChange,
}: DayPagerProps) => {
  // Animated ref to the ScrollView so we can imperatively `scrollTo` when the
  // user jumps to an entry via the side indicator.
  const scrollRef = useAnimatedRef<ScrollView>();
  // `chromeProgress` drives the header/expand chrome fade. We read it here to
  // fade the side indicator out while an entry is expanded (so it doesn't
  // overlap the fullscreen expanded view).
  const { chromeProgress } = useExpandContext();

  // When the entries change (date navigation that updates us in place — index.tsx
  // intentionally does NOT key us by date, so a date change re-renders rather
  // than remounts), reset the vertical scroll to the top entry. With the old
  // `key={effectiveDate}` the ScrollView remounted and started at 0 for free;
  // updating in place preserves the scroll position, so we imperatively scroll
  // back to the top here. Runs before paint so the stale scroll position is
  // never visible (and the closing calendar overlay covers it anyway). The
  // parent's own `effectiveDate` effect resets the `scrollOffset` shared value
  // in parallel; this resets the actual ScrollView.
  useLayoutEffect(() => {
    scrollRef.current?.scrollTo({ x: 0, y: 0, animated: false });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entries]);

  // Fade the side scroll indicator out over the first slice of the expand
  // animation. `chromeProgress` is 0 when collapsed, 1 when an entry is
  // expanded; `CHROME_FADE_END` is the fraction of the animation by which the
  // chrome should be fully hidden.
  const indicatorFadeStyle = useAnimatedStyle(() => ({
    opacity: interpolate(chromeProgress.value, [0, CHROME_FADE_END], [1, 0]),
  }));

  /**
   * Jump directly to a given entry index (called by the ScrollIndicator when
   * the user taps a preview). Uses a non-animated scroll so it snaps instantly,
   * and manually writes `scrollOffset` so the shared value matches the new
   * position immediately (otherwise downstream animations would lag by a frame
   * until the next onScroll event). No-op until the pager has a real height.
   */
  const jumpToEntry = useCallback(
    (index: number) => {
      if (pagerHeight === 0) {
        return;
      }

      scrollRef.current?.scrollTo({ x: 0, y: index * pagerHeight, animated: false });
      scrollOffset.value = index * pagerHeight;
    },
    [pagerHeight, scrollOffset, scrollRef],
  );

  return (
    <View className="relative flex-1">
      {/* Measuring wrapper. On layout we read its height, clamp it to the
          safe-area max (`computedHeight`), and report it up. The ScrollView
          is only rendered once that height is known, so pages always have a
          concrete height to fill. */}
      <View
        className="flex-1"
        onLayout={(event) => {
          const h = event.nativeEvent.layout.height;
          const finalH = Math.min(h, computedHeight);
          onPagerHeightChange(finalH);
        }}
      >
        {pagerHeight > 0 && (
          <Animated.ScrollView
            ref={scrollRef}
            // `pagingEnabled` makes it snap one page (one `pagerHeight`) at a
            // time, so each swipe lands exactly on an entry.
            pagingEnabled
            showsVerticalScrollIndicator={false}
            // ~one scroll event per frame (60fps) — smooth enough for the
            // indicator to track without flooding the UI thread.
            scrollEventThrottle={16}
            // Unmount views that are far off-screen. With many entries this
            // keeps memory down; the trade-off is a remount cost when scrolling
            // back, which paging makes rare.
            removeClippedSubviews
            onScroll={onScroll}
            // Fixed height so each page is exactly one entry tall.
            style={{ height: pagerHeight }}
          >
            {entries.map((entry, index) => (
              // Each page is a full-height, centered slot holding one Stack.
              <View
                key={index}
                style={{ height: pagerHeight }}
                className="items-center justify-center px-5"
              >
                <Stack entry={entry} />
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
        <Animated.View
          style={indicatorFadeStyle}
          pointerEvents="box-none"
          className="absolute top-1/2 right-3 z-40 -translate-y-1/2"
        >
          <ScrollIndicator
            orientation="vertical"
            count={entries.length}
            currentPage={currentPage}
            maxVisible={5}
            onJumpToIndex={jumpToEntry}
            renderPreview={(index) => <EntryPreview entry={entries[index]} />}
          />
        </Animated.View>
      )}
    </View>
  );
};

export default DayPager;
