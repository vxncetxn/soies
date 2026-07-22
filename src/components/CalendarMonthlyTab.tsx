import {
  Calendar,
  type CalendarActiveDateRange,
  type CalendarDayMetadata,
  useCalendar,
} from "@marceloterreiro/flash-calendar";
import { FlashList, type FlashListRef } from "@shopify/flash-list";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import {
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  Pressable,
  Text,
  View,
  type ViewToken,
  useWindowDimensions,
} from "react-native";
import { StyleSheet } from "react-native-unistyles";

import { LAYOUT } from "../constants/layout";
import {
  finalMonthTrailingPadding,
  formatMonthIndicator,
  formatRecentHeading,
  mondayFirstWeekCount,
  monthIdsBetween,
  nextMonthId,
  previousMonthId,
  resolveFocusedPeriod,
  type PeriodFrame,
} from "../data/calendarBrowse";
import { loadMonthTypePresence } from "../data/calendarBrowseCache";
import { fixedTokens } from "../styles/tokens";

const MONTHLY_CONTENT_INSET =
  LAYOUT.CALENDAR_SHEET.MONTHLY_CONTENT_TOP - LAYOUT.CALENDAR_SHEET.MONTHLY_HEADER_HEIGHT;
const CONTENT_GUTTER = 20;
const CONTENT_MAX_WIDTH = 600;
const DAY_HEIGHT = 44;
const MONTH_INDICATOR_HEIGHT = 24;
const WEEK_GAP = 6;
const MONTH_PADDING = 10;
const MONTH_GAP = 14;
const FOCUS_HYSTERESIS = 12;
const VIEWABILITY_CONFIG = { itemVisiblePercentThreshold: 1 };

type MonthItem = {
  id: string;
  height: number;
};

function monthHeight(monthId: string): number {
  const weeks = mondayFirstWeekCount(monthId);
  return (
    MONTH_PADDING * 2 + MONTH_INDICATOR_HEIGHT + weeks * DAY_HEIGHT + weeks * WEEK_GAP + MONTH_GAP
  );
}

function buildMonthFrames(items: readonly MonthItem[]): PeriodFrame[] {
  let offset = MONTHLY_CONTENT_INSET;
  return items.map((item) => {
    const frame = { id: item.id, start: offset, end: offset + item.height };
    offset = frame.end;
    return frame;
  });
}

function markerColors(types: readonly string[]): string[] {
  const colors: string[] = [];
  if (types.includes("paper")) {
    colors.push(fixedTokens.artefactType.paper);
  }
  if (types.includes("print")) {
    colors.push(fixedTokens.artefactType.printCalendar);
  }
  if (types.some((type) => type !== "paper" && type !== "print")) {
    colors.push(fixedTokens.artefactType.unknown);
  }
  return colors;
}

type MonthDayProps = {
  day: CalendarDayMetadata;
  markerTypes: readonly string[];
  selected: boolean;
  onPress: (day: string) => void;
};

function MonthDay({ day, markerTypes, selected, onPress }: MonthDayProps) {
  if (day.isDifferentMonth) {
    return <View style={styles.dayCell} />;
  }

  const disabled = day.state === "disabled";
  const colors = markerColors(markerTypes);
  const heading = formatRecentHeading(day.id);
  const markerLabels: string[] = [];
  if (markerTypes.includes("paper")) markerLabels.push("paper");
  if (markerTypes.includes("print")) markerLabels.push("print");
  if (markerTypes.some((type) => type !== "paper" && type !== "print")) {
    markerLabels.push("unsupported");
  }
  const markerLabel = markerLabels.join(", ");
  return (
    <Pressable
      onPress={() => onPress(day.id)}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={`${heading.text} ${heading.year}${markerLabel ? `, ${markerLabel} entries` : ""}`}
      accessibilityHint={disabled ? undefined : "Shows entries for this day on Home"}
      accessibilityState={{ disabled, selected }}
      style={({ pressed }) => [styles.dayCell, pressed && !disabled ? styles.dayPressed : null]}
    >
      <Text style={[styles.dayText, disabled ? styles.dayTextDisabled : null]}>
        {day.displayLabel}
      </Text>
      {selected ? <View style={styles.selectedUnderline} /> : null}
      {colors.length > 0 ? (
        <View style={styles.markerRow}>
          {colors.map((color) => (
            <View key={color} style={[styles.marker, { backgroundColor: color }]} />
          ))}
        </View>
      ) : null}
    </Pressable>
  );
}

