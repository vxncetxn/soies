/**
 * HomeHeader — the floating date/calendar control at the top of the home screen.
 *
 * It renders the date pill that opens Home's calendar bottom sheet. The pill
 * also carries an animated title carousel that tracks vertical day paging,
 * and the whole header fades out when an entry expands to fullscreen.
 *
 * Relationship to other components:
 *   - Home owns `CalendarSheet` and passes `onCalendarPress` to this trigger.
 *   - `StackChromeMotion` maps the global expansion phase to an Ease opacity
 *     endpoint (the header would overlap the fullscreen expanded view).
 */
import { Pressable, Text, View } from "react-native";
import Animated, { SharedValue, useAnimatedStyle } from "react-native-reanimated";
import { StyleSheet, withUnistyles } from "react-native-unistyles";

import { TITLE_TRAVEL } from "../constants/animation";
import { entryChromeVisible } from "../entry-transition/entryTransition";
import { useEntryTransition } from "../entry-transition/EntryTransitionContext";
import { EntryChromeMotion } from "../entry-transition/EntryTransitionMotion";
import { formatDisplayDate } from "../utils/date";
import { Icon } from "./Icon";
import { StackChromeMotion } from "./StackChromeMotion";

const ThemedIcon = withUnistyles(Icon, (theme) => ({
  color: theme.colors.icon.default,
}));

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
    <Animated.Text style={[styles.titleLayer, style]} numberOfLines={1}>
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
    <View style={styles.titleViewport}>
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
  const { state: entryTransitionState } = useEntryTransition();
  const entryChromeIsVisible = entryChromeVisible(entryTransitionState, "home");

  return (
    // Floating header pinned to the top. `z-50` keeps it above the pager; the
    // modal sheet itself lives in the bottom-sheet provider above this subtree.
    <View style={styles.header}>
      {/* Entry and Stack own independent opacity wrappers and never share a writer. */}
      <EntryChromeMotion visible={entryChromeIsVisible} pointerEvents="box-none">
        <StackChromeMotion pointerEvents="box-none">
          <Pressable
            onPress={onCalendarPress}
            accessibilityRole="button"
            accessibilityLabel="Open calendar"
            style={styles.trigger}
          >
            {/* Trigger content: the animated title carousel above the formatted
              date + chevron. `w-full` makes this fill the pill (left-aligned
              with `px-6` padding), matching the pre-refactor layout. */}
            <View style={styles.triggerContent}>
              <AnimatedTitle titles={titles} currentPage={currentPage} />
              <View style={styles.dateRow}>
                <Text style={styles.dateLabel}>{formatDisplayDate(date)}</Text>
                <ThemedIcon name="chevron-down" size={20} />
              </View>
            </View>
          </Pressable>
        </StackChromeMotion>
      </EntryChromeMotion>
    </View>
  );
};

export default HomeHeader;

const styles = StyleSheet.create((theme) => ({
  dateLabel: {
    ...theme.typography.calendar.homeDate,
    color: theme.colors.content.secondary,
  },
  dateRow: {
    alignItems: "center",
    flexDirection: "row",
    gap: 8,
  },
  header: {
    paddingHorizontal: 20,
    paddingVertical: 8,
    position: "absolute",
    width: "100%",
    zIndex: 50,
  },
  titleLayer: {
    ...theme.typography.ui.screenTitle,
    color: theme.colors.content.primary,
    left: 0,
    position: "absolute",
    right: 0,
    top: 0,
  },
  titleViewport: {
    height: 28,
    overflow: "hidden",
    position: "relative",
  },
  trigger: {
    backgroundColor: theme.colors.surface.control,
    borderColor: theme.colors.border.control,
    borderCurve: "continuous",
    borderRadius: 32,
    borderWidth: 1,
    width: "100%",
  },
  triggerContent: {
    gap: 4,
    paddingHorizontal: 24,
    paddingVertical: 8,
    width: "100%",
  },
}));
