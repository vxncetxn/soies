/**
 * CalendarOverlay — the calendar content shown inside the morphing date picker.
 *
 * This is the "content" half of the calendar morph (see docs/02). `HomeHeader`
 * renders the date button; `BloomButton` provides the measure-and-morph panel
 * that blooms from the button to fullscreen; *this* component is what's inside
 * that panel — a vertically-scrolling, month-by-month calendar.
 *
 * Key behaviours:
 *   - **Entry dots.** Days that have at least one entry get a small dot under
 *     the number. The dot set is derived once from the mock data.
 *   - **Active-date highlight.** The currently selected date is highlighted
 *     (inverted black pill). Crucially, the highlight is driven by
 *     `highlightDate`, NOT by `effectiveDate` (the route param). This decouples
 *     the calendar from navigation: when you pick a day the route updates
 *     immediately (so the new entries render behind the closing overlay) but
 *     the calendar's highlight is only synced *after* the close morph finishes
 *     (by HomeHeader), so the calendar never re-renders mid-animation.
 *   - **Bounded range.** The calendar only lets you scroll between a fixed
 *     account-start month and the initial month, and caps the future at today
 *     (no future months, no future-day taps).
 *
 * Performance: this file replaces flash-calendar's default day cell with a
 * deliberately lightweight custom `DayCell` (one Pressable + Text + absolute
 * dot, no per-cell hooks or theme lookups) because ~84 cells render when the
 * calendar opens and the default renderer was too heavy.
 */
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
import { todayISO } from "../utils/date";

// A stable instance id for this calendar (flash-calendar supports multiple
// instances sharing state by id; we only have one).
const CALENDAR_INSTANCE_ID = "home-calendar-picker";
// Visual spacing constants (px). Centralised so the layout math is readable.
const CALENDAR_SPACING = 20;
const DAY_HEIGHT = 44;
const MONTH_HEADER_HEIGHT = 28;
const ROW_SPACING = 8;
// Until account-creation tracking exists, assume the user could only have
// entries from Jan 2026 onward. No future months (user can't create them yet).
const ACCOUNT_START_DATE_ID = "2026-01-01";
// Colour palette for cells/text. Centralised to keep the styles below tidy.
const ENTRY_DOT_COLOR = "#79716B";
const PRIMARY_TEXT = "#252525";
const TERTIARY_BG = "#EDEFEE";
const INVERSE_BG = "#000000";
const INVERSE_TEXT = "#FFFFFF";
const DISABLED_TEXT = "#B0B0B0";
const BORDER_DEFAULT = "#E0E0E0";

const styles = StyleSheet.create({
  // The calendar's outer container. flex:1 so it fills the morph panel; the
  // vertical padding is applied inline (it depends on safe-area insets).
  overlay: {
    flex: 1,
    paddingHorizontal: 20,
  },
  // Each month row in the list gets this bottom spacing.
  monthContainer: {
    paddingBottom: CALENDAR_SPACING,
  },
  // A day cell that's part of a week (not the first column): adds the row
  // horizontal spacing on the left.
  cell: {
    flex: 1,
    position: "relative",
    height: DAY_HEIGHT,
    marginLeft: ROW_SPACING,
  },
  // The first column of a week: no left margin (it's the row's left edge).
  cellStart: {
    flex: 1,
    position: "relative",
    height: DAY_HEIGHT,
    marginLeft: 0,
  },
  // Empty cell (a day slot in a week that belongs to a different month, used
  // to keep the grid aligned). Same spacing as a real cell, just no content.
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
  // The inner pressable area of a cell: centered number with rounded corners.
  cellBase: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 16,
  },
  // The active (selected) day: solid black inverted pill.
  cellActive: {
    backgroundColor: INVERSE_BG,
    borderRadius: 16,
  },
  // Today: a thin border to distinguish it without claiming "selected".
  cellToday: {
    borderColor: BORDER_DEFAULT,
    borderWidth: 1,
  },
  // Pressed feedback for a tappable (non-active) day.
  cellPressed: {
    backgroundColor: TERTIARY_BG,
  },
  // The day number text.
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
  // The entry-dot wrapper: absolutely positioned at the bottom-center of the
  // cell so the dot sits under the number.
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
  // On the active (black) day, the dot flips to white so it stays visible.
  dotActive: {
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: INVERSE_TEXT,
  },
});

// Module-level Pressable style fns so list cells never allocate inline styles.
// Returning a style array based on `pressed` lets Pressable swap in the pressed
// look without creating a new array per render per cell.
const idleContainerStyle = ({ pressed }: { pressed: boolean }) =>
  pressed ? [styles.cellBase, styles.cellPressed] : [styles.cellBase];
const todayContainerStyle = ({ pressed }: { pressed: boolean }) =>
  pressed ? [styles.cellBase, styles.cellPressed] : [styles.cellBase, styles.cellToday];
