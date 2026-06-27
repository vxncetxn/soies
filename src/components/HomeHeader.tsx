import { useRouter } from "expo-router";
import { useCallback, useRef, useState } from "react";
import { Text, View } from "react-native";
import Animated, {
  interpolate,
  useAnimatedRef,
  useAnimatedStyle,
  useSharedValue,
} from "react-native-reanimated";
import { createNanoIconSet } from "react-native-nano-icons";

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
  // Stash the picked date and navigate only after the close morph finishes, so
  // the close spring is never blocked by a setParams-triggered re-render.
  const pickedDateRef = useRef<string | null>(null);

  const handleDayPress = useCallback((dateId: string) => {
    pickedDateRef.current = dateId;
    setCalendarOpen(false);
  }, []);

  const handleClosed = useCallback(() => {
    if (pickedDateRef.current) {
      router.setParams({ date: pickedDateRef.current });
      pickedDateRef.current = null;
    }
  }, [router]);

  const handleRequestClose = useCallback(() => {
    pickedDateRef.current = null;
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
                <Text className="font-mono text-base text-secondary">{formatDisplayDate(date)}</Text>
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
        <CalendarOverlay effectiveDate={date} onPick={handleDayPress} />
      </MorphOverlay>
    </View>
  );
};

export default HomeHeader;