type MonthGridProps = {
  focused: boolean;
  markerTypesByDay: ReadonlyMap<string, readonly string[]>;
  maxDay: string;
  minDay: string;
  monthId: string;
  selectedDay: string;
  width: number;
  onSelectDay: (day: string) => void;
};

function MonthGrid({
  focused,
  markerTypesByDay,
  maxDay,
  minDay,
  monthId,
  selectedDay,
  width,
  onSelectDay,
}: MonthGridProps) {
  const activeDateRanges: CalendarActiveDateRange[] = [
    { startId: selectedDay, endId: selectedDay },
  ];
  const { weeksList } = useCalendar({
    calendarMonthId: `${monthId}-01`,
    calendarMinDateId: minDay,
    calendarMaxDateId: maxDay,
    calendarFirstDayOfWeek: "monday",
    calendarActiveDateRanges: activeDateRanges,
  });

  return (
    <View
      style={[
        styles.month,
        {
          width,
          height: monthHeight(monthId) - MONTH_GAP,
        },
        focused ? styles.focusedMonth : styles.unfocusedMonth,
      ]}
    >
      <View style={styles.monthIndicatorRow}>
        {(weeksList[0] ?? []).map((day) => (
          <View key={day.id} style={styles.monthIndicatorCell}>
            {day.id === `${monthId}-01` ? (
              <Text accessibilityRole="header" style={styles.monthIndicator}>
                {formatMonthIndicator(monthId)}
              </Text>
            ) : null}
          </View>
        ))}
      </View>
      {weeksList.map((week, weekIndex) => (
        <Calendar.Row.Week key={weekIndex}>
          {week.map((day) => (
            <MonthDay
              key={day.id}
              day={day}
              markerTypes={markerTypesByDay.get(day.id) ?? []}
              selected={day.id === selectedDay}
              onPress={onSelectDay}
            />
          ))}
        </Calendar.Row.Week>
      ))}
    </View>
  );
}

type CalendarMonthlyTabProps = {
  resetVersion: number;
  scrollEnabled: boolean;
  maxDay: string;
  minDay: string;
  selectedDay: string;
  onFocusedMonthChange: (month: string) => void;
  onHasMoreBelowChange: (hasMoreBelow: boolean) => void;
  onSelectDay: (day: string) => void;
};

