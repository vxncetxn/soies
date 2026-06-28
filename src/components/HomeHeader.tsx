import { useRouter } from "expo-router";
import { useCallback, useRef, useState } from "react";
import { Text, View } from "react-native";
import { createNanoIconSet } from "react-native-nano-icons";
import Animated, {
  interpolate,
  useAnimatedRef,
  useAnimatedStyle,
  useSharedValue,
} from "react-native-reanimated";

import glyphMap from "../../assets/nanoicons/icons.glyphmap.json";
import { formatDisplayDate } from "../utils/date";
import Button from "./Button";
import CalendarOverlay from "./CalendarOverlay";
import MorphOverlay from "./MorphOverlay";

const Icon = createNanoIconSet(glyphMap);

type HomeHeaderProps = {
  date: string;
};

const HomeHeader = ({ date }: HomeHeaderProps) => {
  const router = useRouter();
  const triggerRef = useAnimatedRef<Animated.View>();
  const progress = useSharedValue(0);
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

  // Button content + border + bg cross-fade out as the panel blooms in.
  const triggerStyle = useAnimatedStyle(() => ({
    opacity: interpolate(progress.value, [0, 0.2], [1, 0]),
  }));

  return (
    <View className="absolute z-50 w-full px-5 py-2">
      <Animated.View ref={triggerRef} collapsable={false} className="self-start">
        <Animated.View style={triggerStyle}>
          <Button
            onPress={() => {
              setCalendarOpen(true);
            }}
            accessibilityRole="button"
          >
            <View className="flex gap-1 px-6 py-2">
              <Text className="font-sans-medium text-xl text-primary">kiyomizudera</Text>
              <View className="flex flex-row items-center gap-2">
                <Text className="font-mono text-base text-secondary">
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
        progress={progress}
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
