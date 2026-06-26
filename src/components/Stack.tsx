import { useState, PropsWithChildren } from "react";
import { Dimensions, Pressable, Text } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
// import { Portal } from "react-native-teleport";
// import { withUniwind } from "uniwind";
import Animated, {
  clamp,
  FadeIn,
  FadeOut,
  interpolate,
  useAnimatedStyle,
  useDerivedValue,
  useSharedValue,
  withSpring,
} from "react-native-reanimated";

// const StyledPortal = withUniwind(Portal);

const { width: SCREEN_WIDTH } = Dimensions.get("window");

const CARD_WIDTH = SCREEN_WIDTH - 80;
const END_WIDTH = SCREEN_WIDTH - 20;
const STACK_OFFSET = 8;

const Card = ({ index, progress, currentPage, activeIndex, children }) => {
  const animatedStyle = useAnimatedStyle(() => {
    const active = activeIndex.value;

    const expandedX = (index - currentPage.value) * END_WIDTH;
    let collapsedX = 0;

    if (index !== active) {
      const distance = index - active;

      collapsedX = distance * STACK_OFFSET;
    }

    const translateX = interpolate(progress.value, [0, 1], [collapsedX, expandedX]);

    const scale = interpolate(progress.value, [0, 1], [1, END_WIDTH / CARD_WIDTH]);

    // const rotate = interpolate(
    //   progress.value,
    //   [0, 1],
    //   [index === active ? 0 : distanceRotation(index, active), 0],
    // );

    return {
      transform: [
        { translateX },
        { scale },
        // {
        //   rotateZ: `${rotate}deg`,
        // },
      ],

      zIndex: index === active ? 100 : -Math.abs(index - active),
    };
  });

  return (
    <Animated.View style={[animatedStyle]} className="absolute">
      {children}
    </Animated.View>
  );
};

const Stack = ({ children }: PropsWithChildren) => {
  const [isExpanded, setIsExpanded] = useState(false);
  // const [activeIndex, setActiveIndex] = useState(3);

  const currentPage = useSharedValue(0);
  const gestureStartPage = useSharedValue(0);
  const progress = useSharedValue(0);

  const activeIndex = useDerivedValue(() => {
    return Math.round(currentPage.value);
  });

  const pan = Gesture.Pan()
    .enabled(isExpanded)
    .onBegin(() => {
      gestureStartPage.value = currentPage.value;
    })
    .onUpdate((event) => {
      const deltaPages = event.translationX / CARD_WIDTH;

      const nextPage = gestureStartPage.value - deltaPages;

      currentPage.value = clamp(nextPage, 0, 5 - 1);
    })
    .onEnd(() => {
      currentPage.value = withSpring(Math.round(currentPage.value), {
        stiffness: 900,
        damping: 110,
        mass: 4,
        overshootClamping: true,
        energyThreshold: 6e-9,
        velocity: 0,
      });
    });

  return (
    <>
      <GestureDetector gesture={pan}>
        <Animated.View
          className="relative aspect-print max-h-[calc((100vw-80px)/210*297)] w-[calc(100vw-80px)]"
          entering={FadeIn.duration(250)}
          exiting={FadeOut.duration(250)}
        >
          {/*<View className="absolute top-0 left-0 translate-x-6 transform">{children}</View>*/}
          {/*<View className="absolute top-0 left-0 translate-x-4 transform">{children}</View>*/}
          {/*<View className="absolute top-0 left-0 translate-x-2 transform">{children}</View>*/}
          {/*<View className="absolute top-0 left-0 translate-x-0 transform">{children}</View>*/}
          <Card index={0} progress={progress} currentPage={currentPage} activeIndex={activeIndex}>
            {children}
          </Card>
          <Card index={1} progress={progress} currentPage={currentPage} activeIndex={activeIndex}>
            {children}
          </Card>
          <Card index={2} progress={progress} currentPage={currentPage} activeIndex={activeIndex}>
            {children}
          </Card>
          <Card index={3} progress={progress} currentPage={currentPage} activeIndex={activeIndex}>
            {children}
          </Card>
          <Card index={4} progress={progress} currentPage={currentPage} activeIndex={activeIndex}>
            {children}
          </Card>
        </Animated.View>
      </GestureDetector>
      <Pressable
        onPress={() => {
          const next = !isExpanded;

          setIsExpanded(next);

          progress.value = withSpring(next ? 1 : 0, {
            stiffness: 900,
            damping: 110,
            mass: 4,
            overshootClamping: true,
            energyThreshold: 6e-9,
            velocity: 0,
          });
        }}
      >
        <Text>Expand</Text>
      </Pressable>
      {/*<Pressable className="absolute right-0 bottom-0 left-0 h-16" />*/}
      {/*{isExpanded && (*/}
      {/*  <StyledPortal hostName={"overlay"} className="items-center justify-center">*/}
      {/*    <Pressable onPress={() => setIsExpanded(false)}>*/}
      {/*      <Animated.View*/}
      {/*        className="aspect-print max-h-[calc((100vw-20px)/210*297)] w-[calc(100vw-20px)]"*/}
      {/*        entering={FadeIn.duration(250)}*/}
      {/*        exiting={FadeOut.duration(250)}*/}
      {/*      >*/}
      {/*        {children}*/}
      {/*      </Animated.View>*/}
      {/*    </Pressable>*/}
      {/*  </StyledPortal>*/}
      {/*)}*/}
    </>
  );
};

export default Stack;