export default function CalendarMonthlyTab({
  resetVersion,
  scrollEnabled,
  maxDay,
  minDay,
  selectedDay,
  onFocusedMonthChange,
  onHasMoreBelowChange,
  onSelectDay,
}: CalendarMonthlyTabProps) {
  const window = useWindowDimensions();
  const width = Math.min(CONTENT_MAX_WIDTH, Math.max(260, window.width - CONTENT_GUTTER * 2));
  const monthItems = monthIdsBetween(minDay, maxDay).map((id) => ({
    id,
    height: monthHeight(id),
  }));
  const monthFrames = buildMonthFrames(monthItems);
  const currentMonth = maxDay.slice(0, 7);
  const firstMonth = minDay.slice(0, 7);
  const listRef = useRef<FlashListRef<MonthItem>>(null);
  const mountedRef = useRef(true);
  const resetVersionRef = useRef(resetVersion);
  const loadedMonthsRef = useRef(new Set<string>());
  const viewportHeightRef = useRef(0);
  const contentHeightRef = useRef(0);
  const scrollOffsetRef = useRef(0);
  const [viewportHeight, setViewportHeight] = useState(0);
  const [focusedMonth, setFocusedMonth] = useState(currentMonth);
  const [observedResetVersion, setObservedResetVersion] = useState(resetVersion);
  const [markerTypesByDay, setMarkerTypesByDay] = useState<Map<string, readonly string[]>>(
    new Map(),
  );
  const [failedMonths, setFailedMonths] = useState<Set<string>>(new Set());
  const bottomPadding = finalMonthTrailingPadding(
    viewportHeight,
    MONTHLY_CONTENT_INSET,
    monthHeight(currentMonth),
  );
  const listExtraData = { focusedMonth, markerTypesByDay };

  if (observedResetVersion !== resetVersion) {
    setObservedResetVersion(resetVersion);
    setFocusedMonth(currentMonth);
    const previousMonth = previousMonthId(currentMonth);
    setMarkerTypesByDay((current) => {
      const retained = new Map<string, readonly string[]>();
      for (const [day, types] of current) {
        const month = day.slice(0, 7);
        if (month === currentMonth || month === previousMonth) {
          retained.set(day, types);
        }
      }
      return retained;
    });
    setFailedMonths(new Set());
  }

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  // React Compiler caches this closure and the derived list values according
  // to their captures, so no manual memoization is needed.
  const ensureMonth = (monthId: string) => {
    if (loadedMonthsRef.current.has(monthId)) {
      return;
    }
    loadedMonthsRef.current.add(monthId);
    const requestResetVersion = resetVersionRef.current;
    void loadMonthTypePresence(monthId)
      .then((presence) => {
        if (!mountedRef.current || requestResetVersion !== resetVersionRef.current) {
          return;
        }
        setMarkerTypesByDay((current) => {
          const next = new Map(current);
          for (const { day, types } of presence) {
            next.set(day, types);
          }
          return next;
        });
        setFailedMonths((current) => {
          if (!current.has(monthId)) {
            return current;
          }
          const next = new Set(current);
          next.delete(monthId);
          return next;
        });
      })
      .catch(() => {
        if (requestResetVersion !== resetVersionRef.current) {
          return;
        }
        loadedMonthsRef.current.delete(monthId);
        if (mountedRef.current) {
          setFailedMonths((current) => new Set(current).add(monthId));
        }
      });
  };

  useLayoutEffect(() => {
    resetVersionRef.current = resetVersion;
    // The hidden list immediately requests its current visible window again.
    // Clearing request identities also prevents an older in-flight month from
    // repopulating data that was deliberately pruned after dismissal.
    loadedMonthsRef.current.clear();
  }, [resetVersion]);

  const updateBottomFade = (offset: number) => {
    const contentEnd = Math.max(0, contentHeightRef.current - bottomPadding);
    const hasScrollableContent = contentEnd > viewportHeightRef.current + 1;
    onHasMoreBelowChange(
      hasScrollableContent && offset + viewportHeightRef.current < contentEnd - 8,
    );
  };

  const handleScroll = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    const { contentOffset, contentSize, layoutMeasurement } = event.nativeEvent;
    scrollOffsetRef.current = contentOffset.y;
    viewportHeightRef.current = layoutMeasurement.height;
    contentHeightRef.current = contentSize.height;
    updateBottomFade(contentOffset.y);

    const nextFocused = resolveFocusedPeriod(
      monthFrames,
      contentOffset.y,
      layoutMeasurement.height,
      focusedMonth,
      FOCUS_HYSTERESIS,
    );
    if (nextFocused && nextFocused !== focusedMonth) {
      setFocusedMonth(nextFocused);
      onFocusedMonthChange(nextFocused);
    }
  };

  // React Compiler supplies the stable identity FlashList's native observer
  // needs. Deriving neighbours from IDs avoids capturing the render-local data
  // array and prevents failed requests from retrying on every render.
  const onViewableItemsChanged = ({ viewableItems }: { viewableItems: ViewToken<MonthItem>[] }) => {
    for (const token of viewableItems) {
      for (const monthId of [
        previousMonthId(token.item.id),
        token.item.id,
        nextMonthId(token.item.id),
      ]) {
        if (monthId >= firstMonth && monthId <= currentMonth) {
          ensureMonth(monthId);
        }
      }
    }
  };

  const restoreCurrentPosition = () => {
    // Every month row has a deterministic height. Keep the current grid below
    // the fixed header by scrolling past older rows, not by aligning the last
    // item to the viewport's obscured top edge.
    const currentOffset = monthItems.slice(0, -1).reduce((offset, item) => offset + item.height, 0);
    scrollOffsetRef.current = currentOffset;
    listRef.current?.scrollToOffset({ offset: currentOffset, animated: false });
    updateBottomFade(currentOffset);
  };

  return (
    <View style={styles.container}>
      {failedMonths.size > 0 ? (
        <View style={styles.markerError} accessibilityRole="alert">
          <Text style={styles.markerErrorText}>Entry markers unavailable</Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Retry loading calendar entry markers"
            onPress={() => {
              for (const month of failedMonths) {
                ensureMonth(month);
              }
            }}
          >
            <Text style={styles.markerRetry}>Retry</Text>
          </Pressable>
        </View>
      ) : null}
      <FlashList
        key={`monthly-list:${resetVersion}`}
        ref={listRef}
        data={monthItems}
        scrollEnabled={scrollEnabled}
        initialScrollIndex={monthItems.length - 1}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <View style={{ height: item.height, alignItems: "center" }}>
            <MonthGrid
              monthId={item.id}
              width={width}
              focused={focusedMonth === item.id}
              minDay={minDay}
              maxDay={maxDay}
              selectedDay={selectedDay}
              markerTypesByDay={markerTypesByDay}
              onSelectDay={onSelectDay}
            />
          </View>
        )}
        contentContainerStyle={{ paddingTop: MONTHLY_CONTENT_INSET, paddingBottom: bottomPadding }}
        drawDistance={monthHeight(currentMonth)}
        maxItemsInRecyclePool={6}
        onLoad={() => {
          restoreCurrentPosition();
          onFocusedMonthChange(currentMonth);
        }}
        onScroll={handleScroll}
        scrollEventThrottle={32}
        onViewableItemsChanged={onViewableItemsChanged}
        viewabilityConfig={VIEWABILITY_CONFIG}
        onLayout={(event) => {
          const nextViewportHeight = event.nativeEvent.layout.height;
          viewportHeightRef.current = nextViewportHeight;
          setViewportHeight((current) =>
            Math.abs(current - nextViewportHeight) > 0.5 ? nextViewportHeight : current,
          );
          updateBottomFade(scrollOffsetRef.current);
        }}
        onContentSizeChange={(_width, height) => {
          contentHeightRef.current = height;
          updateBottomFade(scrollOffsetRef.current);
        }}
        showsVerticalScrollIndicator={false}
        maintainVisibleContentPosition={{ disabled: true }}
        extraData={listExtraData}
      />
    </View>
  );
}

