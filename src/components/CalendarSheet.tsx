import { ModalBottomSheet } from "@swmansion/react-native-bottom-sheet";
import { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  BackHandler,
  type NativeSyntheticEvent,
  Pressable,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from "react-native";
import { AnimatedEdgeFadeView } from "react-native-edge-fade";
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import {
  formatMonthlyHeading,
  formatRecentHeading,
  type CalendarHeading,
} from "../data/calendarBrowse";
import {
  invalidateCalendarBrowseCaches,
  warmCalendarBrowseData,
} from "../data/calendarBrowseCache";
import { getUserCreationDay } from "../db/repositories/users";
import { todayISO } from "../utils/date";
import CalendarMonthlyTab from "./CalendarMonthlyTab";
import CalendarRecentTab from "./CalendarRecentTab";
import FeatureErrorBoundary from "./feature-error-boundary";
import { Icon } from "./Icon";

type CalendarTab = "recent" | "monthly";
type PositionChange = { index: number; position: number };

const SHEET_SURFACE = "#FFFFFF";
const SHEET_RADIUS = 24;
const TAB_FADE_MS = 160;
const BOTTOM_FADE_SIZE = 90;
const RECENT_HEADER_OPAQUE_HEIGHT = 146;
const MONTHLY_HEADER_OPAQUE_HEIGHT = 194;
const HEADER_FADE_SIZE = 36;

type CalendarSheetProps = {
  dataVersion: number;
  open: boolean;
  openRequestedAt: number | null;
  selectedDay: string;
  onOpenChange: (open: boolean) => void;
  onSelectDay: (day: string) => void;
  onSelectEntry: (day: string, entryId: string) => void;
};

function Heading({ heading }: { heading: CalendarHeading }) {
  return (
    <View
      accessible
      accessibilityRole="header"
      accessibilityLabel={`${heading.text} ${heading.year}`}
      style={styles.headingRow}
    >
      <Text style={styles.headingText}>{heading.text}</Text>
      <Text style={styles.headingYear}>{heading.year}</Text>
    </View>
  );
}

function BodyPlaceholder({ showActivity = true }: { showActivity?: boolean }) {
  return (
    <View style={styles.placeholderBody}>
      {showActivity ? <ActivityIndicator color="#79716B" /> : null}
    </View>
  );
}

export default function CalendarSheet({
  dataVersion,
  open,
  openRequestedAt,
  selectedDay,
  onOpenChange,
  onSelectDay,
  onSelectEntry,
}: CalendarSheetProps) {
  const window = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const sheetHeight = Math.max(320, window.height - Math.max(insets.top, 12));
  const [activeTab, setActiveTab] = useState<CalendarTab>("recent");
  const [contentMounted, setContentMounted] = useState(false);
  const [browseResetVersion, setBrowseResetVersion] = useState(0);
  const [recentFocusedDay, setRecentFocusedDay] = useState(() => todayISO());
  const [monthlyFocusedMonth, setMonthlyFocusedMonth] = useState(() => todayISO().slice(0, 7));
  const [presentationSelectedDay, setPresentationSelectedDay] = useState(selectedDay);
  const [creationDay, setCreationDay] = useState<string | null>(null);
  const [creationDayError, setCreationDayError] = useState<Error | null>(null);
  const previousOpenRef = useRef(false);
  const creationDayRequestRef = useRef<Promise<string> | null>(null);
  const mountedRef = useRef(true);
  const openStartedAtRef = useRef<number | null>(null);
  const openingMeasuredRef = useRef(false);
  const bottomFadeVisibleRef = useRef(false);
  const hasMoreBelowByTabRef = useRef<Record<CalendarTab, boolean>>({
    recent: false,
    monthly: false,
  });
  const recentOpacity = useSharedValue(1);
  const monthlyOpacity = useSharedValue(0);
  const bottomFade = useSharedValue(0);

  const recentStyle = useAnimatedStyle(() => ({ opacity: recentOpacity.get() }));
  const monthlyStyle = useAnimatedStyle(() => ({ opacity: monthlyOpacity.get() }));

  const loadCreationDay = () => {
    if (creationDayRequestRef.current) {
      return creationDayRequestRef.current;
    }
    const request = getUserCreationDay()
      .then((day) => {
        if (mountedRef.current && creationDayRequestRef.current === request) {
          setCreationDay(day);
          setCreationDayError(null);
        }
        return day;
      })
      .catch((error: unknown) => {
        if (mountedRef.current && creationDayRequestRef.current === request) {
          setCreationDayError(error instanceof Error ? error : new Error(String(error)));
          creationDayRequestRef.current = null;
        }
        throw error;
      });
    creationDayRequestRef.current = request;
    return request;
  };

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    const idleId = requestIdleCallback(() => {
      void Promise.allSettled([loadCreationDay(), warmCalendarBrowseData(todayISO())]).then(() => {
        if (mountedRef.current) {
          // Prepare both bounded, virtualized browse trees once while the
          // sheet is hidden. Retaining them avoids renderer/marker flashes on
          // every presentation without restoring the old whole-journal tree.
          setContentMounted(true);
        }
      });
    });
    return () => cancelIdleCallback(idleId);
  }, []);

  useEffect(() => {
    invalidateCalendarBrowseCaches();
  }, [dataVersion]);

  useEffect(() => {
    if (open && !previousOpenRef.current) {
      openStartedAtRef.current = openRequestedAt ?? performance.now();
      openingMeasuredRef.current = false;
      const today = todayISO();
      setRecentFocusedDay(today);
      setMonthlyFocusedMonth(today.slice(0, 7));
      setPresentationSelectedDay(selectedDay);
      recentOpacity.set(activeTab === "recent" ? 1 : 0);
      monthlyOpacity.set(activeTab === "monthly" ? 1 : 0);
      const hasMoreBelow = hasMoreBelowByTabRef.current[activeTab];
      bottomFadeVisibleRef.current = hasMoreBelow;
      bottomFade.set(hasMoreBelow ? BOTTOM_FADE_SIZE : 0);
      void loadCreationDay().catch(() => {});
      const frame = requestAnimationFrame(() => setContentMounted(true));
      previousOpenRef.current = true;
      return () => cancelAnimationFrame(frame);
    }
    if (!open) {
      previousOpenRef.current = false;
    }
  }, [activeTab, bottomFade, monthlyOpacity, open, openRequestedAt, recentOpacity, selectedDay]);

  useEffect(() => {
    if (!open) {
      return;
    }
    const subscription = BackHandler.addEventListener("hardwareBackPress", () => {
      onOpenChange(false);
      return true;
    });
    return () => subscription.remove();
  }, [onOpenChange, open]);

  const requestClose = () => {
    onOpenChange(false);
  };

  const setHasMoreBelow = (hasMoreBelow: boolean) => {
    if (bottomFadeVisibleRef.current === hasMoreBelow) {
      return;
    }
    bottomFadeVisibleRef.current = hasMoreBelow;
    bottomFade.set(
      withTiming(hasMoreBelow ? BOTTOM_FADE_SIZE : 0, {
        duration: 140,
        easing: Easing.out(Easing.quad),
      }),
    );
  };

  const selectTab = (nextTab: CalendarTab) => {
    if (nextTab === activeTab) {
      return;
    }
    setActiveTab(nextTab);
    bottomFadeVisibleRef.current = false;
    bottomFade.set(0);
    const transition = { duration: TAB_FADE_MS, easing: Easing.out(Easing.quad) };
    recentOpacity.set(withTiming(nextTab === "recent" ? 1 : 0, transition));
    monthlyOpacity.set(withTiming(nextTab === "monthly" ? 1 : 0, transition));
    setHasMoreBelow(hasMoreBelowByTabRef.current[nextTab]);
  };

  const renderTab = (tab: CalendarTab) => {
    if (tab === "recent") {
      return (
        <CalendarRecentTab
          key={`recent:${dataVersion}`}
          resetVersion={browseResetVersion}
          onFocusedDayChange={setRecentFocusedDay}
          onHasMoreBelowChange={(hasMoreBelow) => {
            hasMoreBelowByTabRef.current.recent = hasMoreBelow;
            if (activeTab === "recent") {
              setHasMoreBelow(hasMoreBelow);
            }
          }}
          onSelectEntry={(day, entryId) => {
            onSelectEntry(day, entryId);
            requestClose();
          }}
        />
      );
    }

    if (creationDayError) {
      return (
        <View style={styles.creationError}>
          <Text style={styles.creationErrorText}>Couldn&apos;t load the calendar range.</Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Retry loading calendar range"
            style={styles.retryButton}
            onPress={() => {
              setCreationDayError(null);
              void loadCreationDay().catch(() => {});
            }}
          >
            <Text style={styles.retryText}>Try again</Text>
          </Pressable>
        </View>
      );
    }
    if (!creationDay) {
      return <BodyPlaceholder />;
    }
    const currentDay = todayISO();
    // A device clock moving backwards must not turn the month range empty and
    // hand FlashList an invalid initial index. The persisted Creation Day is
    // still the normal lower bound; this clamp is only a crash-safe fallback.
    const rangeStartDay = creationDay <= currentDay ? creationDay : currentDay;
    return (
      <CalendarMonthlyTab
        key={`monthly:${dataVersion}`}
        resetVersion={browseResetVersion}
        minDay={rangeStartDay}
        maxDay={currentDay}
        selectedDay={presentationSelectedDay}
        onFocusedMonthChange={setMonthlyFocusedMonth}
        onHasMoreBelowChange={(hasMoreBelow) => {
          hasMoreBelowByTabRef.current.monthly = hasMoreBelow;
          if (activeTab === "monthly") {
            setHasMoreBelow(hasMoreBelow);
          }
        }}
        onSelectDay={(day) => {
          onSelectDay(day);
          requestClose();
        }}
      />
    );
  };

  const heading =
    activeTab === "recent"
      ? formatRecentHeading(recentFocusedDay)
      : formatMonthlyHeading(monthlyFocusedMonth);
  const headerOpaqueHeight =
    activeTab === "monthly" ? MONTHLY_HEADER_OPAQUE_HEIGHT : RECENT_HEADER_OPAQUE_HEIGHT;

  return (
    <ModalBottomSheet
      index={open ? 1 : 0}
      detents={[0, sheetHeight]}
      animateIn={false}
      extendUnderStatusBar
      scrimColor="rgba(0,0,0,0.35)"
      surface={<View style={[StyleSheet.absoluteFill, styles.surface]} />}
      onIndexChange={(index) => {
        if (index === 0 && open) {
          requestClose();
        }
      }}
      onPositionChange={(event: NativeSyntheticEvent<PositionChange>) => {
        if (event.nativeEvent.position > 0 && open) {
          if (!contentMounted) {
            setContentMounted(true);
          }
          if (!openingMeasuredRef.current && openStartedAtRef.current != null) {
            openingMeasuredRef.current = true;
            if (__DEV__) {
              console.info("Calendar sheet tap-to-motion", {
                durationMs: performance.now() - openStartedAtRef.current,
              });
            }
          }
        }
      }}
      onSettle={(index) => {
        if (index === 0 && !open) {
          // Reset retained lists while they are hidden so their first visible
          // frame in the next presentation is already at newest/current.
          setBrowseResetVersion((current) => current + 1);
          recentOpacity.set(activeTab === "recent" ? 1 : 0);
          monthlyOpacity.set(activeTab === "monthly" ? 1 : 0);
          bottomFadeVisibleRef.current = false;
          bottomFade.set(0);
        }
      }}
    >
      <View
        style={[
          styles.sheetViewport,
          { height: sheetHeight, paddingBottom: Math.max(insets.bottom, 12) },
        ]}
      >
        <View style={styles.handle} />
        <AnimatedEdgeFadeView
          mode="overlay"
          color={SHEET_SURFACE}
          top={0}
          bottom={bottomFade}
          radius={SHEET_RADIUS}
          style={styles.body}
        >
          {contentMounted ? (
            <FeatureErrorBoundary
              featureName="calendar-sheet"
              title="Couldn’t show the calendar."
              onDismiss={requestClose}
            >
              <View style={StyleSheet.absoluteFill}>
                {(["recent", "monthly"] as const).map((tab) => {
                  const isActive = tab === activeTab;
                  return (
                    <Animated.View
                      key={tab}
                      pointerEvents={isActive ? "auto" : "none"}
                      accessibilityElementsHidden={!isActive}
                      importantForAccessibility={isActive ? "auto" : "no-hide-descendants"}
                      style={[
                        StyleSheet.absoluteFill,
                        tab === "recent" ? recentStyle : monthlyStyle,
                        isActive ? styles.activeTabBody : styles.outgoingTabBody,
                      ]}
                    >
                      {renderTab(tab)}
                    </Animated.View>
                  );
                })}
              </View>
            </FeatureErrorBoundary>
          ) : (
            <BodyPlaceholder showActivity={open} />
          )}
        </AnimatedEdgeFadeView>

        <View pointerEvents="none" style={[styles.headerScrim, { height: headerOpaqueHeight }]} />
        <AnimatedEdgeFadeView
          pointerEvents="none"
          mode="overlay"
          color={SHEET_SURFACE}
          top={HEADER_FADE_SIZE}
          bottom={0}
          style={[styles.headerFade, { height: HEADER_FADE_SIZE, top: headerOpaqueHeight }]}
        >
          <View style={StyleSheet.absoluteFill} />
        </AnimatedEdgeFadeView>

        <View pointerEvents="box-none" style={styles.header}>
          <View accessibilityRole="tablist" style={styles.tabs}>
            <Pressable
              accessibilityRole="tab"
              accessibilityState={{ selected: activeTab === "recent" }}
              onPress={() => selectTab("recent")}
              hitSlop={8}
            >
              <Text style={activeTab === "recent" ? styles.tabActive : styles.tabIdle}>Recent</Text>
            </Pressable>
            <Pressable
              accessibilityRole="tab"
              accessibilityState={{ selected: activeTab === "monthly" }}
              onPress={() => selectTab("monthly")}
              hitSlop={8}
            >
              <Text style={activeTab === "monthly" ? styles.tabActive : styles.tabIdle}>
                Monthly
              </Text>
            </Pressable>
          </View>
          <Heading heading={heading} />
          {activeTab === "monthly" ? (
            <View style={styles.weekdays}>
              {["M", "T", "W", "T", "F", "S", "S"].map((label, index) => (
                <Text key={index} style={styles.weekday}>
                  {label}
                </Text>
              ))}
            </View>
          ) : null}
        </View>

        <Pressable
          onPress={requestClose}
          accessibilityRole="button"
          accessibilityLabel="Close calendar"
          className="absolute top-5 right-5 z-30 h-10 w-10 items-center justify-center rounded-full bg-white shadow-md"
        >
          <Icon name="x-mark" size={20} color="#79716B" />
        </Pressable>
      </View>
    </ModalBottomSheet>
  );
}

