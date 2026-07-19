/**
 * Home screen — the root `index` route.
 *
 * This is the main screen of the app. It reads the optional `?date=` query
 * parameter from the URL, loads the entries for that day, and renders:
 *   - a `HomeHeader` (calendar button + animated entry titles),
 *   - a `DayPager` (a vertical, paging ScrollView that shows one entry-stack
 *     per "page"), and
 *   - a persistently mounted `CalendarSheet` whose bounded tab content is
 *     prepared after Home's first paint and retained for flash-free opening.
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
 * Entry loading uses a small, bounded day cache. A route date change adopts a
 * cached day synchronously; a miss shows the loading state while one deduped
 * query runs. Calendar selections prefetch the selected day before changing
 * the route, preserving the old calendar's instant hand-off without retaining
 * the user's entire journal in memory.
 */
import { type ErrorBoundaryProps, useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { ActivityIndicator, Pressable, Text, View, useWindowDimensions } from "react-native";
import { useAnimatedScrollHandler, useDerivedValue, useSharedValue } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import AppErrorFallback from "../components/app-error-fallback";
import CalendarSheet from "../components/CalendarSheet";
import { useEntriesVersion } from "../components/CreateContext";
import CreateEntryButton from "../components/CreateEntryButton";
import DayPager from "../components/DayPager";
import { ExpandProvider } from "../components/ExpandContext";
import FeaturedArtefactsButton from "../components/FeaturedArtefactsButton";
import HomeHeader from "../components/HomeHeader";
import { getEntriesByDate, type Entry } from "../data/entries";
import {
  getCachedEntries,
  hasCachedEntries,
  invalidateEntriesCache,
  loadEntriesCached,
} from "../data/entriesCache";
import { isFeaturedWidgetSourceAvailable } from "../db/repositories/featuredWidgetSlots";
import { todayISO, validISODateOr } from "../utils/date";
import { useFeaturedWidgets } from "../widgets/FeaturedWidgetsContext";
import {
  hasExactWidgetSource,
  nextWidgetDeepLinkConsumption,
  widgetTargetForEntries,
  type WidgetDeepLinkTarget,
  type WidgetSearchParams,
} from "../widgets/widgetDeepLink";

// Module-level cache of the measured pager height. The pager height only
// depends on the screen + safe areas, which don't change between navigations,
// so we remember it across visits. This lets the DayPager's ScrollView mount
// at the correct height on the very first commit when you return to the screen,
// avoiding a visible "pop" where it mounts at 0 and then resizes.
let cachedPagerHeight = 0;

const EMPTY_ENTRIES: Entry[] = [];

function HomeScreen() {
  const searchParams = useLocalSearchParams<WidgetSearchParams>();
  const router = useRouter();
  const { openFeatured } = useFeaturedWidgets();
  const { entriesVersion } = useEntriesVersion();
  const insets = useSafeAreaInsets();
  const window = useWindowDimensions();

  const routeDate = Array.isArray(searchParams.date) ? searchParams.date[0] : searchParams.date;
  const effectiveDate = validISODateOr(routeDate, todayISO());
  const [entries, setEntries] = useState<Entry[]>(
    () => getCachedEntries(effectiveDate) ?? EMPTY_ENTRIES,
  );
  // Tracks the date the `entries` state currently reflects, so we can detect
  // route date changes during render (see the adjust-state block below).
  const [prevDate, setPrevDate] = useState(effectiveDate);
  const [loading, setLoading] = useState(() => !hasCachedEntries(effectiveDate));
  const [error, setError] = useState<Error | null>(null);
  // Bumped by `retry` to retrigger the load effect after an error.
  const [attempt, setAttempt] = useState(0);
  const [pendingWidgetTarget, setPendingWidgetTarget] = useState<Extract<
    WidgetDeepLinkTarget,
    { kind: "artefact" }
  > | null>(null);
  const [pendingCalendarEntryId, setPendingCalendarEntryId] = useState<string | null>(null);
  const [calendarOpen, setCalendarOpen] = useState(false);
  const [calendarOpenRequestedAt, setCalendarOpenRequestedAt] = useState<number | null>(null);
  const consumedWidgetSignatureRef = useRef<string | null>(null);
  const widgetValidationRequestRef = useRef(0);

  // Never let an impossible external route value reach repository queries.
  // Canonicalising the URL also keeps subsequent navigation and widget actions
  // anchored to the same valid Day the screen is displaying.
  useEffect(() => {
    if (routeDate !== undefined && routeDate !== effectiveDate) {
      router.setParams({ date: effectiveDate });
    }
  }, [effectiveDate, routeDate, router]);

  /**
   * Consume widget-only query parameters once, then clear them while retaining
   * `date` as ordinary Home navigation state. Clearing resets the signature on
   * the next render, so tapping the exact same installed widget works again.
   */
  useEffect(() => {
    const consumption = nextWidgetDeepLinkConsumption(
      consumedWidgetSignatureRef.current,
      searchParams,
    );
    consumedWidgetSignatureRef.current = consumption.signature;
    if (!consumption.target) {
      return;
    }

    router.setParams({
      widgetSlot: undefined,
      widgetEntryId: undefined,
      widgetArtefactId: undefined,
    });
    if (consumption.target.kind === "slot") {
      setPendingWidgetTarget(null);
      openFeatured(consumption.target.slotIndex);
      return;
    }

    const target = consumption.target;
    const request = widgetValidationRequestRef.current + 1;
    widgetValidationRequestRef.current = request;
    void isFeaturedWidgetSourceAvailable(target.date, target.entryId, target.artefactId)
      .then(async (available) => {
        if (widgetValidationRequestRef.current !== request) {
          return;
        }
        if (available) {
          // Home intentionally skips DB revalidation on ordinary cache hits to
          // protect the calendar close animation. A widget command is different:
          // exact identity beats that optimization, so repair a stale/missing
          // cached day before deciding the source has disappeared.
          const cached = getCachedEntries(target.date);
          const cachedHasTarget = cached ? hasExactWidgetSource(cached, target) : false;
          if (!cachedHasTarget) {
            // A present-but-missing target is a stale cache entry. Drop only
            // that Day; a normal in-flight load is otherwise shared here.
            if (cached) {
              invalidateEntriesCache(target.date);
            }
            const freshEntries = await loadEntriesCached(target.date, () =>
              getEntriesByDate(target.date),
            );
            if (widgetValidationRequestRef.current !== request) {
              return;
            }
            const freshHasTarget = hasExactWidgetSource(freshEntries, target);
            if (!freshHasTarget) {
              setPendingWidgetTarget(null);
              openFeatured(target.slotIndex);
              return;
            }
            if (target.date === effectiveDate) {
              setEntries(freshEntries);
            }
          }
          setPendingWidgetTarget(target);
        } else {
          setPendingWidgetTarget(null);
          openFeatured(target.slotIndex);
        }
      })
      .catch(() => {
        if (widgetValidationRequestRef.current === request) {
          setPendingWidgetTarget(null);
          openFeatured(target.slotIndex);
        }
      });
  }, [effectiveDate, openFeatured, router, searchParams]);

  // "Adjust state during render" (see
  // https://react.dev/learn/you-might-not-need-an-effect#adjusting-some-state-when-a-prop-changes).
  // When the route date changes, synchronously adopt that Day's cached entries
  // before commit. A miss clears the old Day immediately so it can never be
  // mistaken for the newly selected one while the local query resolves.
  if (prevDate !== effectiveDate) {
    setPrevDate(effectiveDate);
    const cached = getCachedEntries(effectiveDate);
    setEntries(cached ?? EMPTY_ENTRIES);
    setLoading(!cached);
    setError(null);
  }

  // Cache hit: finish the first-load spinner during render (not in an effect) so
  // React Compiler does not flag EffectSetState. The adjust-state block above
  // already adopted cached entries before paint.
  const cacheHit = hasCachedEntries(effectiveDate);
  if (cacheHit && loading) {
    setLoading(false);
  }
  if (cacheHit && error) {
    setError(null);
  }

  useEffect(() => {
    let cancelled = false;

    // Cache hit: skip revalidation. Cache misses share an in-flight request,
    // including the selected-Day prefetch started by the calendar sheet.
    if (hasCachedEntries(effectiveDate)) {
      return () => {
        cancelled = true;
      };
    }

    loadEntriesCached(effectiveDate, () => getEntriesByDate(effectiveDate))
      .then((nextEntries) => {
        if (!cancelled) {
          setEntries(nextEntries);
          setLoading(false);
          setError(null);
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

  const retry = () => setAttempt((previous) => previous + 1);

  const navigateFromCalendar = (day: string, entryId: string | null) => {
    setPendingWidgetTarget(null);
    // Monthly always targets the first Entry. A route update to the Day that
    // Home already shows is otherwise a no-op, so give DayPager an explicit
    // first-Entry target for that same-Day case. Recent supplies its exact ID.
    setPendingCalendarEntryId(entryId ?? (day === effectiveDate ? (entries[0]?.id ?? null) : null));

    // Begin the complete-Day query while the native sheet is closing. The
    // home load effect joins this promise, so an uncached Day performs one
    // query and usually resolves before the sheet has settled off-screen.
    if (!hasCachedEntries(day)) {
      void loadEntriesCached(day, () => getEntriesByDate(day)).catch(() => {});
    }
    router.setParams({ date: day });
  };

  const widgetTargetForPager = widgetTargetForEntries(pendingWidgetTarget, effectiveDate, entries);

  useEffect(() => {
    if (!pendingWidgetTarget || loading || error || pendingWidgetTarget.date !== effectiveDate) {
      return;
    }
    if (!widgetTargetForPager) {
      const fallbackFrame = requestAnimationFrame(() => {
        openFeatured(pendingWidgetTarget.slotIndex);
        setPendingWidgetTarget(null);
      });
      return () => cancelAnimationFrame(fallbackFrame);
    }
  }, [effectiveDate, error, loading, openFeatured, pendingWidgetTarget, widgetTargetForPager]);

  const computedHeight = Math.max(0, window.height - insets.top - insets.bottom);
  const [pagerHeight, setPagerHeight] = useState(cachedPagerHeight || computedHeight);
  const scrollOffset = useSharedValue(0);

  useLayoutEffect(() => {
    scrollOffset.set(0);
  }, [effectiveDate, scrollOffset]);

  const onScroll = useAnimatedScrollHandler((event) => {
    scrollOffset.set(event.contentOffset.y);
  });

  const currentPage = useDerivedValue(() => {
    if (pagerHeight === 0) {
      return 0;
    }

    return scrollOffset.get() / pagerHeight;
  }, [pagerHeight]);

  const handlePagerHeightChange = (height: number) => {
    if (height > 0 && height !== pagerHeight) {
      setPagerHeight(height);
      cachedPagerHeight = height;
    }
  };

  return (
    <View className="relative flex-1 bg-background">
      <HomeHeader
        date={effectiveDate}
        titles={entries.map((entry) => entry.title)}
        currentPage={currentPage}
        onCalendarPress={() => {
          setCalendarOpenRequestedAt(performance.now());
          setCalendarOpen(true);
        }}
      />

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
          widgetTarget={widgetTargetForPager}
          onWidgetTargetConsumed={() => setPendingWidgetTarget(null)}
          entryTargetId={pendingCalendarEntryId}
          onEntryTargetConsumed={() => setPendingCalendarEntryId(null)}
        />
      )}
      <CalendarSheet
        dataVersion={entriesVersion}
        open={calendarOpen}
        openRequestedAt={calendarOpenRequestedAt}
        selectedDay={effectiveDate}
        onOpenChange={setCalendarOpen}
        onSelectDay={(day) => navigateFromCalendar(day, null)}
        onSelectEntry={navigateFromCalendar}
      />
      <FeaturedArtefactsButton />
      <CreateEntryButton />
    </View>
  );
}

export default function Index() {
  return (
    <ExpandProvider>
      <HomeScreen />
    </ExpandProvider>
  );
}

export function ErrorBoundary({ error, retry }: ErrorBoundaryProps) {
  return <AppErrorFallback error={error} onRetry={retry} title="Couldn’t load your journal." />;
}
