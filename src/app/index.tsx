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
 * thread reads the values directly inside worklets and `useDerivedValue`.
 *
 * Calendar-origin navigation starts the selected Day query during native
 * dismissal and mounts its result below the viewport. Only after dismissal
 * settles does the old body exit; the prepared body then enters immediately
 * when ready. The canonical Day is adopted behind that stationary cover so
 * its native mount cannot interrupt the entrance animation.
 */
import { type ErrorBoundaryProps, useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { ActivityIndicator, Alert, Pressable, Text, View, useWindowDimensions } from "react-native";
import { useAnimatedScrollHandler, useDerivedValue, useSharedValue } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import type { PreparedHomeHandoff, PreparedHomeTransition } from "../data/preparedHomeHandoff";

import AppErrorFallback from "../components/app-error-fallback";
import CalendarSheet from "../components/CalendarSheet";
import { useCreateContext, useEntriesVersion } from "../components/CreateContext";
import CreateEntryButton from "../components/CreateEntryButton";
import DayPager from "../components/DayPager";
import { ExpandProvider } from "../components/ExpandContext";
import FeaturedArtefactsButton from "../components/FeaturedArtefactsButton";
import HomeHeader from "../components/HomeHeader";
import PreparedHomeEntry from "../components/PreparedHomeEntry";
import { getEntriesByDate, isUnknownArtefact, type Entry } from "../data/entries";
import {
  getCachedEntries,
  hasCachedEntries,
  invalidateEntriesCache,
  loadEntriesCached,
} from "../data/entriesCache";
import { buildPreparedHomeTransition, resolvePreparedHomeEntry } from "../data/preparedHomeHandoff";
import { isFeaturedWidgetSourceAvailable } from "../db/repositories/featuredWidgetSlots";
import {
  entrySurfaceMotion,
  type EntryMotionCompletion,
} from "../entry-transition/entryTransition";
import { useEntryTransition } from "../entry-transition/EntryTransitionContext";
import { EntrySurfaceMotion } from "../entry-transition/EntryTransitionMotion";
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
type CalendarTransitionState = {
  requestId: number;
  sheetDismissed: boolean;
};

function HomeScreen() {
  const searchParams = useLocalSearchParams<WidgetSearchParams>();
  const router = useRouter();
  const { openFeatured } = useFeaturedWidgets();
  const { entriesVersion, bumpEntriesVersion } = useEntriesVersion();
  const { createDate, createDismissal } = useCreateContext();
  const entryTransition = useEntryTransition();
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
  const [calendarHandoff, setCalendarHandoff] = useState<PreparedHomeHandoff | null>(null);
  const [calendarPreparedHandoff, setCalendarPreparedHandoff] =
    useState<PreparedHomeTransition | null>(null);
  const [calendarAdoptedRequestId, setCalendarAdoptedRequestId] = useState<number | null>(null);
  const [calendarCanonicalEntryReadyRequestId, setCalendarCanonicalEntryReadyRequestId] = useState<
    number | null
  >(null);
  const [calendarOpen, setCalendarOpen] = useState(false);
  const [calendarOpenRequestedAt, setCalendarOpenRequestedAt] = useState<number | null>(null);
  const consumedWidgetSignatureRef = useRef<string | null>(null);
  const widgetValidationRequestRef = useRef(0);
  const skipNextDayLoadRef = useRef<string | null>(null);
  const calendarTransitionStateRef = useRef<CalendarTransitionState | null>(null);
  const pendingCalendarFailureRequestRef = useRef<number | null>(null);

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
  // When the route date changes, synchronously adopt a prepared Calendar
  // hand-off or that Day's cached entries before commit. An ordinary miss
  // clears the old Day immediately so it can never be mistaken for the newly
  // selected one while the local query resolves.
  if (prevDate !== effectiveDate) {
    setPrevDate(effectiveDate);
    const matchingHandoff = calendarHandoff?.day === effectiveDate ? calendarHandoff : null;
    const prepared = matchingHandoff?.entries ?? getCachedEntries(effectiveDate);
    setEntries(prepared ?? EMPTY_ENTRIES);
    setLoading(!prepared);
    setError(null);
    setPendingCalendarEntryId(
      matchingHandoff ? (resolvePreparedHomeEntry(matchingHandoff)?.id ?? null) : null,
    );
    if (matchingHandoff) {
      setCalendarHandoff(null);
    }
  }

  // Commit the prepared payload before changing the route. This makes the
  // next render's hand-off deterministic even if Expo Router and local state
  // updates would otherwise flush in separate batches.
  useEffect(() => {
    if (calendarHandoff && calendarHandoff.day !== effectiveDate) {
      skipNextDayLoadRef.current = calendarHandoff.day;
      router.setParams({ date: calendarHandoff.day });
    }
  }, [calendarHandoff, effectiveDate, router]);

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

  const saveReloadOwnsHome =
    createDismissal?.reason === "save" &&
    createDismissal.requestId === entryTransition.state.requestId &&
    entryTransition.state.target === "prepared-home";

  useEffect(() => {
    let cancelled = false;

    // Calendar navigation already owns the resolved query result even while
    // the evaluation cache discards it. The route adopts that handoff during
    // render, so do not issue a second query from this effect.
    if (skipNextDayLoadRef.current === effectiveDate) {
      skipNextDayLoadRef.current = null;
      return () => {
        cancelled = true;
      };
    }

    // A successful Save has its own prepared-Home adapter below. Letting this
    // ordinary reload mount the complete Day during Create's exit would put the
    // expensive canonical tree back on the critical animation path.
    if (saveReloadOwnsHome) {
      return () => {
        cancelled = true;
      };
    }

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
  }, [effectiveDate, attempt, entriesVersion, saveReloadOwnsHome]);

  useEffect(() => {
    if (
      !saveReloadOwnsHome ||
      !createDismissal ||
      entryTransition.state.requestId !== createDismissal.requestId
    ) {
      return;
    }
    let cancelled = false;
    const requestId = createDismissal.requestId;

    loadEntriesCached(createDate, () => getEntriesByDate(createDate))
      .then((nextEntries) => {
        if (cancelled) {
          return;
        }
        setCalendarPreparedHandoff(
          buildPreparedHomeTransition({
            requestId,
            day: createDate,
            origin: "save",
            entries: nextEntries,
          }),
        );
      })
      .catch((nextError: unknown) => {
        if (cancelled) {
          return;
        }
        setCalendarPreparedHandoff(
          buildPreparedHomeTransition({
            requestId,
            day: createDate,
            origin: "save",
            error: nextError instanceof Error ? nextError : new Error(String(nextError)),
          }),
        );
      });

    return () => {
      cancelled = true;
    };
  }, [createDate, createDismissal, entryTransition.state.requestId, saveReloadOwnsHome]);

  const retry = () => setAttempt((previous) => previous + 1);

  const adoptCalendarHandoff = (handoff: PreparedHomeHandoff) => {
    const targetEntryId = resolvePreparedHomeEntry(handoff)?.id ?? null;
    setError(null);

    if (handoff.day === effectiveDate) {
      setEntries(handoff.entries);
      setLoading(false);
      setPendingCalendarEntryId(targetEntryId);
    } else {
      setCalendarHandoff(handoff);
    }
  };

  // The prepared layer is now stationary and opaque. Adopt the complete Day
  // behind it, then retire the cover only after the canonical Paper is ready.
  if (
    calendarPreparedHandoff &&
    entryTransition.state.phase === "settling" &&
    entryTransition.state.requestId === calendarPreparedHandoff.requestId &&
    entryTransition.state.target === "prepared-home" &&
    calendarAdoptedRequestId !== calendarPreparedHandoff.requestId
  ) {
    setCalendarAdoptedRequestId(calendarPreparedHandoff.requestId);
    if (calendarPreparedHandoff.error) {
      setError(calendarPreparedHandoff.error);
      setLoading(false);
      setPendingCalendarEntryId(null);
    } else {
      adoptCalendarHandoff(calendarPreparedHandoff);
    }
  }

  const clearPreparedCalendarTransition = () => {
    setCalendarPreparedHandoff(null);
    setCalendarAdoptedRequestId(null);
    setCalendarCanonicalEntryReadyRequestId(null);
  };

  const showCalendarNavigationFailure = () => {
    // A failed selection never replaces `entries`, so return the unchanged Day
    // from below before the alert is dismissed or Calendar is opened again.
    clearPreparedCalendarTransition();
    Alert.alert("Couldn’t open this day.", "Please try again.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Open calendar",
        onPress: () => {
          pendingCalendarFailureRequestRef.current = null;
          setCalendarOpenRequestedAt(performance.now());
          setCalendarOpen(true);
        },
      },
    ]);
  };

  const navigateFromCalendar = (day: string, entryId: string | null): number => {
    setPendingWidgetTarget(null);
    clearPreparedCalendarTransition();
    const requestId = entryTransition.begin("home", "prepared-home", "manual", "fixed");
    calendarTransitionStateRef.current = { requestId, sheetDismissed: false };

    void loadEntriesCached(day, () => getEntriesByDate(day))
      .then((nextEntries) => {
        const transition = calendarTransitionStateRef.current;
        if (transition?.requestId === requestId) {
          setCalendarPreparedHandoff(
            buildPreparedHomeTransition({
              requestId,
              day,
              entryId,
              entries: nextEntries,
              origin: "calendar",
            }),
          );
        }
      })
      .catch((nextError: unknown) => {
        const transition = calendarTransitionStateRef.current;
        if (transition?.requestId !== requestId) {
          return;
        }
        entryTransition.abort(requestId);
        if (__DEV__) {
          console.warn("Calendar Day load failed", nextError);
        }
        calendarTransitionStateRef.current = null;
        if (transition?.sheetDismissed) {
          showCalendarNavigationFailure();
        } else {
          pendingCalendarFailureRequestRef.current = requestId;
        }
      });
    return requestId;
  };

  const handleCalendarDismissSettled = (requestId: number | null) => {
    if (requestId == null) {
      return;
    }
    if (pendingCalendarFailureRequestRef.current === requestId) {
      pendingCalendarFailureRequestRef.current = null;
      showCalendarNavigationFailure();
      return;
    }
    const transition = calendarTransitionStateRef.current;
    if (transition?.requestId === requestId) {
      transition.sheetDismissed = true;
    }
    if (transition?.requestId !== requestId) {
      return;
    }
    // Native dismissal has completely settled at zero. Only now may the old
    // Home body start its visible exit; the Day query has already been running
    // throughout the sheet collapse and may have staged its replacement below.
    entryTransition.allowExit(requestId);
  };

  const homeBodyMotion = entrySurfaceMotion(entryTransition.state, "home");
  const preparedHomeMotion = entrySurfaceMotion(entryTransition.state, "prepared-home");

  const handleHomeBodyMotionEnd = (completion: EntryMotionCompletion) => {
    if (completion.kind === "source-exit") {
      entryTransition.sourceExitFinished(completion.requestId);
      return;
    }
    entryTransition.targetEnterFinished(completion.requestId);
    entryTransition.complete(completion.requestId, "home");
  };

  const handlePreparedHomeMotionEnd = (completion: EntryMotionCompletion) => {
    if (
      completion.kind === "target-enter" &&
      calendarPreparedHandoff?.requestId === completion.requestId
    ) {
      entryTransition.targetEnterFinished(completion.requestId);
    }
  };

  const widgetTargetForPager = widgetTargetForEntries(pendingWidgetTarget, effectiveDate, entries);
  const calendarPreparedEntry = calendarPreparedHandoff
    ? resolvePreparedHomeEntry(calendarPreparedHandoff)
    : null;
  const canonicalPreparedEntryNeedsReadiness = Boolean(
    calendarPreparedEntry?.artefacts[0] && !isUnknownArtefact(calendarPreparedEntry.artefacts[0]),
  );
  const calendarEntryContentReadinessRequest =
    calendarPreparedHandoff && calendarAdoptedRequestId === calendarPreparedHandoff.requestId
      ? {
          requestId: calendarPreparedHandoff.requestId,
          entryId: calendarPreparedEntry?.id ?? null,
        }
      : null;
  const handleEntryContentReady = (requestId: number, entryId: string) => {
    const targetEntryId = calendarPreparedEntry?.id ?? null;
    if (!calendarPreparedHandoff || requestId !== calendarPreparedHandoff.requestId) {
      return;
    }
    if (entryId === targetEntryId) {
      setCalendarCanonicalEntryReadyRequestId(requestId);
    }
  };

  const handlePreparedEntryContentReady = (requestId: number) => {
    if (calendarPreparedHandoff?.requestId === requestId) {
      entryTransition.targetReady(requestId);
    }
  };

  useEffect(() => {
    const handoff = calendarPreparedHandoff;
    if (
      !handoff ||
      entryTransition.state.requestId !== handoff.requestId ||
      entryTransition.state.target !== "prepared-home"
    ) {
      return;
    }
    const requestId = handoff.requestId;
    if (handoff.error || !calendarPreparedEntry) {
      entryTransition.targetReady(requestId);
    }
  }, [calendarPreparedEntry, calendarPreparedHandoff, entryTransition]);

  useEffect(() => {
    const { requestId, target, targetMounted, targetReady } = entryTransition.state;
    if (requestId == null || target !== "prepared-home" || !targetMounted || targetReady) {
      return;
    }
    const watchdog = setTimeout(() => {
      entryTransition.targetReady(requestId);
    }, 1000);
    return () => clearTimeout(watchdog);
  }, [entryTransition]);

  useEffect(() => {
    const handoff = calendarPreparedHandoff;
    if (
      !handoff ||
      handoff.error ||
      entryTransition.state.phase !== "settling" ||
      entryTransition.state.requestId !== handoff.requestId ||
      calendarAdoptedRequestId !== handoff.requestId ||
      handoff.day !== effectiveDate ||
      !canonicalPreparedEntryNeedsReadiness ||
      calendarCanonicalEntryReadyRequestId === handoff.requestId
    ) {
      return;
    }

    // Adoption has committed the canonical native tree behind the opaque cover.
    // Bound a missing Paper/Image callback without starting the clock while the
    // target is still absent or the route has not adopted its Day.
    const requestId = handoff.requestId;
    const watchdog = setTimeout(() => {
      setCalendarCanonicalEntryReadyRequestId(requestId);
    }, 1000);
    return () => clearTimeout(watchdog);
  }, [
    calendarAdoptedRequestId,
    calendarCanonicalEntryReadyRequestId,
    calendarPreparedHandoff,
    canonicalPreparedEntryNeedsReadiness,
    effectiveDate,
    entryTransition.state.phase,
    entryTransition.state.requestId,
  ]);

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

  useLayoutEffect(() => {
    if (
      !calendarPreparedHandoff ||
      entryTransition.state.phase !== "settling" ||
      entryTransition.state.requestId !== calendarPreparedHandoff.requestId ||
      entryTransition.state.target !== "prepared-home" ||
      calendarAdoptedRequestId !== calendarPreparedHandoff.requestId ||
      (!calendarPreparedHandoff.error && calendarPreparedHandoff.day !== effectiveDate) ||
      (!calendarPreparedHandoff.error &&
        canonicalPreparedEntryNeedsReadiness &&
        calendarCanonicalEntryReadyRequestId !== calendarPreparedHandoff.requestId)
    ) {
      return;
    }
    // Home already occupies final geometry behind the opaque prepared layer.
    // Retire that cover on the next frame only after the route has adopted the
    // same Day, preventing a post-animation flash.
    const requestId = calendarPreparedHandoff.requestId;
    const shouldRefreshCalendar =
      calendarPreparedHandoff.origin === "save" && !calendarPreparedHandoff.error;
    const retirePreparedFrame = requestAnimationFrame(() => {
      entryTransition.complete(requestId, "home");
      if (shouldRefreshCalendar) {
        bumpEntriesVersion();
      }
      calendarTransitionStateRef.current = null;
      setCalendarPreparedHandoff(null);
      setCalendarAdoptedRequestId(null);
      setCalendarCanonicalEntryReadyRequestId(null);
    });
    return () => cancelAnimationFrame(retirePreparedFrame);
  }, [
    calendarAdoptedRequestId,
    calendarCanonicalEntryReadyRequestId,
    calendarPreparedHandoff,
    calendarPreparedEntry,
    canonicalPreparedEntryNeedsReadiness,
    bumpEntriesVersion,
    effectiveDate,
    entryTransition,
  ]);

  useEffect(() => {
    return () => {
      calendarTransitionStateRef.current = null;
      pendingCalendarFailureRequestRef.current = null;
    };
  }, []);

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

  const homeIsInteractive =
    entryTransition.state.phase === "idle" && entryTransition.state.canonicalParticipant === "home";

  return (
    <View
      className="relative flex-1 bg-background"
      pointerEvents={homeIsInteractive ? "auto" : "none"}
      accessibilityElementsHidden={!homeIsInteractive}
      importantForAccessibility={homeIsInteractive ? "yes" : "no-hide-descendants"}
    >
      <HomeHeader
        date={effectiveDate}
        titles={entries.map((entry) => entry.title)}
        currentPage={currentPage}
        onCalendarPress={() => {
          calendarTransitionStateRef.current = null;
          pendingCalendarFailureRequestRef.current = null;
          clearPreparedCalendarTransition();
          setCalendarOpenRequestedAt(performance.now());
          setCalendarOpen(true);
        }}
      />

      <View className="relative flex-1">
        <EntrySurfaceMotion
          className="absolute inset-0"
          visible={homeBodyMotion.visible}
          instant={homeBodyMotion.instant}
          completion={homeBodyMotion.completion}
          viewportHeight={window.height}
          onMotionEnd={handleHomeBodyMotionEnd}
        >
          {error ? (
            <View className="flex-1 items-center justify-center gap-4 px-5">
              <Text className="text-center text-primary">
                Couldn&apos;t load entries for this day.
              </Text>
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
              entryContentReadinessRequest={
                calendarEntryContentReadinessRequest?.entryId
                  ? {
                      requestId: calendarEntryContentReadinessRequest.requestId,
                      entryId: calendarEntryContentReadinessRequest.entryId,
                    }
                  : null
              }
              onEntryContentReady={handleEntryContentReady}
            />
          )}
        </EntrySurfaceMotion>

        {calendarPreparedHandoff &&
        calendarPreparedHandoff.requestId === entryTransition.state.requestId ? (
          <EntrySurfaceMotion
            className="absolute inset-0 bg-background"
            visible={preparedHomeMotion.visible}
            instant={preparedHomeMotion.instant}
            completion={preparedHomeMotion.completion}
            viewportHeight={window.height}
            onMotionEnd={handlePreparedHomeMotionEnd}
            onLayout={() => {
              entryTransition.targetMounted(calendarPreparedHandoff.requestId);
            }}
            pointerEvents="none"
            accessibilityElementsHidden
            importantForAccessibility="no-hide-descendants"
          >
            {calendarPreparedHandoff.error ? (
              <View className="flex-1 items-center justify-center gap-4 px-5">
                <Text className="text-center text-primary">
                  Couldn&apos;t load entries for this day.
                </Text>
                <View className="rounded-full border border-controls-border bg-controls-background px-5 py-2">
                  <Text className="text-primary">Try again</Text>
                </View>
              </View>
            ) : !calendarPreparedEntry ? (
              <View className="flex-1 items-center justify-center px-5">
                <Text className="text-center text-primary">No entries for this day.</Text>
              </View>
            ) : (
              <View className="flex-1 items-center justify-center px-5">
                <PreparedHomeEntry
                  entry={calendarPreparedEntry}
                  requestId={calendarPreparedHandoff.requestId}
                  onContentReady={handlePreparedEntryContentReady}
                />
              </View>
            )}
          </EntrySurfaceMotion>
        ) : null}
      </View>
      <CalendarSheet
        dataVersion={entriesVersion}
        open={calendarOpen}
        openRequestedAt={calendarOpenRequestedAt}
        selectedDay={effectiveDate}
        onOpenChange={setCalendarOpen}
        onDismissSettled={handleCalendarDismissSettled}
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
