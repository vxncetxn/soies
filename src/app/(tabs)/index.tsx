/**
 * Home screen — the `(tabs)/index` route.
 *
 * This is the main screen of the app. It reads the optional `?date=` query
 * parameter from the URL, loads the entries for that day, and renders:
 *   - a `HomeHeader` (date button + animated entry titles), and
 *   - a `DayPager` (a vertical, paging ScrollView that shows one entry-stack
 *     per "page").
 *
 * Most of the interesting work here is setting up the **shared animation
 * values** that the header and the pager read from. These values live above
 * both components so they can stay in sync (e.g. the header's title cross-fade
 * tracks the same `currentPage` the pager writes while you scroll).
 *
 * The screen intentionally keeps all scroll state in Reanimated shared values
 * (not React state) so scrolling never triggers React re-renders — the UI
 * thread reads the values directly inside `useAnimatedStyle`/`useDerivedValue`.
 */
import { useLocalSearchParams } from "expo-router";
import { useLayoutEffect, useMemo, useState } from "react";
import { Text, View, useWindowDimensions } from "react-native";
import { useAnimatedScrollHandler, useDerivedValue, useSharedValue } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import DayPager from "../../components/DayPager";
import HomeHeader from "../../components/HomeHeader";
import { getEntriesByDate } from "../../data/entries";
import { todayISO } from "../../utils/date";

// Module-level cache of the measured pager height. The pager height only
// depends on the screen + safe areas, which don't change between navigations,
// so we remember it across visits. This lets the DayPager's ScrollView mount
// at the correct height on the very first commit when you return to the screen,
// avoiding a visible "pop" where it mounts at 0 and then resizes.
let cachedPagerHeight = 0;

export default function Index() {
  // `useLocalSearchParams` reads the route's query params. `date` is an ISO
  // string (e.g. "2026-07-03") that may be set by the calendar picker via
  // `router.setParams({ date })`. It's absent on first load.
  const { date } = useLocalSearchParams<{ date?: string }>();
  // Safe-area insets (status bar / home indicator) — used to compute how much
  // vertical space the pager can occupy.
  const insets = useSafeAreaInsets();
  // Window dimensions — used to compute the available pager height.
  const window = useWindowDimensions();

  // The date we actually show: the URL `date` if present, otherwise today.
  // This is the single source of truth for "which day is on screen".
  const effectiveDate = date ?? todayISO();
  // Look up the entries for that day from the (mock) data layer. Returns [] if
  // the day has no entries.
  const entries = getEntriesByDate(effectiveDate);
  // Extract just the titles for the header's animated title carousel. Memoized
  // so the array reference is stable across re-renders unless `entries` changes.
  const titles = useMemo(() => entries.map((entry) => entry.title), [entries]);

  // The maximum height the pager could be: full window minus the top and bottom
  // safe areas. This is a *cap* — the actual pager height is measured on layout
  // and clamped to this value (see `handlePagerHeightChange`).
  const computedHeight = Math.max(0, window.height - insets.top - insets.bottom);
  // Start from the cached height (if we've visited before) so the first render
  // already has a real height; otherwise fall back to the computed cap.
  const [pagerHeight, setPagerHeight] = useState(cachedPagerHeight || computedHeight);
  // Raw vertical scroll offset of the pager, written on the UI thread by
  // `onScroll` below. Kept as a shared value so the header and scroll indicator
  // can react without re-rendering this screen.
  const scrollOffset = useSharedValue(0);

  // Reset the scroll offset to the top whenever the date changes. Runs
  // synchronously before paint (`useLayoutEffect`) so a new day never flashes
  // at the previous day's scroll position. The pager is keyed by `effectiveDate`
  // (see JSX) so it remounts fresh anyway; this keeps the shared value in step.
  useLayoutEffect(() => {
    scrollOffset.value = 0;
  }, [effectiveDate, scrollOffset]);

  // Scroll handler that runs as a worklet on the UI thread. It just copies the
  // vertical content offset into `scrollOffset`. Because it's a shared value,
  // downstream `useDerivedValue`/`useAnimatedStyle` hooks update on the UI
  // thread with no JS round-trip per frame.
  const onScroll = useAnimatedScrollHandler((event) => {
    scrollOffset.value = event.contentOffset.y;
  });

  // The fractional "current page" of the vertical pager: 0.0 = first entry,
  // 1.0 = second entry, 1.5 = halfway between the second and third, etc.
  // Derived from `scrollOffset / pagerHeight` so it stays correct even if the
  // pager height changes. Guarded against divide-by-zero before layout.
  // This value drives the header's title carousel and the side scroll indicator.
  const currentPage = useDerivedValue(() => {
    if (pagerHeight === 0) {
      return 0;
    }

    return scrollOffset.value / pagerHeight;
  }, [pagerHeight]);

  // Called by DayPager after it lays out and measures its own height. We clamp
  // the measured height to `computedHeight` (the safe-area-bounded max) and
  // only update state if it actually changed, to avoid render loops. The value
  // is also written to the module cache so the next visit can skip the measure.
  const handlePagerHeightChange = (height: number) => {
    if (height > 0 && height !== pagerHeight) {
      setPagerHeight(height);
      cachedPagerHeight = height;
    }
  };

  return (
    <View className="relative flex-1 bg-background">
      {/* The header floats above the pager (it's `absolute` inside HomeHeader).
          It reads `currentPage` to cross-fade entry titles as you scroll. */}
      <HomeHeader date={effectiveDate} titles={titles} currentPage={currentPage} />

      {/* Empty-state for a day with no entries. */}
      {entries.length === 0 ? (
        <View className="flex-1 items-center justify-center px-5">
          <Text className="text-center text-primary">No entries for this day.</Text>
        </View>
      ) : (
        // `key={effectiveDate}` forces the pager to remount when the date
        // changes, so each day starts at the top with its own entries.
        <DayPager
          key={effectiveDate}
          entries={entries}
          pagerHeight={pagerHeight}
          computedHeight={computedHeight}
          scrollOffset={scrollOffset}
          currentPage={currentPage}
          onScroll={onScroll}
          onPagerHeightChange={handlePagerHeightChange}
        />
      )}
    </View>
  );
}
