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
import { useEffect, useLayoutEffect, useMemo, useState } from "react";
import { ActivityIndicator, Pressable, Text, View, useWindowDimensions } from "react-native";
import { useAnimatedScrollHandler, useDerivedValue, useSharedValue } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import DayPager from "../../components/DayPager";
import HomeHeader from "../../components/HomeHeader";
import { getEntriesByDate, type Entry } from "../../data/entries";
import { todayISO } from "../../utils/date";

// Module-level cache of the measured pager height. The pager height only
// depends on the screen + safe areas, which don't change between navigations,
// so we remember it across visits. This lets the DayPager's ScrollView mount
// at the correct height on the very first commit when you return to the screen,
// avoiding a visible "pop" where it mounts at 0 and then resizes.
let cachedPagerHeight = 0;

export default function Index() {
  const { date } = useLocalSearchParams<{ date?: string }>();
  const insets = useSafeAreaInsets();
  const window = useWindowDimensions();

  const effectiveDate = date ?? todayISO();
  const [entries, setEntries] = useState<Entry[]>([]);
  // `loading` is only true until the *first* successful load. After that we
  // keep the previous entries visible while the next date's entries load
  // (stale-while-revalidate), which avoids a full-screen spinner flash on every
  // date tap. The local query resolves in a few milliseconds, so the stale
  // content is imperceptible and is swapped in when the fetch resolves.
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  // Bumped by `retry` to retrigger the load effect after an error.
  const [attempt, setAttempt] = useState(0);

  const titles = useMemo(() => entries.map((entry) => entry.title), [entries]);

  useEffect(() => {
    let cancelled = false;

    setError(null);
    getEntriesByDate(effectiveDate)
      .then((nextEntries) => {
        if (!cancelled) {
          setEntries(nextEntries);
          setLoading(false);
        }
      })
      .catch((nextError: unknown) => {
        if (!cancelled) {
          setError(nextError instanceof Error ? nextError : new Error(String(nextError)));
          setLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [effectiveDate, attempt]);

  const retry = () => setAttempt((previous) => previous + 1);

  const computedHeight = Math.max(0, window.height - insets.top - insets.bottom);
  const [pagerHeight, setPagerHeight] = useState(cachedPagerHeight || computedHeight);
  const scrollOffset = useSharedValue(0);

  useLayoutEffect(() => {
    scrollOffset.value = 0;
  }, [effectiveDate, scrollOffset]);

  const onScroll = useAnimatedScrollHandler((event) => {
    scrollOffset.value = event.contentOffset.y;
  });

  const currentPage = useDerivedValue(() => {
    if (pagerHeight === 0) {
      return 0;
    }

    return scrollOffset.value / pagerHeight;
  }, [pagerHeight]);

  const handlePagerHeightChange = (height: number) => {
    if (height > 0 && height !== pagerHeight) {
      setPagerHeight(height);
      cachedPagerHeight = height;
    }
  };

  return (
    <View className="relative flex-1 bg-background">
      <HomeHeader date={effectiveDate} titles={titles} currentPage={currentPage} />

      {error ? (
        <View className="flex-1 items-center justify-center gap-4 px-5">
          <Text className="text-center text-primary">Couldn&apos;t load entries for this day.</Text>
          <Pressable
            onPress={retry}
            accessibilityRole="button"
            accessibilityLabel="Retry loading entries"
            className="rounded-full border border-controls-border bg-controls-background px-5 py-2"
          >
            <Text className="text-primary">Try again</Text>
          </Pressable>
        </View>
      ) : loading ? (
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator />
        </View>
      ) : entries.length === 0 ? (
        <View className="flex-1 items-center justify-center px-5">
          <Text className="text-center text-primary">No entries for this day.</Text>
        </View>
      ) : (
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
