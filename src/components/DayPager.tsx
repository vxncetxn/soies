import { useCallback } from "react";
import { ScrollView, View } from "react-native";
import Animated, {
  useAnimatedRef,
  useAnimatedStyle,
  interpolate,
  useAnimatedScrollHandler,
  type SharedValue,
} from "react-native-reanimated";

import type { Entry } from "../data/entries";

import { CHROME_FADE_END } from "../constants/animation";
import { useExpandContext } from "./ExpandContext";
import { EntryPreview, ScrollIndicator } from "./ScrollIndicator";
import Stack from "./Stack";

type DayPagerProps = {
  entries: Entry[];
  pagerHeight: number;
  computedHeight: number;
  scrollOffset: SharedValue<number>;
  currentPage: SharedValue<number>;
  onScroll: ReturnType<typeof useAnimatedScrollHandler>;
  onPagerHeightChange: (height: number) => void;
};

const DayPager = ({
  entries,
  pagerHeight,
  computedHeight,
  scrollOffset,
  currentPage,
  onScroll,
  onPagerHeightChange,
}: DayPagerProps) => {
  const scrollRef = useAnimatedRef<ScrollView>();
  const { chromeProgress } = useExpandContext();

  const indicatorFadeStyle = useAnimatedStyle(() => ({
    opacity: interpolate(chromeProgress.value, [0, CHROME_FADE_END], [1, 0]),
  }));

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
          onPagerHeightChange(finalH);
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
        <Animated.View
          style={indicatorFadeStyle}
          pointerEvents="box-none"
          className="absolute top-1/2 right-3 z-40 -translate-y-1/2"
        >
          <ScrollIndicator
            orientation="vertical"
            count={entries.length}
            currentPage={currentPage}
            maxVisible={5}
            onJumpToIndex={jumpToEntry}
            renderPreview={(index) => <EntryPreview entry={entries[index]} />}
          />
        </Animated.View>
      )}
    </View>
  );
};

export default DayPager;
