/**
 * CreateArtefactPager — horizontal artefact pager for Create Paper / Print.
 *
 * Pages are SCREEN_WIDTH wide (true paging — no mini-scroll slack). Each page
 * centers an EXPANDED_WIDTH (= screen − 20) card so gutters are 10px each side.
 * ScrollIndicator uses fractional currentPage = offset / SCREEN_WIDTH.
 *
 * Create-specific:
 *   - `scrollEnabled` false in Type state (Prev/Next jump programmatically)
 *   - ScrollIndicator only when `showScrollIndicator` (default state)
 *   - Optional entrance animation on a newly appended page (fade + translateY)
 *   - Suppresses TextInput focus that would follow a horizontal drag
 */
import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
  type ReactNode,
  type RefObject,
} from "react";
import { ScrollView, View, useWindowDimensions } from "react-native";
import Animated, {
  Easing,
  runOnJS,
  useAnimatedRef,
  useAnimatedScrollHandler,
  useAnimatedStyle,
  useDerivedValue,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";

import { ScrollIndicator } from "./ScrollIndicator";

/** Mount active page ± this many neighbors (keeps Print image decode bounded). */
const PAGE_WINDOW_RADIUS = 1;

export type CreateArtefactPagerHandle = {
  jumpToIndex: (index: number, animated?: boolean) => void;
};

type CreateArtefactPagerProps = {
  count: number;
  /** Stable React keys per page (artefact ids). Falls back to index. */
  pageKeys?: string[];
  scrollEnabled: boolean;
  showScrollIndicator: boolean;
  onActiveIndexChange: (index: number) => void;
  renderPage: (index: number) => ReactNode;
  renderPreview: (index: number) => ReactNode;
  /** When set, that page plays an enter fade/slide once. */
  enteringIndex?: number | null;
  onEnteringComplete?: () => void;
  /**
   * When true, EditablePaper/Print should ignore focus (horizontal drag just
   * ended on top of the input). Cleared after a short grace by the pager.
   */
  suppressArtefactFocusRef?: RefObject<boolean>;
};

type EnteringWrapProps = {
  entering: boolean;
  onEnteringComplete?: () => void;
  children: ReactNode;
};

const EnteringWrap = ({ entering, onEnteringComplete, children }: EnteringWrapProps) => {
  const enterProgress = useSharedValue(entering ? 0 : 1);

  useEffect(() => {
    if (!entering) {
      enterProgress.set(1);
      return;
    }
    enterProgress.set(0);
    enterProgress.set(
      withTiming(1, { duration: 320, easing: Easing.out(Easing.cubic) }, (finished) => {
        if (finished && onEnteringComplete) {
          runOnJS(onEnteringComplete)();
        }
      }),
    );
  }, [entering, enterProgress, onEnteringComplete]);

  const style = useAnimatedStyle(() => {
    const enter = enterProgress.get();
    return {
      opacity: enter,
      transform: [{ translateY: (1 - enter) * 28 }],
      flex: 1,
    };
  });

  return <Animated.View style={style}>{children}</Animated.View>;
};

const CreateArtefactPager = forwardRef<CreateArtefactPagerHandle, CreateArtefactPagerProps>(
  function CreateArtefactPager(
    {
      count,
      pageKeys,
      scrollEnabled,
      showScrollIndicator,
      onActiveIndexChange,
      renderPage,
      renderPreview,
      enteringIndex = null,
      onEnteringComplete,
      suppressArtefactFocusRef,
    },
    ref,
  ) {
    const { width: SCREEN_WIDTH } = useWindowDimensions();
    // True page width = screen so snap has zero free-scroll slack.
    const PAGE_WIDTH = SCREEN_WIDTH;
    const EXPANDED_WIDTH = SCREEN_WIDTH - 20;

    const scrollRef = useAnimatedRef<ScrollView>();
    const scrollOffset = useSharedValue(0);
    const currentPage = useDerivedValue(() =>
      PAGE_WIDTH === 0 ? 0 : scrollOffset.get() / PAGE_WIDTH,
    );

    const activeIndexRef = useRef(0);
    const [windowCenter, setWindowCenter] = useState(0);
    const suppressClearTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
    /** True while jumpToIndex drives scroll — must not arm drag-focus suppress. */
    const programmaticScrollRef = useRef(false);

    const armFocusSuppress = useCallback(() => {
      if (!suppressArtefactFocusRef) {
        return;
      }
      suppressArtefactFocusRef.current = true;
      if (suppressClearTimer.current) {
        clearTimeout(suppressClearTimer.current);
      }
      // Keep suppress through the touch-up → focus race after a drag.
      suppressClearTimer.current = setTimeout(() => {
        suppressArtefactFocusRef.current = false;
      }, 400);
    }, [suppressArtefactFocusRef]);

    const finishScrollSettle = useCallback(() => {
      if (programmaticScrollRef.current) {
        programmaticScrollRef.current = false;
        return;
      }
      armFocusSuppress();
    }, [armFocusSuppress]);

    const publishActive = useCallback(
      (index: number) => {
        const clamped = Math.max(0, Math.min(Math.max(count - 1, 0), index));
        if (activeIndexRef.current === clamped) {
          return;
        }
        activeIndexRef.current = clamped;
        setWindowCenter(clamped);
        // Parent update outside any setState updater to avoid render-phase warnings.
        onActiveIndexChange(clamped);
      },
      [count, onActiveIndexChange],
    );

    const shouldMountPage = useCallback(
      (index: number) => {
        if (enteringIndex === index) {
          return true;
        }
        return Math.abs(index - windowCenter) <= PAGE_WINDOW_RADIUS;
      },
      [enteringIndex, windowCenter],
    );

    const onScroll = useAnimatedScrollHandler({
      onBeginDrag: () => {
        // User finger drag only — programmatic jumps never hit this.
        runOnJS(armFocusSuppress)();
      },
      onScroll: (event) => {
        scrollOffset.set(event.contentOffset.x);
      },
      onMomentumEnd: (event) => {
        const index = Math.round(event.contentOffset.x / PAGE_WIDTH);
        runOnJS(publishActive)(index);
        runOnJS(finishScrollSettle)();
      },
      onEndDrag: (event) => {
        const index = Math.round(event.contentOffset.x / PAGE_WIDTH);
        runOnJS(publishActive)(index);
        runOnJS(finishScrollSettle)();
      },
    });

    const jumpToIndex = useCallback(
      (index: number, animated = true) => {
        const clamped = Math.max(0, Math.min(Math.max(count - 1, 0), index));
        programmaticScrollRef.current = animated;
        scrollRef.current?.scrollTo({
          x: clamped * PAGE_WIDTH,
          y: 0,
          animated,
        });
        scrollOffset.set(clamped * PAGE_WIDTH);
        publishActive(clamped);
        if (!animated) {
          programmaticScrollRef.current = false;
        }
      },
      [PAGE_WIDTH, count, publishActive, scrollOffset, scrollRef],
    );

    useImperativeHandle(ref, () => ({ jumpToIndex }), [jumpToIndex]);

    // Keep active index in range when count changes — not during render.
    useEffect(() => {
      if (count > 0 && activeIndexRef.current > count - 1) {
        jumpToIndex(count - 1, false);
      }
    }, [count, jumpToIndex]);

    useEffect(() => {
      return () => {
        if (suppressClearTimer.current) {
          clearTimeout(suppressClearTimer.current);
        }
      };
    }, []);

    return (
      <View className="flex-1" pointerEvents="box-none">
        <Animated.ScrollView
          ref={scrollRef}
          horizontal
          pagingEnabled
          scrollEnabled={scrollEnabled}
          decelerationRate="fast"
          showsHorizontalScrollIndicator={false}
          scrollEventThrottle={16}
          onScroll={onScroll}
          keyboardShouldPersistTaps="handled"
          style={{ flex: 1 }}
        >
          {Array.from({ length: count }, (_, index) => (
            <View
              key={pageKeys?.[index] ?? String(index)}
              style={{ width: PAGE_WIDTH, flex: 1 }}
              className="items-center"
            >
              <View style={{ width: EXPANDED_WIDTH, flex: 1 }}>
                {shouldMountPage(index) ? (
                  <EnteringWrap
                    entering={enteringIndex === index}
                    onEnteringComplete={enteringIndex === index ? onEnteringComplete : undefined}
                  >
                    {renderPage(index)}
                  </EnteringWrap>
                ) : (
                  <View style={{ flex: 1 }} />
                )}
              </View>
            </View>
          ))}
        </Animated.ScrollView>

        {showScrollIndicator && count > 0 ? (
          <View
            style={{ zIndex: 200 }}
            className="absolute bottom-28 left-1/2 -translate-x-1/2"
            pointerEvents="box-none"
          >
            <ScrollIndicator
              orientation="horizontal"
              count={count}
              currentPage={currentPage}
              maxVisible={5}
              onJumpToIndex={(index) => jumpToIndex(index, true)}
              renderPreview={renderPreview}
            />
          </View>
        ) : null}
      </View>
    );
  },
);

export default CreateArtefactPager;
