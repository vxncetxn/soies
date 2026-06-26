import { useState, ReactNode } from "react";
import { Dimensions, Pressable, ScrollView, Text, View } from "react-native";
import Animated, {
  FadeIn,
  FadeOut,
  interpolate,
  SharedValue,
  useAnimatedRef,
  useAnimatedStyle,
  useDerivedValue,
  useScrollOffset,
  useSharedValue,
  withSpring,
} from "react-native-reanimated";
import { Portal } from "react-native-teleport";
import { withUniwind } from "uniwind";

const StyledPortal = withUniwind(Portal);

const { width: SCREEN_WIDTH } = Dimensions.get("window");

const CARD_WIDTH = SCREEN_WIDTH - 80;
const END_WIDTH = SCREEN_WIDTH - 20;
const STACK_OFFSET = 8;
const CARD_GAP = 48;
const PAGE_WIDTH = END_WIDTH + CARD_GAP;

const SPRING_CONFIG = {
  stiffness: 900,
  damping: 110,
  mass: 4,
  overshootClamping: true,
  energyThreshold: 6e-9,
  velocity: 0,
} as const;

type CardProps = {
  index: number;
  progress: SharedValue<number>;
  currentPage: SharedValue<number>;
  activeIndex: SharedValue<number>;
  children: ReactNode;
};

const Card = ({ index, progress, currentPage, activeIndex, children }: CardProps) => {
  const animatedStyle = useAnimatedStyle(() => {
    const active = activeIndex.value;

    const expandedX = (index - currentPage.value) * PAGE_WIDTH;
    let collapsedX = 0;

    if (index !== active) {
      const distance = index - active;

      collapsedX = distance * STACK_OFFSET;
    }

    const translateX = interpolate(progress.value, [0, 1], [collapsedX, expandedX]);

    const scale = interpolate(progress.value, [0, 1], [1, END_WIDTH / CARD_WIDTH]);

    return {
      transform: [{ translateX }, { scale }],
      zIndex: index === active ? 100 : 100 - Math.abs(index - active),
    };
  });

  return (
    <Animated.View style={[animatedStyle]} className="absolute" pointerEvents="none">
      {children}
    </Animated.View>
  );
};

const Stack = ({ cards }) => {
  const [isExpanded, setIsExpanded] = useState(false);
  const [activePage, setActivePage] = useState(0);

  const scrollRef = useAnimatedRef<ScrollView>();
  const scrollOffset = useScrollOffset(scrollRef);
  const progress = useSharedValue(0);

  const currentPage = useDerivedValue(() => {
    return scrollOffset.value / PAGE_WIDTH;
  });

  const activeIndex = useDerivedValue(() => {
    return Math.round(currentPage.value);
  });

  const wrappedCards = cards.map((card, index) => (
    <Card
      key={index}
      index={index}
      progress={progress}
      currentPage={currentPage}
      activeIndex={activeIndex}
    >
      {card}
    </Card>
  ));

  const persistPage = () => {
    const page = Math.max(
      0,
      Math.min(cards.length - 1, Math.round(scrollOffset.value / PAGE_WIDTH)),
    );

    setActivePage(page);
  };

  const toggleExpanded = () => {
    const next = !isExpanded;

    if (!next) {
      persistPage();
    }

    setIsExpanded(next);

    progress.value = withSpring(next ? 1 : 0, SPRING_CONFIG);
  };

  const collapse = () => {
    persistPage();

    setIsExpanded(false);

    progress.value = withSpring(0, SPRING_CONFIG);
  };

  const restoreScroll = () => {
    scrollRef.current?.scrollTo({ x: activePage * PAGE_WIDTH, y: 0, animated: false });
  };

  return (
    <>
      {!isExpanded && (
        <Animated.View className="relative aspect-print max-h-[calc((100vw-80px)/210*297)] w-[calc(100vw-80px)]">
          {wrappedCards}
        </Animated.View>
      )}

      <Pressable onPress={toggleExpanded}>
        <Text>{isExpanded ? "Collapse" : "Expand"}</Text>
      </Pressable>

      {isExpanded && (
        <StyledPortal hostName="overlay" className="items-center justify-center">
          <Animated.View
            entering={FadeIn.duration(250)}
            exiting={FadeOut.duration(250)}
            className="absolute inset-0 items-center justify-center"
          >
            <Pressable className="absolute inset-0 bg-black/30" onPress={collapse} />

            <View
              className="relative aspect-print max-h-[calc((100vw-20px)/210*297)] w-[calc(100vw-20px)]"
              pointerEvents="box-none"
            >
              <Animated.ScrollView
                ref={scrollRef}
                horizontal
                snapToInterval={PAGE_WIDTH}
                decelerationRate="fast"
                showsHorizontalScrollIndicator={false}
                onLayout={restoreScroll}
                // style={StyleSheet.absoluteFillObject}
              >
                <View style={{ width: (cards.length - 1) * PAGE_WIDTH + END_WIDTH }} />
              </Animated.ScrollView>

              {wrappedCards}
            </View>
          </Animated.View>
        </StyledPortal>
      )}
    </>
  );
};

export default Stack;
