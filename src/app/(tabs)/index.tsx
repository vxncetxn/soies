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
 *
 * Entry loading uses a module-level cache plus "adjust state during render": on
 * a route date change, cached entries are adopted synchronously (before commit)
 * so the DayPager updates in place with the correct entries — it is NOT keyed by
 * date, so a date change re-renders rather than remounts, avoiding the native
 * mount work that contended with the calendar's close spring. The cache is
 * warmed on mount by a single `getAllEntriesByDate` query (every date at once),
 * so any date picked from the calendar — including a first-ever visit — is a
 * cache hit, and the revalidation fetch is skipped on hits to avoid a second
 * native commit during the close. DayPager resets its scroll to the top on
 * entries change, and Stack resets its persisted artefact page on entry change.
 */
import { useLocalSearchParams } from "expo-router";
import { useEffect, useLayoutEffect, useMemo, useState } from "react";
import { ActivityIndicator, Pressable, Text, View, useWindowDimensions } from "react-native";
import { useAnimatedScrollHandler, useDerivedValue, useSharedValue } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useEntriesVersion } from "../../components/CreateContext";
import DayPager from "../../components/DayPager";
import HomeHeader from "../../components/HomeHeader";
import { getAllEntriesByDate, getEntriesByDate, type Entry } from "../../data/entries";
import {
  getCachedEntries,
  hasCachedEntries,
  seedEntriesCache,
  setCachedEntries,
} from "../../data/entriesCache";
import { todayISO } from "../../utils/date";

// Module-level cache of the measured pager height. The pager height only
// depends on the screen + safe areas, which don't change between navigations,
// so we remember it across visits. This lets the DayPager's ScrollView mount
// at the correct height on the very first commit when you return to the screen,
// avoiding a visible "pop" where it mounts at 0 and then resizes.
let cachedPagerHeight = 0;

// Module-level cache of entries by date. Warmed on mount by the preload effect
// (one `getAllEntriesByDate` query that loads every date's entries at once), and
// kept fresh by the load effect's revalidation on cache misses. When you pick a
// date from the calendar, the component reads this cache synchronously during
// render (see "adjust state during render" below) so the DayPager updates in
// place with the correct entries on the very first commit — instead of showing
// the stale previous date's entries and re-rendering when the async fetch
// resolves. That stale-then-update flow (and the full DayPager remount an
// earlier `key={effectiveDate}` caused) ran native mount/update work on the UI
// thread and contended with the calendar's close spring, dropping the de-bloom's
// first frames. The load effect skips revalidation on cache hits (no second
// commit during the close); cache misses still fetch (stale-while-revalidate).
const EMPTY_ENTRIES: Entry[] = [];
// True once the background preload of all entry dates has been kicked off.
// Module-level so it survives remounts (the cache does too).
let entriesPreloaded = false;

export default function Index() {
  const { date } = useLocalSearchParams<{ date?: string }>();
  const { entriesVersion } = useEntriesVersion();
  const insets = useSafeAreaInsets();
  const window = useWindowDimensions();

  const effectiveDate = date ?? todayISO();
  const [entries, setEntries] = useState<Entry[]>(
    () => getCachedEntries(effectiveDate) ?? EMPTY_ENTRIES,
  );
  // Tracks the date the `entries` state currently reflects, so we can detect
  // route date changes during render (see the adjust-state block below).
  const [prevDate, setPrevDate] = useState(effectiveDate);
  // `loading` is only true until the *first* successful load. After that we
  // keep the previous entries visible while the next date's entries load
  // (stale-while-revalidate), which avoids a full-screen spinner flash on every
  // date tap. The local query resolves in a few milliseconds, so the stale
  // content is imperceptible and is swapped in when the fetch resolves.
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  // Bumped by `retry` to retrigger the load effect after an error.
  const [attempt, setAttempt] = useState(0);

  // "Adjust state during render" (see
  // https://react.dev/learn/you-might-not-need-an-effect#adjusting-some-state-when-a-prop-changes).
  // When the route date changes, synchronously adopt the cached entries (if any)
  // BEFORE the first commit, so the DayPager updates in place with the correct
  // entries instead of showing the stale previous date's entries and re-rendering
  // again when the async fetch resolves. That stale-then-update flow ran native
  // update work on the UI thread and contended with the close spring, dropping
  // the de-bloom's first frames. Calling setState during render is safe here:
  // React re-renders immediately, before committing, so no painted frame shows
  // stale entries. For cache misses (first visit to a date, or preload not yet
  // done) there's no cached value, so `entries` stays stale and the load effect
  // below swaps in the fresh entries (stale-while-revalidate).
  if (prevDate !== effectiveDate) {
    setPrevDate(effectiveDate);
    const cached = getCachedEntries(effectiveDate);
    if (cached && cached !== entries) {
      setEntries(cached);
    }
  }

  const titles = useMemo(() => entries.map((entry) => entry.title), [entries]);

  useEffect(() => {
    let cancelled = false;
    const cacheHit = hasCachedEntries(effectiveDate);

    setError(null);

    // Cache hit: the adjust-state block above already adopted the cached entries
    // during render, so the DayPager updated in place with the correct entries.
    // Skip the revalidation fetch entirely — calling setEntries with a fresh
    // array reference here would trigger a second native commit during the close
    // morph and contend with the spring. The cache is warmed by the preload
    // effect and revalidated on cache misses, so it stays fresh for navigation.
    if (cacheHit) {
      setLoading(false);
      return () => {
        cancelled = true;
      };
    }

    getEntriesByDate(effectiveDate)
      .then((nextEntries) => {
        if (!cancelled) {
          // Cache the resolved entries so the next navigation to this date can
          // adopt them synchronously during render (see the adjust-state block).
          setCachedEntries(effectiveDate, nextEntries);
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
  }, [effectiveDate, attempt, entriesVersion]);

  // Background-preload every date's entries into the module-level cache on mount.
  // One `getAllEntriesByDate` query (entries + artefacts, grouped by date) warms
  // the cache for every date at once, so ANY date picked from the calendar is a
  // cache hit: the DayPager updates in place with the correct entries during the
  // close (no flash of the stale previous date — even on the first ever visit to
  // a date) and the close spring isn't contended by a stale-then-update flow or a
  // remount. Module-level `entriesPreloaded` guards against re-running on remount
  // (the cache survives remounts too). No cleanup: this is a global one-shot
  // background task, intentionally not tied to this component's lifetime.
  useEffect(() => {
    if (entriesPreloaded) {
      return;
    }
    entriesPreloaded = true;
    getAllEntriesByDate()
      .then((byDate) => {
        seedEntriesCache(byDate);
      })
      .catch(() => {});
  }, []);

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
