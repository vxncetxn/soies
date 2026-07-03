/**
 * HomeHeader — the floating date/calendar control at the top of the home screen.
 *
 * It renders the date pill that, when tapped, blooms into a fullscreen calendar
 * (via `BloomButton`). The pill also carries an animated title carousel that
 * tracks vertical day paging, and the whole header fades out when an entry
 * expands to fullscreen.
 *
 * Calendar navigation pattern ("navigate behind close"):
 *   When you pick a day in the calendar, we navigate *immediately*
 *   (`router.setParams`) so the new day's entries render behind the closing
 *   overlay and are visible the instant it finishes closing. The calendar's
 *   highlight, however, is decoupled from the route: it follows `highlightDate`,
 *   not the `date` route param. `highlightDate` is only synced to the picked
 *   date in `handleClosed` — *after* the close morph finishes — so the calendar
 *   never re-renders mid-animation (which would cause a visible pop as the
 *   active-day pill jumped while the panel shrank). `pickedDateRef` stashes the
 *   picked date between the pick and the post-close sync.
 *
 * Relationship to other components:
 *   - `BloomButton` (variant="fullscreen") owns the measure-and-morph from the
 *     pill to a fullscreen panel and renders `CalendarOverlay` inside it.
 *   - `CalendarOverlay` is the calendar content; this file drives its
 *     `effectiveDate` (route param) and `highlightDate` (decoupled).
 *   - `ExpandContext`'s `chromeProgress` fades the whole header out when an
 *     entry expands (the header would overlap the fullscreen expanded view).
 */
import { useRouter } from "expo-router";
import { useCallback, useRef, useState } from "react";
import { Text, View } from "react-native";
import Animated, { interpolate, SharedValue, useAnimatedStyle } from "react-native-reanimated";

import { CHROME_FADE_END, TITLE_TRAVEL } from "../constants/animation";
import { formatDisplayDate } from "../utils/date";
import BloomButton from "./BloomButton";
import CalendarOverlay from "./CalendarOverlay";
import { useExpandContext } from "./ExpandContext";
import { Icon } from "./Icon";

type AnimatedTitleProps = {
  // One title string per day in the visible pager window.
  titles: string[];
  // Fractional current page from DayPager (written upstream, read here). Drives
  // which title is centered and how the neighbours peek above/below.
  currentPage: SharedValue<number>;
};

/**
 * TitleLayer — a single title string stacked in the title carousel.
 *
 * Each layer is absolutely positioned at the same slot; its opacity and Y
 * offset are derived from its distance to the current page so the active day's
 * title reads centered while its neighbours fade and shift up/down. Opacity
 * uses `base * base` (quadratic) so neighbours fall off quickly and only the
 * nearest 1–2 titles are visible — a soft crossfade rather than a hard swap.
 */
const TitleLayer = ({
  title,
  index,
  currentPage,
}: {
  title: string;
  index: number;
  currentPage: SharedValue<number>;
}) => {
  const style = useAnimatedStyle(() => {
    // Signed distance from the current page: 0 = active, negative = above,
    // positive = below. Drives the vertical peek.
    const distance = index - currentPage.value;
    // 1 when this title is the active page, easing to 0 as the page moves away.
    // Clamped to [0, 1] so distant titles don't go negative.
    const base = 1 - Math.min(1, Math.abs(currentPage.value - index));

    return {
      opacity: base * base,
      transform: [{ translateY: distance * TITLE_TRAVEL }],
    };
  });

  return (
    <Animated.Text
      style={style}
      numberOfLines={1}
      className="absolute inset-x-0 top-0 font-sans-medium text-xl leading-7 text-primary"
    >
      {title}
    </Animated.Text>
  );
};

/**
 * AnimatedTitle — the vertically-stacked title carousel. Renders one `TitleLayer`
 * per day in the pager window inside a fixed-height (`h-7`), overflow-hidden box
 * so only the active title (and a peek of its neighbours) is visible.
 */
const AnimatedTitle = ({ titles, currentPage }: AnimatedTitleProps) => {
  if (titles.length === 0) {
    return null;
  }

  return (
    <View className="relative h-7 overflow-hidden">
      {titles.map((title, index) => (
        <TitleLayer key={index} title={title} index={index} currentPage={currentPage} />
      ))}
    </View>
  );
};

type HomeHeaderProps = {
  // The active date as a route param (YYYY-MM-DD). Drives `effectiveDate` on the
  // calendar and the formatted label on the pill.
  date: string;
  // Titles for the visible pager window, animated by `currentPage`.
  titles: string[];
  // Fractional current page from DayPager, shared so the title carousel can
  // react to scrolling without re-rendering this component.
  currentPage: SharedValue<number>;
};

