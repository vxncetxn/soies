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
import { scheduleOnRN } from "react-native-worklets";

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
import CalendarMonthlyTab, { MONTHLY_CONTENT_TOP } from "./CalendarMonthlyTab";
import CalendarRecentTab, {
  RECENT_CONTENT_TOP,
  type RecentTabSessionState,
} from "./CalendarRecentTab";
import FeatureErrorBoundary from "./feature-error-boundary";
import { Icon } from "./Icon";

type CalendarTab = "recent" | "monthly";
type PositionChange = { index: number; position: number };

const SHEET_SURFACE = "#FFFFFF";
const TAB_FADE_MS = 160;
const BOTTOM_FADE_SIZE = 90;

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
  const [outgoingTab, setOutgoingTab] = useState<CalendarTab | null>(null);
  const [savedOffsets, setSavedOffsets] = useState<Record<CalendarTab, number | null>>({
    recent: 0,
    monthly: null,
  });
  const [recentSessionState, setRecentSessionState] = useState<RecentTabSessionState | null>(null);
  const [contentMounted, setContentMounted] = useState(false);
  const [sessionKey, setSessionKey] = useState(0);
  const [recentFocusedDay, setRecentFocusedDay] = useState(() => todayISO());
  const [monthlyFocusedMonth, setMonthlyFocusedMonth] = useState(() => todayISO().slice(0, 7));
  const [presentationSelectedDay, setPresentationSelectedDay] = useState(selectedDay);
  const [creationDay, setCreationDay] = useState<string | null>(null);
  const [creationDayError, setCreationDayError] = useState<Error | null>(null);
  const previousOpenRef = useRef(false);
  const creationDayRequestRef = useRef<Promise<string> | null>(null);
  const mountedRef = useRef(true);
  const recentOffsetRef = useRef(0);
  const monthlyOffsetRef = useRef(0);
  const openStartedAtRef = useRef<number | null>(null);
  const openingMeasuredRef = useRef(false);
  const bottomFadeVisibleRef = useRef(false);
  const tabProgress = useSharedValue(1);
  const bottomFade = useSharedValue(0);

  const activeStyle = useAnimatedStyle(() => ({ opacity: tabProgress.get() }));
  const outgoingStyle = useAnimatedStyle(() => ({ opacity: 1 - tabProgress.get() }));

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
      void loadCreationDay().catch(() => {});
      void warmCalendarBrowseData(todayISO());
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
      recentOffsetRef.current = 0;
      monthlyOffsetRef.current = 0;
      setSavedOffsets({ recent: 0, monthly: null });
      setRecentSessionState(null);
      const today = todayISO();
      setRecentFocusedDay(today);
      setMonthlyFocusedMonth(today.slice(0, 7));
      setPresentationSelectedDay(selectedDay);
      setSessionKey((current) => current + 1);
      bottomFadeVisibleRef.current = false;
      bottomFade.set(0);
      void loadCreationDay().catch(() => {});
      const frame = requestAnimationFrame(() => setContentMounted(true));
      previousOpenRef.current = true;
      return () => cancelAnimationFrame(frame);
    }
    if (!open) {
      previousOpenRef.current = false;
    }
  }, [bottomFade, open, openRequestedAt, selectedDay]);

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
    setOutgoingTab(activeTab);
    // Snapshot refs only at the tab boundary; scroll itself stays out of React
    // state, while the remounted tab receives a render-safe saved offset.
    setSavedOffsets((current) => ({
      ...current,
      [activeTab]: activeTab === "recent" ? recentOffsetRef.current : monthlyOffsetRef.current,
    }));
    setActiveTab(nextTab);
    bottomFadeVisibleRef.current = false;
    bottomFade.set(0);
    tabProgress.set(0);
    tabProgress.set(
      withTiming(1, { duration: TAB_FADE_MS, easing: Easing.out(Easing.quad) }, (finished) => {
        if (finished) {
          scheduleOnRN(setOutgoingTab, null);
        }
      }),
    );
  };

  const renderTab = (tab: CalendarTab) => {
    if (tab === "recent") {
      return (
        <CalendarRecentTab
          key={`recent:${sessionKey}:${dataVersion}`}
          initialState={recentSessionState}
          initialOffset={savedOffsets.recent ?? 0}
          onOffsetChange={(offset) => {
            recentOffsetRef.current = offset;
          }}
          onFocusedDayChange={setRecentFocusedDay}
          onHasMoreBelowChange={(hasMoreBelow) => {
            if (activeTab === "recent") {
              setHasMoreBelow(hasMoreBelow);
            }
          }}
          onSelectEntry={(day, entryId) => {
            onSelectEntry(day, entryId);
            requestClose();
          }}
          onSessionStateChange={setRecentSessionState}
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
        key={`monthly:${sessionKey}:${dataVersion}`}
        initialOffset={savedOffsets.monthly}
        initialFocusedMonth={monthlyFocusedMonth}
        minDay={rangeStartDay}
        maxDay={currentDay}
        selectedDay={presentationSelectedDay}
        onOffsetChange={(offset) => {
          monthlyOffsetRef.current = offset;
        }}
        onFocusedMonthChange={setMonthlyFocusedMonth}
        onHasMoreBelowChange={(hasMoreBelow) => {
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
  const topFadeSize = activeTab === "monthly" ? MONTHLY_CONTENT_TOP : RECENT_CONTENT_TOP;

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
          setContentMounted(false);
          setOutgoingTab(null);
          setRecentSessionState(null);
          bottomFadeVisibleRef.current = false;
          bottomFade.set(0);
        }
      }}
    >
      <View style={{ height: sheetHeight, paddingBottom: Math.max(insets.bottom, 12) }}>
        <View style={styles.handle} />
        <AnimatedEdgeFadeView
          mode="overlay"
          color={SHEET_SURFACE}
          top={topFadeSize}
          bottom={bottomFade}
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
                  if (!isActive && tab !== outgoingTab) {
                    return null;
                  }
                  return (
                    <Animated.View
                      key={tab}
                      pointerEvents={isActive ? "auto" : "none"}
                      style={[
                        StyleSheet.absoluteFill,
                        isActive ? activeStyle : outgoingStyle,
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
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
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
