import { Image } from "expo-image";
import { ReactNode, useCallback, useMemo, useState } from "react";
import { Text, View } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, {
  interpolate,
  SharedValue,
  useAnimatedReaction,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from "react-native-reanimated";
import { scheduleOnRN } from "react-native-worklets";
import { withUniwind } from "uniwind";

import type { Entry } from "../data/entries";

const StyledImage = withUniwind(Image);

type ScrollIndicatorOrientation = "vertical" | "horizontal";

type ScrollIndicatorProps = {
  orientation: ScrollIndicatorOrientation;
  count: number;
  currentPage: SharedValue<number>;
  maxVisible?: number;
  className?: string;
  renderPreview: (index: number) => ReactNode;
  onJumpToIndex: (index: number) => void;
};

type IndicatorItemProps = {
  orientation: ScrollIndicatorOrientation;
  index: number;
  currentPage: SharedValue<number>;
};

const clampIndex = (index: number, count: number) => Math.max(0, Math.min(count - 1, index));

const IndicatorItem = ({ orientation, index, currentPage }: IndicatorItemProps) => {
  const inactiveStyle = useAnimatedStyle(() => {
    const active = 1 - Math.min(1, Math.abs(currentPage.value - index));

    return {
      opacity: interpolate(active, [0, 1], [1, 0]),
      transform: [{ scale: interpolate(active, [0, 1], [1, 0.65]) }],
    };
  });

  const activeStyle = useAnimatedStyle(() => {
    const active = 1 - Math.min(1, Math.abs(currentPage.value - index));
    const majorScale = interpolate(active, [0, 1], [0.25, 1]);

    return {
      opacity: active,
      transform:
        orientation === "vertical"
          ? [{ scaleY: majorScale }, { scaleX: interpolate(active, [0, 1], [0.75, 1]) }]
          : [{ scaleX: majorScale }, { scaleY: interpolate(active, [0, 1], [0.75, 1]) }],
    };
  });

  return (
    <View
      className={
        orientation === "vertical"
          ? "h-5 w-4 items-center justify-center"
          : "h-4 w-5 items-center justify-center"
      }
    >
      <Animated.View style={inactiveStyle} className="bg-icon h-1.5 w-1.5 rounded-full" />
      <Animated.View
        style={activeStyle}
        className="bg-secondary absolute rounded-full"
        pointerEvents="none"
      >
        <View className={orientation === "vertical" ? "h-4 w-1.5" : "h-1.5 w-4"} />
      </Animated.View>
    </View>
  );
};

type PreviewSlotProps = {
  index: number;
  currentPage: SharedValue<number>;
  children: ReactNode;
};

const PreviewSlot = ({ index, currentPage, children }: PreviewSlotProps) => {
  const style = useAnimatedStyle(() => {
    const active = 1 - Math.min(1, Math.abs(currentPage.value - index));

    return {
      opacity: interpolate(active, [0, 1], [0.65, 1]),
      transform: [{ scale: interpolate(active, [0, 1], [0.92, 1]) }],
    };
  });

  return <Animated.View style={style}>{children}</Animated.View>;
};

const useVisibleIndices = (count: number, maxVisible: number, activeIndex: number) =>
  useMemo(() => {
    const visibleCount = Math.min(count, maxVisible);
    const halfWindow = Math.floor(visibleCount / 2);
    const start = Math.min(Math.max(activeIndex - halfWindow, 0), count - visibleCount);

    return Array.from({ length: visibleCount }, (_, index) => start + index);
  }, [activeIndex, count, maxVisible]);

export const ScrollIndicator = ({
  orientation,
  count,
  currentPage,
  maxVisible = 5,
  className,
  renderPreview,
  onJumpToIndex,
}: ScrollIndicatorProps) => {
  const [activeIndex, setActiveIndex] = useState(0);
  const [expanded, setExpanded] = useState(false);
  const expandedProgress = useSharedValue(0);
  const lastJumpIndex = useSharedValue(-1);
  const railSizeSV = useSharedValue(1);
  const panStartIndex = useSharedValue(0);
  const visibleIndices = useVisibleIndices(count, maxVisible, activeIndex);

  useAnimatedReaction(
    () => Math.max(0, Math.min(count - 1, Math.round(currentPage.value))),
    (next, previous) => {
      if (next !== previous) {
        scheduleOnRN(setActiveIndex, next);
      }
    },
    [count],
  );

  const jumpToIndex = useCallback(
    (index: number) => {
      onJumpToIndex(clampIndex(index, count));
    },
    [count, onJumpToIndex],
  );

  const longPress = Gesture.LongPress()
    .minDuration(250)
    .maxDistance(1000)
    .onStart(() => {
      expandedProgress.value = withSpring(1);
      scheduleOnRN(setExpanded, true);
    })
    .onFinalize(() => {
      expandedProgress.value = withTiming(0);
      lastJumpIndex.value = -1;
      scheduleOnRN(setExpanded, false);
    });

  const pan = Gesture.Pan()
    .onBegin(() => {
      panStartIndex.value = Math.max(0, Math.min(count - 1, Math.round(currentPage.value)));
      lastJumpIndex.value = panStartIndex.value;
    })
    .onUpdate((event) => {
      if (expandedProgress.value <= 0.5) {
        return;
      }
      const itemSize = railSizeSV.value / count;
      const delta = orientation === "vertical" ? event.translationY : event.translationX;
      const indexDelta = itemSize > 0 ? Math.round(delta / itemSize) : 0;
      const nextIndex = Math.max(0, Math.min(count - 1, panStartIndex.value + indexDelta));
      if (nextIndex !== lastJumpIndex.value) {
        lastJumpIndex.value = nextIndex;
        scheduleOnRN(jumpToIndex, nextIndex);
      }
    });

  const expandedStyle = useAnimatedStyle(() => ({
    opacity: expandedProgress.value,
    transform: [{ scale: interpolate(expandedProgress.value, [0, 1], [0.96, 1]) }],
  }));

  if (count <= 1) {
    return null;
  }

  const rail = (
    <View
      className={
        orientation === "vertical"
          ? "items-center gap-1 px-1.5 py-2"
          : "flex-row items-center gap-1 px-2 py-1.5"
      }
      onLayout={(e) => {
        const next =
          orientation === "vertical" ? e.nativeEvent.layout.height : e.nativeEvent.layout.width;
        if (next > 0) {
          railSizeSV.value = next;
        }
      }}
    >
      {visibleIndices.map((index) => (
        <IndicatorItem
          key={index}
          orientation={orientation}
          index={index}
          currentPage={currentPage}
        />
      ))}
    </View>
  );

  const previews = (
    <View className={orientation === "vertical" ? "gap-2" : "flex-row gap-2"}>
      {visibleIndices.map((index) => (
        <PreviewSlot key={index} index={index} currentPage={currentPage}>
          {renderPreview(index)}
        </PreviewSlot>
      ))}
    </View>
  );

  return (
    <GestureDetector gesture={Gesture.Simultaneous(longPress, pan)}>
      <Animated.View className={className}>
        {expanded ? (
          <Animated.View
            style={expandedStyle}
            className={
              orientation === "vertical"
                ? "border-controls-border bg-controls-background flex-row items-center gap-3 rounded-4xl border p-3"
                : "border-controls-border bg-controls-background items-center gap-2 rounded-4xl border p-3"
            }
          >
            {orientation === "vertical" ? (
              <>
                {previews}
                {rail}
              </>
            ) : (
              <>
                {previews}
                {rail}
              </>
            )}
          </Animated.View>
        ) : (
          <View className="border-controls-border bg-controls-background rounded-4xl border">
            {rail}
          </View>
        )}
      </Animated.View>
    </GestureDetector>
  );
};

type EntryPreviewProps = {
  entry: Entry;
};

export const EntryPreview = ({ entry }: EntryPreviewProps) => {
  const visibleArtefacts = entry.artefacts.slice(0, 3);

  return (
    <View
      className={entry.type === "paper" ? "aspect-a4 h-20" : "aspect-print h-20"}
      pointerEvents="none"
    >
      {visibleArtefacts.map((_, index) => (
        <View
          key={index}
          className="absolute inset-0"
          style={{
            transform: [{ translateX: index * 3 }, { translateY: index * 2 }],
            zIndex: visibleArtefacts.length - index,
          }}
        >
          <ArtefactPreview entry={entry} index={index} />
        </View>
      ))}
    </View>
  );
};

type ArtefactPreviewProps = {
  entry: Entry;
  index: number;
};

export const ArtefactPreview = ({ entry, index }: ArtefactPreviewProps) => {
  if (entry.type === "print") {
    const artefact = entry.artefacts[index];

    return (
      <View
        className="border-controls-border bg-paper aspect-print h-20 items-center gap-0.5 overflow-hidden border pt-1.5 shadow-sm"
        pointerEvents="none"
      >
        <StyledImage
          className="aspect-print-image w-[80%]"
          source={artefact.img}
          contentFit="cover"
          cachePolicy="memory-disk"
          transition={0}
        />
        <Text className="text-primary font-paper" numberOfLines={1} style={{ fontSize: 6 }}>
          {artefact.text}
        </Text>
      </View>
    );
  }

  const artefact = entry.artefacts[index];

  return (
    <View
      className="border-controls-border bg-paper aspect-a4 h-20 overflow-hidden border p-1.5 shadow-sm"
      pointerEvents="none"
    >
      <Text
        className="text-primary font-paper"
        numberOfLines={9}
        style={{ fontSize: 6, lineHeight: 8 }}
      >
        {artefact.text}
      </Text>
    </View>
  );
};