const styles = StyleSheet.create((theme) => ({
  container: {
    flex: 1,
  },
  month: {
    borderRadius: 16,
    gap: WEEK_GAP,
    overflow: "hidden",
    paddingHorizontal: MONTH_PADDING,
    paddingVertical: MONTH_PADDING,
  },
  monthIndicatorRow: {
    flexDirection: "row",
    height: MONTH_INDICATOR_HEIGHT,
  },
  monthIndicatorCell: {
    alignItems: "center",
    flex: 1,
    justifyContent: "center",
  },
  monthIndicator: {
    ...theme.typography.calendar.month,
    color: theme.colors.content.primary,
  },
  dayCell: {
    alignItems: "center",
    borderRadius: 10,
    flex: 1,
    height: DAY_HEIGHT,
    justifyContent: "center",
    position: "relative",
  },
  dayPressed: {
    backgroundColor: theme.colors.surface.subtle,
  },
  dayText: {
    ...theme.typography.calendar.day,
    color: theme.colors.content.primary,
  },
  dayTextDisabled: {
    color: theme.colors.content.disabled,
  },
  selectedUnderline: {
    backgroundColor: theme.colors.content.primary,
    borderRadius: 1,
    bottom: 8,
    height: 2,
    position: "absolute",
    width: 20,
  },
  markerRow: {
    bottom: 1,
    flexDirection: "row",
    gap: 3,
    position: "absolute",
  },
  marker: {
    borderRadius: 3,
    height: 6,
    width: 6,
  },
  markerError: {
    alignItems: "center",
    alignSelf: "center",
    backgroundColor: theme.colors.surface.elevated,
    borderRadius: 999,
    flexDirection: "row",
    gap: 10,
    paddingHorizontal: 12,
    paddingVertical: 6,
    position: "absolute",
    top: MONTHLY_CONTENT_INSET - 34,
    zIndex: 5,
  },
  markerErrorText: {
    ...theme.typography.ui.caption,
    color: theme.colors.content.muted,
  },
  markerRetry: {
    ...theme.typography.ui.captionMedium,
    color: theme.colors.content.primary,
  },
  focusedMonth: {
    backgroundColor: theme.colors.surface.subtle,
  },
  unfocusedMonth: {
    backgroundColor: fixedTokens.common.transparent,
  },
}));
