/**
 * HomeHeader — the floating date/calendar control at the top of the home screen.
 *
 * It renders the date pill that opens Home's calendar bottom sheet. The pill
 * also carries an animated title carousel that tracks vertical day paging,
 * and the whole header fades out when an entry expands to fullscreen.
 *
 * Relationship to other components:
 *   - Home owns `CalendarSheet` and passes `onCalendarPress` to this trigger.
 *   - `ExpandContext`'s `chromeProgress` fades the whole header out when an
 *     entry expands (the header would overlap the fullscreen expanded view).
 */
import { Pressable, Text, View } from "react-native";
import Animated, { SharedValue, useAnimatedStyle } from "react-native-reanimated";

import { TITLE_TRAVEL } from "../constants/animation";
import { entryChromeVisible } from "../entry-transition/entryTransition";
import { useEntryTransition } from "../entry-transition/EntryTransitionContext";
import { EntryChromeMotion } from "../entry-transition/EntryTransitionMotion";
import { useHomeChromeFade } from "../hooks/useHomeChromeFade";
import { formatDisplayDate } from "../utils/date";
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
    const distance = index - currentPage.get();
    // 1 when this title is the active page, easing to 0 as the page moves away.
    // Clamped to [0, 1] so distant titles don't go negative.
    const base = 1 - Math.min(1, Math.abs(currentPage.get() - index));

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
  /** Opens the persistent calendar sheet owned by Home. */
  onCalendarPress: () => void;
};

const HomeHeader = ({ date, titles, currentPage, onCalendarPress }: HomeHeaderProps) => {
  // Reanimated owns Stack-expansion opacity on the inner native view. The Ease
  // wrapper separately owns Entry-navigation opacity, so neither engine writes
  // the same property on the same native view.
  const chromeFadeStyle = useHomeChromeFade();
  const { state: entryTransitionState } = useEntryTransition();
  const entryChromeIsVisible = entryChromeVisible(entryTransitionState, "home");

  return (
    // Floating header pinned to the top. `z-50` keeps it above the pager; the
    // modal sheet itself lives in the bottom-sheet provider above this subtree.
    <View className="absolute z-50 w-full px-5 py-2">
      {/* Chrome-fade wrapper: fades the header out during entry expand. */}
      <EntryChromeMotion visible={entryChromeIsVisible} pointerEvents="box-none">
        <Animated.View style={chromeFadeStyle}>
          <Pressable
            onPress={onCalendarPress}
            accessibilityRole="button"
            accessibilityLabel="Open calendar"
            className="w-full rounded-4xl border border-controls-border bg-controls-background"
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
          </Pressable>
        </Animated.View>
      </EntryChromeMotion>
    </View>
  );
};

export default HomeHeader;
