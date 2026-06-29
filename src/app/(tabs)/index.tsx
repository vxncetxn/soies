import { useLocalSearchParams } from "expo-router";
import { useLayoutEffect, useMemo, useState } from "react";
import { Text, View, useWindowDimensions } from "react-native";
import { useAnimatedScrollHandler, useDerivedValue, useSharedValue } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import DayPager from "../../components/DayPager";
import HomeHeader from "../../components/HomeHeader";
import { getEntriesByDate } from "../../data/entries";
import { todayISO } from "../../utils/date";

// Pager height is stable across navigations, so cache it to let the ScrollView
// render in the first commit on subsequent visits (avoids a late mount pop).
let cachedPagerHeight = 0;

export default function Index() {
  const { date } = useLocalSearchParams<{ date?: string }>();
  const insets = useSafeAreaInsets();
  const window = useWindowDimensions();

  const effectiveDate = date ?? todayISO();
  const entries = getEntriesByDate(effectiveDate);
  const titles = useMemo(() => entries.map((entry) => entry.title), [entries]);

  const computedHeight = Math.max(0, window.height - insets.top - insets.bottom);
  const [pagerHeight, setPagerHeight] = useState(cachedPagerHeight || computedHeight);
  const scrollOffset = useSharedValue(0);

  useLayoutEffect(() => {
    scrollOffset.value = 0;
  }, [effectiveDate, scrollOffset]);

  const onScroll = useAnimatedScrollHandler((event) => {
    scrollOffset.value = event.contentOffset.y;
  });

  const currentPage = useDerivedValue(() => {
    if (pagerHeight === 0) {
      return 0;
    }

    return scrollOffset.value / pagerHeight;
  }, [pagerHeight]);

  const handlePagerHeightChange = (height: number) => {
    if (height > 0 && height !== pagerHeight) {
      setPagerHeight(height);
      cachedPagerHeight = height;
    }
  };

  return (
    <View className="bg-background relative flex-1">
      <HomeHeader date={effectiveDate} titles={titles} currentPage={currentPage} />

      {entries.length === 0 ? (
        <View className="flex-1 items-center justify-center px-5">
          <Text className="text-primary text-center">No entries for this day.</Text>
        </View>
      ) : (
        <DayPager
          key={effectiveDate}
          entries={entries}
          pagerHeight={pagerHeight}
          computedHeight={computedHeight}
          scrollOffset={scrollOffset}
          currentPage={currentPage}
          onScroll={onScroll}
          onPagerHeightChange={handlePagerHeightChange}
        />
      )}
    </View>
  );
}