// The active cell never shows pressed feedback (it's already selected).
const activeContainerStyle = [styles.cellBase, styles.cellActive];
const disabledContainerStyle = [styles.cellBase];

type DayCellProps = {
  day: CalendarDayMetadata;
  // Set of ISO date ids that have at least one entry (for the dot).
  entryDates: Set<string>;
  onPress: CalendarOnDayPress;
};

// Lightweight day cell: a single Pressable + Text + absolute dot. No per-cell
// hook, no theme-context lookup, no library wrapper — to minimize the JS cost
// of rendering ~84 visible cells when the calendar opens.
//
// `memo` is intentional: the parent (renderItem) is stable and `entryDates` is
// a stable Set, so memo skips re-rendering cells whose `day` hasn't changed.
const DayCell = memo(function DayCell({ day, entryDates, onPress }: DayCellProps) {
  // Days that belong to the previous/next month (used to fill the grid) render
  // as empty slots — no number, no press target.
  if (day.isDifferentMonth) {
    return <View style={day.isStartOfWeek ? styles.cellEmptyStart : styles.cellEmpty} />;
  }

  const hasEntry = entryDates.has(day.id);
  const isActive = day.state === "active";
  const isDisabled = day.state === "disabled";

  // Pick the container style fn/array based on the day's state. The idle/today
  // branches are *functions* (because they need the `pressed` flag); the active
  // and disabled branches are static arrays.
  const containerStyle =
    day.state === "idle"
      ? idleContainerStyle
      : day.state === "today"
        ? todayContainerStyle
        : day.state === "active"
          ? activeContainerStyle
          : disabledContainerStyle;

  // Pick the text colour based on state (active = inverted, disabled = grey).
  const textStyle =
    day.state === "active"
      ? [styles.cellText, styles.cellTextActive]
      : day.state === "disabled"
        ? [styles.cellText, styles.cellTextDisabled]
        : styles.cellText;

  return (
    <View style={day.isStartOfWeek ? styles.cellStart : styles.cell}>
      <Pressable onPress={() => onPress(day.id)} disabled={isDisabled} style={containerStyle}>
        <Text style={textStyle}>{day.displayLabel}</Text>
      </Pressable>
      {/* Entry dot: only render the wrapper if there's an entry, to avoid
          mounting an empty absolute view for every cell. */}
      {hasEntry && (
        <View style={styles.dotWrap}>
          <View style={isActive ? styles.dotActive : styles.dotIdle} />
        </View>
      )}
    </View>
  );
});

// Theme for the parts of the calendar we still let flash-calendar render
// itself (month title + weekday names). Day cells are rendered by DayCell
// above, so they don't use this theme.
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

