import { useRouter } from "expo-router";
import { useRef, useState } from "react";
import {
  NativeScrollEvent,
  NativeSyntheticEvent,
  Pressable,
  ScrollView,
  Text,
  View,
  useWindowDimensions,
} from "react-native";
import Animated from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import type { Entry } from "../data/entries";
import { todayISO, toISODate } from "../utils/date";
import Stack from "./Stack";

type DayPagerProps = {
  entries: Entry[];
};

// Pager height is stable across navigations, so cache it to let the ScrollView
// render in the first commit on subsequent visits (avoids a late mount pop).
let cachedPagerHeight = 0;

const DayPager = ({ entries }: DayPagerProps) => {
  const router = useRouter();
  const scrollRef = useRef<ScrollView>(null);
  const insets = useSafeAreaInsets();
  const window = useWindowDimensions();
  // Safe-area insets are known from the first render but applied to the native
  // screen one layout pass later, so the measured container height transiently
  // overshoots by the inset total. Compute the stable height from window + insets
  // and clamp the measurement to it to avoid the reflow.
  const computedHeight = Math.max(0, window.height - insets.top - insets.bottom);
  const [pagerHeight, setPagerHeight] = useState(cachedPagerHeight || computedHeight);
  const [activeEntryIndex, setActiveEntryIndex] = useState(0);

  const scrollToEntry = (index: number) => {
    if (pagerHeight === 0) {
      return;
    }

    scrollRef.current?.scrollTo({ y: index * pagerHeight, animated: true });
    setActiveEntryIndex(index);
  };

  const onMomentumScrollEnd = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    if (pagerHeight === 0) {
      return;
    }

    const index = Math.round(event.nativeEvent.contentOffset.y / pagerHeight);

    setActiveEntryIndex(Math.max(0, Math.min(entries.length - 1, index)));
  };

  const canGoPrev = activeEntryIndex > 0;
  const canGoNext = activeEntryIndex < entries.length - 1;

  return (
    <View className="relative flex-1">
      <View
        className="flex-1"
        onLayout={(event) => {
          const h = event.nativeEvent.layout.height;
          const finalH = Math.min(h, computedHeight);
          if (finalH > 0 && finalH !== pagerHeight) {
            setPagerHeight(finalH);
            cachedPagerHeight = finalH;
          }
        }}
      >
        {pagerHeight > 0 && (
          <Animated.ScrollView
            ref={scrollRef}
            pagingEnabled
            showsVerticalScrollIndicator={false}
            scrollEventThrottle={16}
            removeClippedSubviews
            onMomentumScrollEnd={onMomentumScrollEnd}
            style={{ height: pagerHeight }}
          >
            {entries.map((entry, index) => (
              <View
                key={index}
                style={{ height: pagerHeight }}
                className="items-center justify-center px-5"
              >
                <Stack entry={entry} />
              </View>
            ))}
          </Animated.ScrollView>
        )}
      </View>

      <View
        className="absolute right-5 bottom-20 left-5 z-10 flex flex-row justify-between"
        pointerEvents="box-none"
      >
        <Pressable disabled={!canGoPrev} onPress={() => scrollToEntry(activeEntryIndex - 1)}>
          <Text className={canGoPrev ? "text-primary" : "text-primary/40"}>Prev</Text>
        </Pressable>
        <Pressable onPress={() => router.setParams({ date: todayISO() })}>
          <Text className="text-primary">Today</Text>
        </Pressable>
        <Pressable onPress={() => router.setParams({ date: toISODate(new Date(2026, 5, 28)) })}>
          <Text className="text-primary">Tomorrow</Text>
        </Pressable>
        <Pressable disabled={!canGoNext} onPress={() => scrollToEntry(activeEntryIndex + 1)}>
          <Text className={canGoNext ? "text-primary" : "text-primary/40"}>Next</Text>
        </Pressable>
      </View>
    </View>
  );
};

export default DayPager;
