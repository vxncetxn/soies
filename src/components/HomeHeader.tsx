import { useRouter } from "expo-router";
import { useCallback, useRef, useState } from "react";
import { Text, View } from "react-native";
import Animated, {
  interpolate,
  SharedValue,
  useAnimatedRef,
  useAnimatedStyle,
  useSharedValue,
} from "react-native-reanimated";

import { CHROME_FADE_END, TITLE_TRAVEL } from "../constants/animation";
import { formatDisplayDate } from "../utils/date";
import Button from "./Button";
import CalendarOverlay from "./CalendarOverlay";
import { useExpandContext } from "./ExpandContext";
import { Icon } from "./Icon";
import MorphOverlay from "./MorphOverlay";

type AnimatedTitleProps = {
  titles: string[];
  currentPage: SharedValue<number>;
};

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
    const distance = index - currentPage.value;
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
      className="text-primary absolute inset-x-0 top-0 font-sans-medium text-xl leading-7"
    >
      {title}
    </Animated.Text>
  );
};

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
  date: string;
  titles: string[];
  currentPage: SharedValue<number>;
};

const HomeHeader = ({ date, titles, currentPage }: HomeHeaderProps) => {
  const router = useRouter();
  const { chromeProgress } = useExpandContext();
  const triggerRef = useAnimatedRef<Animated.View>();
  const calendarProgress = useSharedValue(0);
  const [calendarOpen, setCalendarOpen] = useState(false);
  // Drives the calendar's active-date highlight, decoupled from the route param
  // so navigation no longer re-renders the calendar. Synced post-close below.
  const [highlightDate, setHighlightDate] = useState(date);
  // Stash the picked date so the highlight can be synced after the close morph,
  // when the calendar is hidden and no animation is running.
  const pickedDateRef = useRef<string | null>(null);

  const handleDayPress = useCallback(
    (dateId: string) => {
      // Navigate immediately so the new entries render behind the closing overlay
      // and are visible the moment it finishes closing. The calendar is decoupled
      // (activeDateRanges follows highlightDate), so this does not re-render it.
      router.setParams({ date: dateId });
      pickedDateRef.current = dateId;
      setCalendarOpen(false);
    },
    [router],
  );

  const handleClosed = useCallback(() => {
    if (pickedDateRef.current) {
      setHighlightDate(pickedDateRef.current);
      pickedDateRef.current = null;
    }
  }, []);

  const handleRequestClose = useCallback(() => {
    setCalendarOpen(false);
  }, []);

  // Button content cross-fades out for calendar morph and entry expand chrome hide.
  const triggerStyle = useAnimatedStyle(() => ({
    opacity:
      interpolate(chromeProgress.value, [0, CHROME_FADE_END], [1, 0]) *
      interpolate(calendarProgress.value, [0, 0.2], [1, 0]),
  }));

  return (
    <View className="absolute z-50 w-full px-5 py-2">
      <Animated.View ref={triggerRef} collapsable={false} className="">
        <Animated.View style={triggerStyle}>
          <Button
            onPress={() => {
              setCalendarOpen(true);
            }}
            accessibilityRole="button"
          >
            <View className="flex w-full gap-1 px-6 py-2">
              <AnimatedTitle titles={titles} currentPage={currentPage} />
              <View className="flex flex-row items-center gap-2">
                <Text className="text-secondary font-mono text-base">
                  {formatDisplayDate(date)}
                </Text>
                <Icon name="chevron-down" size={20} color="#79716B" />
              </View>
            </View>
          </Button>
        </Animated.View>
      </Animated.View>

      <MorphOverlay
        triggerRef={triggerRef}
        open={calendarOpen}
        progress={calendarProgress}
        onRequestClose={handleRequestClose}
        onClose={handleClosed}
        variant="fullscreen"
        solid
      >
        <CalendarOverlay
          effectiveDate={date}
          highlightDate={highlightDate}
          onPick={handleDayPress}
        />
      </MorphOverlay>
    </View>
  );
};

export default HomeHeader;
