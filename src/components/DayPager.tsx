import { useRef, useState } from "react";
import {
  NativeScrollEvent,
  NativeSyntheticEvent,
  ScrollView,
  View,
  useWindowDimensions,
} from "react-native";
import Animated from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import type { Entry } from "../data/entries";

import Stack from "./Stack";

type DayPagerProps = {
  entries: Entry[];
};

// Pager height is stable across navigations, so cache it to let the ScrollView
// render in the first commit on subsequent visits (avoids a late mount pop).
let cachedPagerHeight = 0;

const DayPager = ({ entries }: DayPagerProps) => {
  const scrollRef = useRef<ScrollView>(null);
  const insets = useSafeAreaInsets();
  const window = useWindowDimensions();
  // Safe-area insets are known from the first render but applied to the native
  // screen one layout pass later, so the measured container height transiently
  // overshoots by the inset total. Compute the stable height from window + insets
  // and clamp the measurement to it to avoid the reflow.
  const computedHeight = Math.max(0, window.height - insets.top - insets.bottom);
  const [pagerHeight, setPagerHeight] = useState(cachedPagerHeight || computedHeight);
  const [, setActiveEntryIndex] = useState(0);

  const onMomentumScrollEnd = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    if (pagerHeight === 0) {
      return;
    }

    const index = Math.round(event.nativeEvent.contentOffset.y / pagerHeight);

    setActiveEntryIndex(Math.max(0, Math.min(entries.length - 1, index)));
  };

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
    </View>
  );
};

export default DayPager;
