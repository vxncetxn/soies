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
 * Calendar-origin navigation starts the selected Day query during native
 * dismissal and mounts its result below the viewport. Only after dismissal
 * settles does the old body exit; the prepared body then enters immediately
 * when ready. The canonical Day is adopted behind that stationary cover so
 * its native mount cannot interrupt the entrance animation.
 */
import { type ErrorBoundaryProps, useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { ActivityIndicator, Alert, Pressable, Text, View, useWindowDimensions } from "react-native";
import Animated, {
  Easing,
  ReduceMotion,
  useAnimatedScrollHandler,
  useAnimatedStyle,
  useDerivedValue,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { scheduleOnRN, scheduleOnUI } from "react-native-worklets";

import AppErrorFallback from "../components/app-error-fallback";
import CalendarPreparedEntry from "../components/CalendarPreparedEntry";
import CalendarSheet from "../components/CalendarSheet";
import { useEntriesVersion } from "../components/CreateContext";
import CreateEntryButton from "../components/CreateEntryButton";
import DayPager from "../components/DayPager";
import { ExpandProvider } from "../components/ExpandContext";
import FeaturedArtefactsButton from "../components/FeaturedArtefactsButton";
import HomeHeader from "../components/HomeHeader";
import {
  CalendarNavigationCoordinator,
  type CalendarNavigationHandoff,
} from "../data/calendarNavigationTransition";
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
const CALENDAR_ENTRY_EXIT_MS = 350;
const CALENDAR_ENTRY_REVEAL_MS = 350;

type PreparedCalendarHandoff = CalendarNavigationHandoff & {
  requestId: number;
};

type CalendarTransitionState = {
  requestId: number;
  sheetDismissed: boolean;
};

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
  const [calendarHandoff, setCalendarHandoff] = useState<CalendarNavigationHandoff | null>(null);
  const [calendarPreparedHandoff, setCalendarPreparedHandoff] =
    useState<PreparedCalendarHandoff | null>(null);
  const [calendarEntranceHandoff, setCalendarEntranceHandoff] =
    useState<PreparedCalendarHandoff | null>(null);
  const [calendarNavigationCoordinator] = useState(() => new CalendarNavigationCoordinator());
  const [calendarExitFinishedRequestId, setCalendarExitFinishedRequestId] = useState<number | null>(
    null,
  );
  const [calendarEntranceFinishedRequestId, setCalendarEntranceFinishedRequestId] = useState<
    number | null
  >(null);
  const [calendarAdoptedRequestId, setCalendarAdoptedRequestId] = useState<number | null>(null);
  const [calendarCanonicalEntryReadyRequestId, setCalendarCanonicalEntryReadyRequestId] = useState<
    number | null
  >(null);
  const [calendarBodyTransitionActive, setCalendarBodyTransitionActive] = useState(false);
  const [calendarOpen, setCalendarOpen] = useState(false);
  const [calendarOpenRequestedAt, setCalendarOpenRequestedAt] = useState<number | null>(null);
  const consumedWidgetSignatureRef = useRef<string | null>(null);
  const widgetValidationRequestRef = useRef(0);
  const skipNextDayLoadRef = useRef<string | null>(null);
  const calendarEntranceStartedRequestIdRef = useRef<number | null>(null);
  const calendarTransitionStateRef = useRef<CalendarTransitionState | null>(null);
  const pendingCalendarFailureRequestRef = useRef<number | null>(null);
  const calendarRevealProgress = useSharedValue(1);
  const calendarEntranceProgress = useSharedValue(0);
  const calendarPreparedCommitRequestId = useSharedValue(0);
  const calendarExitCompletedRequestId = useSharedValue(0);
  const calendarEntranceStartedRequestId = useSharedValue(0);
  const calendarRevealStyle = useAnimatedStyle(() => {
    const progress = calendarRevealProgress.get();
    return {
      opacity: progress,
      transform: [{ translateY: (1 - progress) * window.height }],
    };
  });
  const calendarEntranceStyle = useAnimatedStyle(() => {
    const progress = calendarEntranceProgress.get();
    return {
      opacity: progress,
      transform: [{ translateY: (1 - progress) * window.height }],
    };
  });

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
      matchingHandoff ? (matchingHandoff.entryId ?? matchingHandoff.entries[0]?.id ?? null) : null,
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

  const adoptCalendarHandoff = (handoff: CalendarNavigationHandoff) => {
    const targetEntryId = handoff.entryId ?? handoff.entries[0]?.id ?? null;
    setError(null);

    if (handoff.day === effectiveDate) {
      setEntries(handoff.entries);
      setLoading(false);
      setPendingCalendarEntryId(targetEntryId);
    } else {
      setCalendarHandoff(handoff);
    }
  };

  // The prepared Entry owns the entrance animation. Keep canonical Home
  // unchanged until that animation settles so mounting a complete Day cannot
  // contend with its main-thread frames.
  if (
    calendarPreparedHandoff &&
    calendarExitFinishedRequestId === calendarPreparedHandoff.requestId &&
    calendarEntranceHandoff?.requestId !== calendarPreparedHandoff.requestId
  ) {
    setCalendarEntranceHandoff(calendarPreparedHandoff);
  }

  // The prepared layer is now stationary and opaque. Adopt the complete Day
  // behind it, then retire the cover only after the canonical Paper is ready.
  if (
    calendarPreparedHandoff &&
    calendarEntranceFinishedRequestId === calendarPreparedHandoff.requestId &&
    calendarAdoptedRequestId !== calendarPreparedHandoff.requestId
  ) {
    setCalendarAdoptedRequestId(calendarPreparedHandoff.requestId);
    adoptCalendarHandoff(calendarPreparedHandoff);
  }

  const clearPreparedCalendarTransition = () => {
    calendarEntranceStartedRequestIdRef.current = null;
    calendarEntranceProgress.set(0);
    calendarPreparedCommitRequestId.set(0);
    calendarExitCompletedRequestId.set(0);
    calendarEntranceStartedRequestId.set(0);
    setCalendarPreparedHandoff(null);
    setCalendarEntranceHandoff(null);
    setCalendarExitFinishedRequestId(null);
    setCalendarEntranceFinishedRequestId(null);
    setCalendarAdoptedRequestId(null);
    setCalendarCanonicalEntryReadyRequestId(null);
  };

  const restoreCalendarBodyAfterFailure = () => {
    calendarRevealProgress.set(
      withTiming(1, {
        duration: CALENDAR_ENTRY_EXIT_MS,
        easing: Easing.out(Easing.cubic),
        reduceMotion: ReduceMotion.System,
      }),
    );
  };

  const showCalendarNavigationFailure = () => {
    // A failed selection never replaces `entries`, so return the unchanged Day
    // from below before the alert is dismissed or Calendar is opened again.
    clearPreparedCalendarTransition();
    setCalendarBodyTransitionActive(false);
    restoreCalendarBodyAfterFailure();
    Alert.alert("Couldn’t open this day.", "Please try again.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Open calendar",
        onPress: () => {
          calendarNavigationCoordinator.cancel();
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
    setCalendarBodyTransitionActive(true);
    const requestId = calendarNavigationCoordinator.begin(day, entryId);
    calendarTransitionStateRef.current = { requestId, sheetDismissed: false };
    calendarEntranceProgress.set(0);
    calendarPreparedCommitRequestId.set(0);
    calendarExitCompletedRequestId.set(0);
    calendarEntranceStartedRequestId.set(0);

    void loadEntriesCached(day, () => getEntriesByDate(day))
      .then((nextEntries) => {
        const transition = calendarTransitionStateRef.current;
        if (transition?.requestId === requestId) {
          setCalendarPreparedHandoff({ requestId, day, entryId, entries: nextEntries });
        }
        calendarNavigationCoordinator.resolve(requestId, nextEntries);
      })
      .catch((nextError: unknown) => {
        if (!calendarNavigationCoordinator.reject(requestId)) {
          return;
        }
        if (__DEV__) {
          console.warn("Calendar Day load failed", nextError);
        }
        const transition = calendarTransitionStateRef.current;
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
    if (!calendarNavigationCoordinator.sheetDismissed(requestId)) {
      return;
    }
    // Native dismissal has completely settled at zero. Only now may the old
    // Home body start its visible exit; the Day query has already been running
    // throughout the sheet collapse and may have staged its replacement below.
    calendarRevealProgress.set(
      withTiming(
        0,
        {
          duration: CALENDAR_ENTRY_EXIT_MS,
          easing: Easing.in(Easing.cubic),
          reduceMotion: ReduceMotion.System,
        },
        (finished) => {
          if (finished) {
            calendarExitCompletedRequestId.set(requestId);
            scheduleOnRN(setCalendarExitFinishedRequestId, requestId);
            if (
              calendarPreparedCommitRequestId.get() === requestId &&
              calendarEntranceStartedRequestId.get() !== requestId
            ) {
              calendarEntranceStartedRequestId.set(requestId);
              calendarEntranceProgress.set(
                withTiming(
                  1,
                  {
                    duration: CALENDAR_ENTRY_REVEAL_MS,
                    easing: Easing.out(Easing.cubic),
                    reduceMotion: ReduceMotion.System,
                  },
                  (entranceFinished) => {
                    if (entranceFinished) {
                      // The prepared layer is fully opaque now. Return Home to
                      // final geometry before React mounts the canonical Day
                      // behind it, avoiding clipping churn and animated work.
                      calendarRevealProgress.set(1);
                      scheduleOnRN(setCalendarEntranceFinishedRequestId, requestId);
                    }
                  },
                ),
              );
            }
          }
        },
      ),
    );
  };

  const widgetTargetForPager = widgetTargetForEntries(pendingWidgetTarget, effectiveDate, entries);
  const calendarPreparedEntry = calendarPreparedHandoff
    ? (calendarPreparedHandoff.entries.find(
        (entry) => entry.id === calendarPreparedHandoff.entryId,
      ) ??
      calendarPreparedHandoff.entries[0] ??
      null)
    : null;
  const calendarEntryContentReadinessRequest = calendarPreparedHandoff
    ? {
        requestId: calendarPreparedHandoff.requestId,
        entryId: calendarPreparedHandoff.entryId ?? calendarPreparedHandoff.entries[0]?.id ?? null,
      }
    : null;
  const handleEntryContentReady = (requestId: number, entryId: string) => {
    const targetEntryId =
      calendarPreparedHandoff?.entryId ?? calendarPreparedHandoff?.entries[0]?.id ?? null;
    if (!calendarPreparedHandoff || requestId !== calendarPreparedHandoff.requestId) {
      return;
    }
    if (entryId === targetEntryId) {
      setCalendarCanonicalEntryReadyRequestId(requestId);
    }
  };

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
    if (!calendarPreparedHandoff) {
      calendarPreparedCommitRequestId.set(0);
      return;
    }
    const requestId = calendarPreparedHandoff.requestId;
    // This signal is written only after React has committed the off-screen
    // prepared Day. If the exit already finished, start the late-data entrance
    // here; otherwise its UI-thread completion callback starts it immediately.
    // Keeping the readiness check and write on the UI runtime avoids a lost
    // wake-up if React commits preparation in the same frame that exit settles.
    scheduleOnUI(() => {
      "worklet";
      calendarPreparedCommitRequestId.set(requestId);
      if (
        calendarExitCompletedRequestId.get() === requestId &&
        calendarEntranceStartedRequestId.get() !== requestId
      ) {
        calendarEntranceStartedRequestId.set(requestId);
        calendarEntranceProgress.set(
          withTiming(
            1,
            {
              duration: CALENDAR_ENTRY_REVEAL_MS,
              easing: Easing.out(Easing.cubic),
              reduceMotion: ReduceMotion.System,
            },
            (finished) => {
              if (finished) {
                calendarRevealProgress.set(1);
                scheduleOnRN(setCalendarEntranceFinishedRequestId, requestId);
              }
            },
          ),
        );
      }
    });
  }, [
    calendarEntranceProgress,
    calendarEntranceStartedRequestId,
    calendarExitCompletedRequestId,
    calendarPreparedCommitRequestId,
    calendarPreparedHandoff,
    calendarRevealProgress,
  ]);

  useLayoutEffect(() => {
    if (calendarExitFinishedRequestId == null) {
      return;
    }
    calendarNavigationCoordinator.exitFinished(calendarExitFinishedRequestId);
  }, [calendarExitFinishedRequestId, calendarNavigationCoordinator]);

  useLayoutEffect(() => {
    if (
      !calendarPreparedHandoff ||
      !calendarEntranceHandoff ||
      calendarPreparedHandoff.requestId !== calendarEntranceHandoff.requestId ||
      calendarEntranceStartedRequestIdRef.current === calendarEntranceHandoff.requestId
    ) {
      return;
    }
    const requestId = calendarEntranceHandoff.requestId;
    calendarEntranceStartedRequestIdRef.current = requestId;
    calendarTransitionStateRef.current = null;
  }, [calendarEntranceHandoff, calendarPreparedHandoff]);

  useLayoutEffect(() => {
    if (
      calendarEntranceFinishedRequestId == null ||
      calendarPreparedHandoff?.requestId !== calendarEntranceFinishedRequestId ||
      calendarPreparedHandoff.day !== effectiveDate ||
      (calendarPreparedEntry?.type === "paper" &&
        calendarPreparedEntry.artefacts.length > 0 &&
        calendarCanonicalEntryReadyRequestId !== calendarEntranceFinishedRequestId)
    ) {
      return;
    }
    // Home already occupies final geometry behind the opaque prepared layer.
    // Retire that cover on the next frame only after the route has adopted the
    // same Day, preventing a post-animation flash.
    const retirePreparedFrame = requestAnimationFrame(() => {
      if (calendarEntranceStartedRequestIdRef.current !== calendarEntranceFinishedRequestId) {
        return;
      }
      calendarEntranceStartedRequestIdRef.current = null;
      calendarEntranceProgress.set(0);
      calendarPreparedCommitRequestId.set(0);
      calendarExitCompletedRequestId.set(0);
      calendarEntranceStartedRequestId.set(0);
      setCalendarPreparedHandoff(null);
      setCalendarEntranceHandoff(null);
      setCalendarExitFinishedRequestId(null);
      setCalendarEntranceFinishedRequestId(null);
      setCalendarAdoptedRequestId(null);
      setCalendarCanonicalEntryReadyRequestId(null);
      setCalendarBodyTransitionActive(false);
    });
    return () => cancelAnimationFrame(retirePreparedFrame);
  }, [
    calendarEntranceFinishedRequestId,
    calendarEntranceProgress,
    calendarEntranceStartedRequestId,
    calendarCanonicalEntryReadyRequestId,
    calendarExitCompletedRequestId,
    calendarPreparedCommitRequestId,
    calendarPreparedHandoff,
    calendarPreparedEntry,
    effectiveDate,
  ]);

  useEffect(
    () => () => {
      calendarNavigationCoordinator.cancel();
      calendarTransitionStateRef.current = null;
      pendingCalendarFailureRequestRef.current = null;
    },
    [calendarNavigationCoordinator],
  );

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
          calendarNavigationCoordinator.cancel();
          calendarTransitionStateRef.current = null;
          pendingCalendarFailureRequestRef.current = null;
          clearPreparedCalendarTransition();
          setCalendarBodyTransitionActive(false);
          restoreCalendarBodyAfterFailure();
          setCalendarOpenRequestedAt(performance.now());
          setCalendarOpen(true);
        }}
      />

      <View className="relative flex-1">
        <Animated.View
          className="absolute inset-0"
          style={calendarRevealStyle}
          pointerEvents={calendarBodyTransitionActive ? "none" : "auto"}
          accessibilityElementsHidden={calendarBodyTransitionActive}
          importantForAccessibility={calendarBodyTransitionActive ? "no-hide-descendants" : "auto"}
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
        </Animated.View>

        {calendarPreparedHandoff ? (
          <Animated.View
            className="absolute inset-0 bg-background"
            style={calendarEntranceStyle}
            pointerEvents="none"
            accessibilityElementsHidden
            importantForAccessibility="no-hide-descendants"
          >
            {!calendarPreparedEntry ? (
              <View className="flex-1 items-center justify-center px-5">
                <Text className="text-center text-primary">No entries for this day.</Text>
              </View>
            ) : (
              <View className="flex-1 items-center justify-center px-5">
                <CalendarPreparedEntry entry={calendarPreparedEntry} />
              </View>
            )}
          </Animated.View>
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