const HomeHeader = ({ date, titles, currentPage }: HomeHeaderProps) => {
  const router = useRouter();
  // 0 = collapsed, 1 = an entry is expanded fullscreen. Drives the header chrome
  // fade-out so the header doesn't overlap the expanded view.
  const { chromeProgress } = useExpandContext();

  // Controlled open state for the calendar BloomButton. Tapping the pill opens
  // it; picking a day or hardware-back closes it.
  const [calendarOpen, setCalendarOpen] = useState(false);
  // Drives the calendar's active-date highlight, decoupled from the route param
  // `date` so navigation no longer re-renders the calendar. Synced to the picked
  // date in `handleClosed` after the close morph finishes.
  const [highlightDate, setHighlightDate] = useState(date);
  // Stash the picked date so the highlight can be synced after the close morph,
  // when the calendar is hidden and no animation is running. Using a ref (not
  // state) avoids a re-render that would jolt the calendar mid-close.
  const pickedDateRef = useRef<string | null>(null);

  /**
   * Day pick handler. Navigate immediately so the new day's entries render
   * *behind* the closing overlay and are visible the moment it finishes closing.
   * The calendar is decoupled (its `activeDateRanges` follows `highlightDate`,
   * not the route), so this navigation does NOT re-render the calendar. We stash
   * the picked date for `handleClosed` to sync the highlight post-close, then
   * request close — BloomButton animates the morph and calls `onClose` when done.
   */
  const handleDayPress = useCallback(
    (dateId: string) => {
      router.setParams({ date: dateId });
      pickedDateRef.current = dateId;
      setCalendarOpen(false);
    },
    [router],
  );

  /**
   * Post-close callback (BloomButton calls this after the close spring
   * finishes). Now that the calendar is hidden and no animation is running, it's
   * safe to sync the highlight to the picked date without jilting the morph.
   * Clears the stash so a subsequent open starts from the synced highlight.
   */
  const handleClosed = useCallback(() => {
    if (pickedDateRef.current) {
      setHighlightDate(pickedDateRef.current);
      pickedDateRef.current = null;
    }
  }, []);

  // Header chrome fade: fades the whole header out as an entry expands
  // (`chromeProgress` 0 → 1 over the first `CHROME_FADE_END` slice). The
  // calendar-open trigger fade is handled inside BloomButton (its `triggerStyle`
  // cross-fades the trigger as the panel blooms), so here we only handle the
  // entry-expand chrome hide.
  const chromeFadeStyle = useAnimatedStyle(() => ({
    opacity: interpolate(chromeProgress.value, [0, CHROME_FADE_END], [1, 0]),
  }));

  return (
    // Floating header pinned to the top. `z-50` keeps it above the pager; the
    // calendar panel itself lives in the root `bloom` portal (a sibling above
    // this whole subtree), so it correctly covers the header when open.
    <View className="absolute z-50 w-full px-5 py-2">
      {/* Chrome-fade wrapper: fades the header out during entry expand. The
          BloomButton's portaled panel is outside this wrapper, so the calendar
          stays visible regardless of the chrome fade. */}
      <Animated.View style={chromeFadeStyle}>
        {/* The date pill + fullscreen calendar. `open` is controlled here;
            BloomButton measures this trigger on open and morphs a separate
            panel to fullscreen. `onClose` is our post-morph hook for syncing
            the calendar highlight. `w-full` makes the trigger pill span the
            header so it measures as a full-width origin. */}
        <BloomButton
          variant="fullscreen"
          open={calendarOpen}
          onOpenChange={setCalendarOpen}
          onClose={handleClosed}
          className="w-full"
          accessibilityRole="button"
          panelNode={
            <CalendarOverlay
              effectiveDate={date}
              highlightDate={highlightDate}
              onPick={handleDayPress}
            />
          }
        >
          {/* Trigger content: the animated title carousel above the formatted
              date + chevron. `w-full` makes this fill the pill (left-aligned
              with `px-6` padding), matching the pre-refactor layout. */}
          <View className="flex w-full gap-1 px-6 py-2">
            <AnimatedTitle titles={titles} currentPage={currentPage} />
            <View className="flex flex-row items-center gap-2">
              <Text className="font-mono text-base text-secondary">
                {formatDisplayDate(date)}
              </Text>
              <Icon name="chevron-down" size={20} color="#79716B" />
            </View>
          </View>
        </BloomButton>
      </Animated.View>
    </View>
  );
};

export default HomeHeader;