/** Capitalise the first letter of a string (used for month labels). */
function uppercaseFirstLetter(value: string) {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

/**
 * Whole-month count between two ISO dates (e.g. "2026-01-01" -> "2026-07-03"
 * is 6 months). Used to compute how many past months the calendar can scroll.
 * Computed by year/month arithmetic, not by Date, so it ignores day overflow.
 */
function monthsBetween(fromDateId: string, toDateId: string): number {
  const [fromYear, fromMonth] = fromDateId.split("-").map(Number);
  const [toYear, toMonth] = toDateId.split("-").map(Number);
  return (toYear - fromYear) * 12 + (toMonth - fromMonth);
}

type CalendarMonthWithDotsProps = CalendarProps & {
  calendarMonthId: string;
  entryDates: Set<string>;
};

/**
 * CalendarMonthWithDots — renders a single month (header + weekday names + a
 * grid of DayCells with entry dots).
 *
 * This is the bridge between flash-calendar's data layer and our custom cell
 * renderer. `useCalendar` turns a `calendarMonthId` + calendar params into the
 * month's label, weekday names, and the per-day metadata grid. We then render
 * that grid ourselves with `DayCell` (instead of the library's default cell)
 * so we control the appearance and keep the per-cell cost low.
 *
 * `memo`'d because the list recycles these and we don't want to recompute the
 * calendar grid for a month unless its inputs change.
 */
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
  // Ask flash-calendar for this month's data: the month label, the weekday
  // name list, and the weeks-of-days grid (each day's metadata).
  const { calendarRowMonth, weeksList, weekDaysList } = useCalendar({
    calendarMonthId,
    ...buildCalendarParams,
  });

  return (
    <Calendar.VStack alignItems="center" spacing={calendarRowVerticalSpacing}>
      {/* Month title, e.g. "July". */}
      <Calendar.Row.Month height={calendarMonthHeaderHeight} theme={theme?.rowMonth}>
        {uppercaseFirstLetter(calendarRowMonth)}
      </Calendar.Row.Month>
      {/* Weekday name row (S M T W T F S). */}
      <Calendar.Row.Week spacing={ROW_SPACING} theme={theme?.rowWeek}>
        {weekDaysList.map((weekDay, index) => (
          <Calendar.Item.WeekName
            key={index}
            height={calendarWeekHeaderHeight}
            theme={theme?.itemWeekName}
          >
            {weekDay}
          </Calendar.Item.WeekName>
        ))}
      </Calendar.Row.Week>
      {/* The weeks: each is a row of DayCells (or empty slots for days that
          belong to a neighbouring month). */}
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
  // The date the home screen is showing (the route param). Used only to set
  // the initial visible month and to compute the past scroll range — NOT to
  // drive the highlight (see `highlightDate`).
  effectiveDate: string;
  // The date the calendar should highlight as selected. Decoupled from
  // effectiveDate so navigation doesn't re-render the calendar mid-morph;
  // HomeHeader syncs this after the close morph finishes.
  highlightDate: string;
  // Called when the user taps a day. HomeHeader navigates + closes the overlay.
  onPick: CalendarOnDayPress;
};

/**
 * CalendarOverlay — the top-level calendar component (see file header).
 */
const CalendarOverlay = ({ effectiveDate, highlightDate, onPick }: CalendarOverlayProps) => {
  const insets = useSafeAreaInsets();
  // The set of dates that have entries. Computed once from the mock data and
  // never changes during the session, so an empty dep array is correct.
  const entryDates = useMemo(() => getEntryDates(), []);
  // The month to open on, captured once from the first `effectiveDate`. Using
  // useState (not useMemo) intentionally freezes it: if the route date changes
  // while the calendar is open, we do NOT want to jump the scroll position.
  const [initialMonthId] = useState(effectiveDate);
  // Cap the calendar at today: blocks future months from ever rendering (even
  // via onEndReached/appendMonths) and disables future days within view.
  const maxDateId = useMemo(() => todayISO(), []);

  // Range is fixed: [account start, initial month]. No earlier/future months.
  // The past range is the whole-month count from the account start to the
  // initial month; clamped at 0 in case effectiveDate is before the start.
  const pastRange = useMemo(
    () => Math.max(0, monthsBetween(ACCOUNT_START_DATE_ID, initialMonthId)),
    [initialMonthId],
  );
  const futureRange = 0;

  // Decoupled from `effectiveDate`: navigation (router.setParams) changes
  // `effectiveDate` but must NOT re-render the calendar during the close morph.
  // `highlightDate` is synced post-close by HomeHeader so the next open is correct.
  //
  // flash-calendar highlights days via "active date ranges"; a single-day range
  // (startId == endId) highlights exactly one day.
  const activeDateRanges = useMemo<CalendarActiveDateRange[]>(
    () => [{ startId: highlightDate, endId: highlightDate }],
    [highlightDate],
  );

  // Thin wrapper around `onPick` so the child callback identity is stable
  // (depends only on `onPick`, which is stable from HomeHeader).
  const handleDayPress = useCallback<CalendarOnDayPress>(
    (dateId) => {
      onPick(dateId);
    },
    [onPick],
  );

  // Render a single month in the list. Stable identity (depends only on the
  // entry-dates set) so the list doesn't recreate render items each render.
  const renderItem = useCallback(
    ({ item }: { item: CalendarMonthEnhanced }) => (
      <View style={styles.monthContainer}>
        <CalendarMonthWithDots
          calendarMonthId={item.id}
          entryDates={entryDates}
          {...item.calendarProps}
        />
      </View>
    ),
    [entryDates],
  );

  return (
    // Outer container with safe-area padding so the calendar clears the
    // status bar and home indicator when it fills the morph panel.
    <View
      style={[
        styles.overlay,
        {
          paddingTop: insets.top + 12,
          paddingBottom: insets.bottom + 12,
        },
      ]}
    >
      {/* flash-calendar's virtualised list of months. Key props:
          - calendarInitialMonthId: which month to start on (frozen, above).
          - calendarPastScrollRangeInMonths/future...: how far you can scroll.
          - calendarMaxDateId: no days after this date are tappable.
          - calendarActiveDateRanges: which day(s) to highlight.
          - getItemType: groups months by number-of-weeks so the virtualizer
            recycles like-shaped months together (avoids layout thrash).
          - drawDistance: 0 = only render visible months (keeps the ~84-cell
            budget tight on open). */}
      <Calendar.List
        calendarInstanceId={CALENDAR_INSTANCE_ID}
        calendarInitialMonthId={initialMonthId}
        calendarFirstDayOfWeek="sunday"
        calendarPastScrollRangeInMonths={pastRange}
        calendarFutureScrollRangeInMonths={futureRange}
        calendarMaxDateId={maxDateId}
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
