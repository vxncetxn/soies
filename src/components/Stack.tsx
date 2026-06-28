import { useCallback, useState, ReactNode } from "react";
import { Pressable, ScrollView, View, useWindowDimensions } from "react-native";
import Animated, {
  interpolate,
  useAnimatedRef,
  useAnimatedScrollHandler,
  useAnimatedStyle,
  useDerivedValue,
  useSharedValue,
  withSpring,
} from "react-native-reanimated";
import { Portal } from "react-native-teleport";
import { withUniwind } from "uniwind";

import type { Entry } from "../data/entries";

import { SPRING_CONFIG } from "../constants/animation";
import { LAYOUT } from "../constants/layout";
import ArtefactWrapper from "./ArtefactWrapper";
import { useExpandContext } from "./ExpandContext";
import { Icon } from "./Icon";
import Paper from "./Paper";
import Print from "./Print";
import { ArtefactPreview, ScrollIndicator } from "./ScrollIndicator";

const StyledPortal = withUniwind(Portal);

type StackProps = {
  entry: Entry;
};

const Stack = ({ entry }: StackProps) => {
  const { chromeProgress } = useExpandContext();
  const { width: SCREEN_WIDTH } = useWindowDimensions();
  const EXPANDED_WIDTH = SCREEN_WIDTH - 20;
  const PAGE_WIDTH = EXPANDED_WIDTH + LAYOUT.EXPANDED_STACK_GAP;

  const [isExpanded, setIsExpanded] = useState(false);
  const [activePage, setActivePage] = useState(0);

  const scrollRef = useAnimatedRef<ScrollView>();
  const scrollOffset = useSharedValue(0);
  const progress = useSharedValue(0);

  const onScroll = useAnimatedScrollHandler((event) => {
    scrollOffset.value = event.contentOffset.x;
  });

  const currentPage = useDerivedValue(() => {
    return scrollOffset.value / PAGE_WIDTH;
  });

  const activeIndex = useDerivedValue(() => {
    return Math.round(currentPage.value);
  });

  const closeBtnStyle = useAnimatedStyle(() => ({
    opacity: interpolate(progress.value, [0.2, 1], [0, 1]),
    transform: [{ translateY: interpolate(progress.value, [0.2, 1], [40, 0]) }],
  }));

  const wrapArtefact = (index: number, artefact: ReactNode) => (
    <ArtefactWrapper
      type={entry.type}
      key={index}
      index={index}
      progress={progress}
      currentPage={currentPage}
      activeIndex={activeIndex}
    >
      {artefact}
    </ArtefactWrapper>
  );

  const wrappedArtefacts =
    entry.type === "paper"
      ? entry.artefacts.map((artefact, index) =>
          wrapArtefact(index, <Paper key={index}>{artefact.text}</Paper>),
        )
      : entry.artefacts.map((artefact, index) =>
          wrapArtefact(
            index,
            <Print key={index} img={artefact.img}>
              {artefact.text}
            </Print>,
          ),
        );

  const persistPage = () => {
    const page = Math.max(
      0,
      Math.min(entry.artefacts.length - 1, Math.round(scrollOffset.value / PAGE_WIDTH)),
    );

    setActivePage(page);
  };

  const expand = () => {
    setIsExpanded(true);

    progress.value = withSpring(1, SPRING_CONFIG);
    chromeProgress.value = withSpring(1, SPRING_CONFIG);
  };

  const collapse = () => {
    persistPage();

    setIsExpanded(false);

    progress.value = withSpring(0, SPRING_CONFIG);
    chromeProgress.value = withSpring(0, SPRING_CONFIG);
  };

  const restoreScroll = () => {
    scrollRef.current?.scrollTo({ x: activePage * PAGE_WIDTH, y: 0, animated: false });
    scrollOffset.value = activePage * PAGE_WIDTH;
  };

  const jumpToArtefact = useCallback(
    (index: number) => {
      scrollRef.current?.scrollTo({ x: index * PAGE_WIDTH, y: 0, animated: false });
      scrollOffset.value = index * PAGE_WIDTH;
      setActivePage(index);
    },
    [PAGE_WIDTH, scrollOffset, scrollRef],
  );

  return (
    <>
      {!isExpanded && (
        <Pressable onPress={expand}>
          <Animated.View
            className={`${entry.type === "paper" ? "aspect-a4" : "aspect-print"} relative max-h-[calc((100vw-80px)/210*297)] w-[calc(100vw-80px)]`}
          >
            {wrappedArtefacts}
          </Animated.View>
        </Pressable>
      )}

      {isExpanded && (
        <StyledPortal hostName="overlay" className="items-center justify-center">
          <View className="absolute inset-0 items-center justify-center">
            <Pressable className="absolute inset-0" onPress={collapse} />
            <View
              className={`${entry.type === "paper" ? "aspect-a4" : "aspect-print"} relative max-h-[calc((100vw-80px)/210*297)] w-[calc(100vw-80px)]`}
              pointerEvents="box-none"
            >
              <Animated.ScrollView
                ref={scrollRef}
                horizontal
                snapToInterval={PAGE_WIDTH}
                decelerationRate="fast"
                showsHorizontalScrollIndicator={false}
                scrollEventThrottle={16}
                onScroll={onScroll}
                onLayout={restoreScroll}
              >
                <View
                  style={{ width: (entry.artefacts.length - 1) * PAGE_WIDTH + EXPANDED_WIDTH }}
                />
              </Animated.ScrollView>

              {wrappedArtefacts}
            </View>
            <View
              style={{ zIndex: 200 }}
              className="absolute bottom-24 left-1/2 -translate-x-1/2"
              pointerEvents="box-none"
            >
              <ScrollIndicator
                orientation="horizontal"
                count={entry.artefacts.length}
                currentPage={currentPage}
                maxVisible={5}
                onJumpToIndex={jumpToArtefact}
                renderPreview={(index) => <ArtefactPreview entry={entry} index={index} />}
              />
            </View>
            <View
              style={{ zIndex: 210 }}
              className="absolute bottom-10 left-1/2 -translate-x-1/2"
              pointerEvents="box-none"
            >
              <Animated.View style={closeBtnStyle}>
                <Pressable
                  onPress={collapse}
                  accessibilityRole="button"
                  accessibilityLabel="Close entry"
                  className="rounded-full border border-controls-border bg-controls-background p-3"
                >
                  <Icon name="x-mark" size={22} color="#79716B" />
                </Pressable>
              </Animated.View>
            </View>
          </View>
        </StyledPortal>
      )}
    </>
  );
};

export default Stack;
