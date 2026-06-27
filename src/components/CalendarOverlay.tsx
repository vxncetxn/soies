import {
  Calendar,
  type CalendarActiveDateRange,
  type CalendarDayMetadata,
  type CalendarMonthEnhanced,
  type CalendarOnDayPress,
  type CalendarProps,
  type CalendarTheme,
  useCalendar,
} from "@marceloterreiro/flash-calendar";
import { memo, useCallback, useMemo, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { getEntryDates } from "../data/entries";

const CALENDAR_INSTANCE_ID = "home-calendar-picker";
const CALENDAR_SPACING = 20;
const DAY_HEIGHT = 44;
const MONTH_HEADER_HEIGHT = 28;
const ROW_SPACING = 8;
// Until account-creation tracking exists, assume the user could only have
// entries from Jan 2026 onward. No future months (user can't create them yet).
const ACCOUNT_START_DATE_ID = "2026-01-01";
const ENTRY_DOT_COLOR = "#79716B";
const PRIMARY_TEXT = "#252525";
const TERTIARY_BG = "#EDEFEE";
const INVERSE_BG = "#000000";
const INVERSE_TEXT = "#FFFFFF";
const DISABLED_TEXT = "#B0B0B0";
const BORDER_DEFAULT = "#E0E0E0";

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    paddingHorizontal: 20,
  },
  monthContainer: {
    paddingBottom: CALENDAR_SPACING,
  },
  cell: {
    flex: 1,
    position: "relative",
    height: DAY_HEIGHT,
    marginLeft: ROW_SPACING,
  },
  cellStart: {
    flex: 1,
    position: "relative",
    height: DAY_HEIGHT,
    marginLeft: 0,
  },
  cellEmpty: {
    flex: 1,
    height: DAY_HEIGHT,
    marginLeft: ROW_SPACING,
  },
  cellEmptyStart: {
    flex: 1,
    height: DAY_HEIGHT,
    marginLeft: 0,
  },
  cellBase: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 16,
  },
  cellActive: {
    backgroundColor: INVERSE_BG,
    borderRadius: 16,
  },
  cellToday: {
    borderColor: BORDER_DEFAULT,
    borderWidth: 1,
  },
  cellPressed: {
    backgroundColor: TERTIARY_BG,
  },
  cellText: {
    fontFamily: "GeistMono-Regular",
    fontSize: 14,
    color: PRIMARY_TEXT,
  },
  cellTextActive: {
    color: INVERSE_TEXT,
  },
  cellTextDisabled: {
    color: DISABLED_TEXT,
  },
  dotWrap: {
    position: "absolute",
    bottom: 4,
    left: 0,
    right: 0,
    alignItems: "center",
  },
  dotIdle: {
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: ENTRY_DOT_COLOR,
  },
  dotActive: {
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: INVERSE_TEXT,
  },
});

// Module-level Pressable style fns so list cells never allocate inline styles.
const idleContainerStyle = ({ pressed }: { pressed: boolean }) =>
  pressed ? [styles.cellBase, styles.cellPressed] : [styles.cellBase];
const todayContainerStyle = ({ pressed }: { pressed: boolean }) =>
  pressed ? [styles.cellBase, styles.cellPressed] : [styles.cellBase, styles.cellToday];
const activeContainerStyle = [styles.cellBase, styles.cellActive];
const disabledContainerStyle = [styles.cellBase];

type DayCellProps = {
  day: CalendarDayMetadata;
  entryDates: Set<string>;
  onPress: CalendarOnDayPress;
};

// Lightweight day cell: a single Pressable + Text + absolute dot. No per-cell
// hook, no theme-context lookup, no library wrapper — to minimize the JS cost
// of rendering ~84 visible cells when the calendar opens.
const DayCell = memo(function DayCell({ day, entryDates, onPress }: DayCellProps) {
  if (day.isDifferentMonth) {
    return <View style={day.isStartOfWeek ? styles.cellEmptyStart : styles.cellEmpty} />;
  }

  const hasEntry = entryDates.has(day.id);
  const isActive = day.state === "active";

  const containerStyle =
    day.state === "idle"
      ? idleContainerStyle
      : day.state === "today"
        ? todayContainerStyle
        : day.state === "active"
          ? activeContainerStyle
          : disabledContainerStyle;

  const textStyle =
    day.state === "active"
      ? [styles.cellText, styles.cellTextActive]
      : day.state === "disabled"
        ? [styles.cellText, styles.cellTextDisabled]
        : styles.cellText;

  return (
    <View style={day.isStartOfWeek ? styles.cellStart : styles.cell}>
      <Pressable onPress={() => onPress(day.id)} style={containerStyle}>
        <Text style={textStyle}>{day.displayLabel}</Text>
      </Pressable>
      {hasEntry && (
        <View style={styles.dotWrap}>
          <View style={isActive ? styles.dotActive : styles.dotIdle} />
        </View>
      )}
    </View>
  );
});