const styles = StyleSheet.create({
  surface: {
    backgroundColor: SHEET_SURFACE,
    borderTopLeftRadius: SHEET_RADIUS,
    borderTopRightRadius: SHEET_RADIUS,
  },
  sheetViewport: {
    backgroundColor: SHEET_SURFACE,
    borderTopLeftRadius: SHEET_RADIUS,
    borderTopRightRadius: SHEET_RADIUS,
    overflow: "hidden",
  },
  handle: {
    alignSelf: "center",
    backgroundColor: "#D6D3D1",
    borderRadius: 2,
    height: 4,
    marginTop: 10,
    position: "absolute",
    width: 36,
    zIndex: 40,
  },
  body: {
    flex: 1,
  },
  headerScrim: {
    backgroundColor: SHEET_SURFACE,
    left: 0,
    position: "absolute",
    right: 0,
    top: 0,
    zIndex: 10,
  },
  headerFade: {
    left: 0,
    position: "absolute",
    right: 0,
    zIndex: 10,
  },
  activeTabBody: {
    zIndex: 2,
  },
  outgoingTabBody: {
    zIndex: 1,
  },
  header: {
    left: 0,
    paddingHorizontal: 20,
    position: "absolute",
    right: 0,
    top: 54,
    zIndex: 20,
  },
  tabs: {
    flexDirection: "row",
    gap: 18,
  },
  tabActive: {
    color: "#171717",
    fontFamily: "Geist-Regular",
    fontSize: 18,
    lineHeight: 24,
  },
  tabIdle: {
    color: "#A8A29E",
    fontFamily: "Geist-Regular",
    fontSize: 18,
    lineHeight: 24,
  },
  headingRow: {
    alignItems: "baseline",
    flexDirection: "row",
    gap: 10,
    marginTop: 24,
  },
  headingText: {
    color: "#171717",
    fontFamily: "Geist-Medium",
    fontSize: 29,
    lineHeight: 36,
  },
  headingYear: {
    color: "#79716B",
    fontFamily: "GeistMono-Regular",
    fontSize: 18,
    lineHeight: 24,
  },
  weekdays: {
    alignSelf: "center",
    flexDirection: "row",
    marginTop: 25,
    maxWidth: 600,
    width: "100%",
  },
  weekday: {
    color: "#171717",
    flex: 1,
    fontFamily: "Geist-Medium",
    fontSize: 17,
    textAlign: "center",
  },
  placeholderBody: {
    alignItems: "center",
    flex: 1,
    justifyContent: "center",
  },
  creationError: {
    alignItems: "center",
    flex: 1,
    gap: 14,
    justifyContent: "center",
    paddingHorizontal: 24,
  },
  creationErrorText: {
    color: "#252525",
    fontFamily: "Geist-Regular",
    fontSize: 16,
  },
  retryButton: {
    borderColor: "#DEDAD7",
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: 18,
    paddingVertical: 9,
  },
  retryText: {
    color: "#252525",
    fontFamily: "Geist-Medium",
    fontSize: 14,
  },
});
