import { useCallback, useState } from "react";
import { ScrollView, View, useWindowDimensions } from "react-native";
import Animated, {
  useAnimatedRef,
  useAnimatedScrollHandler,
  useDerivedValue,
  useSharedValue,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import type { Entry } from "../data/entries";

import { EntryPreview, ScrollIndicator } from "./ScrollIndicator";
import Stack from "./Stack";

type DayPagerProps = {
  entries: Entry[];
};

// Pager height is stable across navigations, so cache it to let the ScrollView
// render in the first commit on subsequent visits (avoids a late mount pop).
let cachedPagerHeight = 0;

const DayPager = ({ entries }: DayPagerProps) => {
  const scrollRef = useAnimatedRef<ScrollView>();
  const insets = useSafeAreaInsets();
  const window = useWindowDimensions();
  // Safe-area insets are known from the first render but applied to the native
  // screen one layout pass later, so the measured container height transiently
  // overshoots by the inset total. Compute the stable height from window + insets
  // and clamp the measurement to it to avoid the reflow.
  const computedHeight = Math.max(0, window.height - insets.top - insets.bottom);
  const [pagerHeight, setPagerHeight] = useState(cachedPagerHeight || computedHeight);
  const scrollOffset = useSharedValue(0);

  const onScroll = useAnimatedScrollHandler((event) => {
    scrollOffset.value = event.contentOffset.y;
  });

  const currentPage = useDerivedValue(() => {
    if (pagerHeight === 0) {
      return 0;
    }

    return scrollOffset.value / pagerHeight;
  }, [pagerHeight]);

  const jumpToEntry = useCallback(
    (index: number) => {
      if (pagerHeight === 0) {
        return;
      }

      scrollRef.current?.scrollTo({ x: 0, y: index * pagerHeight, animated: false });
      scrollOffset.value = index * pagerHeight;
    },
    [pagerHeight, scrollOffset, scrollRef],
  );

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
            onScroll={onScroll}
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
      {pagerHeight > 0 && (
        <ScrollIndicator
          orientation="vertical"
          count={entries.length}
          currentPage={currentPage}
          maxVisible={5}
          onJumpToIndex={jumpToEntry}
          renderPreview={(index) => <EntryPreview entry={entries[index]} />}
          className="absolute top-1/2 right-3 z-40 -translate-y-1/2"
        />
      )}
    </View>
  );
};

export default DayPager;