const lightCalendarTheme: CalendarTheme = {
  rowMonth: {
    content: {
      color: PRIMARY_TEXT,
      fontFamily: "Geist-Medium",
      fontSize: 18,
    },
  },
  itemWeekName: {
    content: {
      color: ENTRY_DOT_COLOR,
      fontFamily: "GeistMono-Regular",
      fontSize: 12,
    },
  },
};

function uppercaseFirstLetter(value: string) {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function monthsBetween(fromDateId: string, toDateId: string): number {
  const [fromYear, fromMonth] = fromDateId.split("-").map(Number);
  const [toYear, toMonth] = toDateId.split("-").map(Number);
  return (toYear - fromYear) * 12 + (toMonth - fromMonth);
}

type CalendarMonthWithDotsProps = CalendarProps & {
  calendarMonthId: string;
  entryDates: Set<string>;
};

const CalendarMonthWithDots = memo(function CalendarMonthWithDots({
  calendarMonthId,
  entryDates,
  calendarRowVerticalSpacing = ROW_SPACING,
  calendarMonthHeaderHeight = MONTH_HEADER_HEIGHT,
  calendarWeekHeaderHeight = DAY_HEIGHT,
  onCalendarDayPress,
  theme,
  ...buildCalendarParams
}: CalendarMonthWithDotsProps) {
  const { calendarRowMonth, weeksList, weekDaysList } = useCalendar({
    calendarMonthId,
    ...buildCalendarParams,
  });

  return (
    <Calendar.VStack alignItems="center" spacing={calendarRowVerticalSpacing}>
      <Calendar.Row.Month height={calendarMonthHeaderHeight} theme={theme?.rowMonth}>
        {uppercaseFirstLetter(calendarRowMonth)}
      </Calendar.Row.Month>
      <Calendar.Row.Week spacing={ROW_SPACING} theme={theme?.rowWeek}>
        {weekDaysList.map((weekDay, index) => (
          <Calendar.Item.WeekName key={index} height={calendarWeekHeaderHeight} theme={theme?.itemWeekName}>
            {weekDay}
          </Calendar.Item.WeekName>
        ))}
      </Calendar.Row.Week>
      {weeksList.map((week, weekIndex) => (
        <Calendar.Row.Week key={weekIndex}>
          {week.map((day) => (
            <DayCell key={day.id} day={day} entryDates={entryDates} onPress={onCalendarDayPress} />
          ))}
        </Calendar.Row.Week>
      ))}
    </Calendar.VStack>
  );
});

type CalendarOverlayProps = {
  effectiveDate: string;
  onPick: CalendarOnDayPress;
};

const CalendarOverlay = ({ effectiveDate, onPick }: CalendarOverlayProps) => {
  const insets = useSafeAreaInsets();
  const entryDates = useMemo(() => getEntryDates(), []);
  const [initialMonthId] = useState(effectiveDate);

  // Range is fixed: [account start, initial month]. No earlier/future months.
  const pastRange = useMemo(
    () => Math.max(0, monthsBetween(ACCOUNT_START_DATE_ID, initialMonthId)),
    [initialMonthId],
  );
  const futureRange = 0;

  const activeDateRanges = useMemo<CalendarActiveDateRange[]>(
    () => [{ startId: effectiveDate, endId: effectiveDate }],
    [effectiveDate],
  );

  const handleDayPress = useCallback<CalendarOnDayPress>(
    (dateId) => {
      onPick(dateId);
    },
    [onPick],
  );

  const renderItem = useCallback(
    ({ item }: { item: CalendarMonthEnhanced }) => (
      <View style={styles.monthContainer}>
        <CalendarMonthWithDots calendarMonthId={item.id} entryDates={entryDates} {...item.calendarProps} />
      </View>
    ),
    [entryDates],
  );

  return (
    <View
      style={[
        styles.overlay,
        {
          paddingTop: insets.top + 12,
          paddingBottom: insets.bottom + 12,
        },
      ]}
    >
      <Calendar.List
        calendarInstanceId={CALENDAR_INSTANCE_ID}
        calendarInitialMonthId={initialMonthId}
        calendarFirstDayOfWeek="sunday"
        calendarPastScrollRangeInMonths={pastRange}
        calendarFutureScrollRangeInMonths={futureRange}
        calendarActiveDateRanges={activeDateRanges}
        calendarColorScheme="light"
        calendarDayHeight={DAY_HEIGHT}
        calendarRowVerticalSpacing={ROW_SPACING}
        calendarRowHorizontalSpacing={ROW_SPACING}
        calendarMonthHeaderHeight={MONTH_HEADER_HEIGHT}
        calendarSpacing={CALENDAR_SPACING}
        getItemType={(item) => item.numberOfWeeks}
        drawDistance={0}
        onCalendarDayPress={handleDayPress}
        renderItem={renderItem}
        theme={lightCalendarTheme}
        showsVerticalScrollIndicator={false}
      />
    </View>
  );
};

export default CalendarOverlay;
