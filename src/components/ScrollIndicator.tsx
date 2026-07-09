/**
 * ScrollIndicator — long-press rail that expands into a scrubber with previews.
 *
 * Gesture handling stays on the RN/JS thread via the View responder system
 * (long-press timer + scrub pan). We intentionally avoid `GestureDetector`:
 * under StrictMode it always calls `findNodeHandle` on its child (RNGH #6997),
 * which surfaces as a redbox on app load even when the child is a plain View.
 *
 * The responder callbacks already run on RN/JS, so scrub jumps call the latest
 * `onJumpToIndex` directly from `sessionRef`; only the visual animation remains
 * on the UI thread. An earlier port retained a `pendingJumpIndex` React-state
 * bridge from the Gesture worklet implementation. Besides rendering once per
 * crossed page, that bridge dropped a later jump to the same integer because
 * React correctly ignored the equal state value. Direct delivery preserves
 * repeated targets across scrub sessions and removes an unnecessary thread hop.
 *
 * `DayPager` and expanded `Stack` own the actual ScrollViews and callbacks.
 * This component only converts pointer travel into a clamped page index and
 * renders the sliding dot/preview window in vertical or horizontal orientation.
 */
import { Image } from "expo-image";
import { ReactNode, useEffect, useRef, useState } from "react";
import { GestureResponderEvent, Text, View } from "react-native";
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

import {
  LONG_PRESS_MAX_DISTANCE_PX,
  SCROLL_INDICATOR_LONG_PRESS_MIN_DURATION_MS,
} from "../constants/interaction";
import { isPrintArtefact, isUnknownArtefact } from "../data/entries";
import { triggerLongPressHaptic } from "../utils/haptics";

const StyledImage = withUniwind(Image);

type ScrollIndicatorOrientation = "vertical" | "horizontal";

type ScrollIndicatorProps = {
  /** Major axis for rail layout, drag distance, and active-pill stretching. */
  orientation: ScrollIndicatorOrientation;
  /** Total host pages; indices emitted to the host are clamped to this range. */
  count: number;
  /** Fractional host page written on the UI thread by the owning ScrollView. */
  currentPage: SharedValue<number>;
  /** Maximum dots/previews rendered around the active page; defaults to five. */
  maxVisible?: number;
  /** Host positioning classes; the indicator owns only its internal layout. */
  className?: string;
  /** Host-owned thumbnail renderer for one visible page index. */
  renderPreview: (index: number) => ReactNode;
  /** RN-thread imperative jump owned by DayPager or an expanded Stack. */
  onJumpToIndex: (index: number) => void;
};

type IndicatorItemProps = {
  orientation: ScrollIndicatorOrientation;
  index: number;
  currentPage: SharedValue<number>;
};

const IndicatorItem = ({ orientation, index, currentPage }: IndicatorItemProps) => {
  const inactiveStyle = useAnimatedStyle(() => {
    const active = 1 - Math.min(1, Math.abs(currentPage.get() - index));

    return {
      opacity: interpolate(active, [0, 1], [1, 0]),
      transform: [{ scale: interpolate(active, [0, 1], [1, 0.65]) }],
    };
  });

  const activeStyle = useAnimatedStyle(() => {
    const active = 1 - Math.min(1, Math.abs(currentPage.get() - index));
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
      <Animated.View style={inactiveStyle} className="h-1.5 w-1.5 rounded-full bg-icon" />
      <Animated.View
        style={activeStyle}
        className="absolute rounded-full bg-secondary"
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
    const active = 1 - Math.min(1, Math.abs(currentPage.get() - index));

    return {
      opacity: interpolate(active, [0, 1], [0.65, 1]),
      transform: [{ scale: interpolate(active, [0, 1], [0.92, 1]) }],
    };
  });

  return <Animated.View style={style}>{children}</Animated.View>;
};

/**
 * Builds the bounded sliding window on RN. The UI-thread reaction updates only
 * the rounded active index, so fractional scrolling never relays out the list.
 */
const computeVisibleIndices = (count: number, maxVisible: number, activeIndex: number) => {
  const visibleCount = Math.min(count, maxVisible);
  const halfWindow = Math.floor(visibleCount / 2);
  const start = Math.min(Math.max(activeIndex - halfWindow, 0), count - visibleCount);

  return Array.from({ length: visibleCount }, (_, index) => start + index);
};

type ScrubSession = {
  /** Latest prop values read by responder callbacks between React renders. */
  orientation: ScrollIndicatorOrientation;
  /** Mutable gesture truth; set before React's expanded render commits. */
  expanded: boolean;
  /** Page captured when the long press arms, making travel relative. */
  panStartIndex: number;
  /** Per-session dedupe; reset on collapse so repeated future targets work. */
  lastJumpIndex: number;
  /** Measured major-axis rail length used to derive pixels per page. */
  railSize: number;
  count: number;
  onJumpToIndex: (index: number) => void;
  /** JS long-press timer, owned here so termination and unmount can cancel it. */
  longPressTimer: ReturnType<typeof setTimeout> | null;
};

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
  const sessionRef = useRef<ScrubSession>({
    orientation,
    expanded: false,
    panStartIndex: 0,
    lastJumpIndex: -1,
    railSize: 1,
    count,
    onJumpToIndex,
    longPressTimer: null,
  });

  const visibleIndices = computeVisibleIndices(count, maxVisible, activeIndex);

  useEffect(() => {
    const session = sessionRef.current;
    session.orientation = orientation;
    session.count = count;
    session.onJumpToIndex = onJumpToIndex;
  }, [orientation, count, onJumpToIndex]);

  useEffect(() => {
    const session = sessionRef.current;
    return () => {
      if (session.longPressTimer != null) {
        clearTimeout(session.longPressTimer);
      }
    };
  }, []);

  useAnimatedReaction(
    () => Math.max(0, Math.min(count - 1, Math.round(currentPage.get()))),
    (next, previous) => {
      if (next !== previous) {
        scheduleOnRN(setActiveIndex, next);
      }
    },
    [count],
  );

  /** Cancel the RN timer after drift, release, termination, or restart. */
  const clearLongPressTimer = () => {
    const session = sessionRef.current;
    if (session.longPressTimer != null) {
      clearTimeout(session.longPressTimer);
      session.longPressTimer = null;
    }
  };

  /** End the current RN responder session and animate the scrubber closed. */
  const collapseScrub = () => {
    const session = sessionRef.current;
    clearLongPressTimer();
    session.expanded = false;
    session.lastJumpIndex = -1;
    expandedProgress.set(withTiming(0));
    setExpanded(false);
  };

  /** Arm scrubbing from the host's live page after the hold duration elapses. */
  const expandScrub = () => {
    const session = sessionRef.current;
    triggerLongPressHaptic();
    session.expanded = true;
    session.panStartIndex = Math.max(0, Math.min(session.count - 1, Math.round(currentPage.get())));
    session.lastJumpIndex = session.panStartIndex;
    expandedProgress.set(withSpring(1));
    setExpanded(true);
  };

  // Raw View responders don't pass PanResponderGestureState. Track start page
  // coords and compute deltas ourselves.
  const touchOriginRef = useRef({ pageX: 0, pageY: 0 });

  const handleResponderGrant = (event: GestureResponderEvent) => {
    const touch = event.nativeEvent.touches[0] ?? event.nativeEvent;
    touchOriginRef.current = { pageX: touch.pageX, pageY: touch.pageY };
    clearLongPressTimer();
    sessionRef.current.longPressTimer = setTimeout(() => {
      sessionRef.current.longPressTimer = null;
      expandScrub();
    }, SCROLL_INDICATOR_LONG_PRESS_MIN_DURATION_MS);
  };

  const handleResponderMove = (event: GestureResponderEvent) => {
    const session = sessionRef.current;
    const touch = event.nativeEvent.touches[0] ?? event.nativeEvent;
    const dx = touch.pageX - touchOriginRef.current.pageX;
    const dy = touch.pageY - touchOriginRef.current.pageY;
    const travel = Math.hypot(dx, dy);

    // Cancel pending long-press if the finger drifts too far before arming
    // (same idea as RNGH LongPress maxDistance).
    if (!session.expanded && travel > LONG_PRESS_MAX_DISTANCE_PX) {
      clearLongPressTimer();
      return;
    }

    if (!session.expanded) {
      return;
    }

    const itemSize = session.railSize / Math.max(1, session.count);
    const delta = session.orientation === "vertical" ? dy : dx;
    const indexDelta = itemSize > 0 ? Math.round(delta / itemSize) : 0;
    const nextIndex = Math.max(0, Math.min(session.count - 1, session.panStartIndex + indexDelta));

    if (nextIndex !== session.lastJumpIndex) {
      session.lastJumpIndex = nextIndex;
      // Raw View responders execute on RN/JS, so no scheduleOnRN bridge is
      // needed. Calling directly also allows the same index in a later session.
      session.onJumpToIndex(nextIndex);
    }
  };

  const handleRailLayout = (event: {
    nativeEvent: { layout: { width: number; height: number } };
  }) => {
    const next =
      orientation === "vertical" ? event.nativeEvent.layout.height : event.nativeEvent.layout.width;
    if (next > 0) {
      sessionRef.current.railSize = next;
    }
  };

  const expandedStyle = useAnimatedStyle(() => ({
    opacity: expandedProgress.get(),
    transform: [{ scale: interpolate(expandedProgress.get(), [0, 1], [0.96, 1]) }],
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
      onLayout={handleRailLayout}
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
    <View
      className={className}
      onStartShouldSetResponder={() => true}
      onMoveShouldSetResponder={() => true}
      // Use React state (not sessionRef) so RC does not see a render-time ref read
      // in this prop closure. `expanded` stays in sync with the scrub session.
      onResponderTerminationRequest={() => !expanded}
      onResponderGrant={handleResponderGrant}
      onResponderMove={handleResponderMove}
      onResponderRelease={collapseScrub}
      onResponderTerminate={collapseScrub}
      accessibilityRole="adjustable"
      accessibilityLabel="Scroll indicator"
      accessibilityHint="Long press and drag to scrub pages"
    >
      {expanded ? (
        <Animated.View
          style={expandedStyle}
          className={
            orientation === "vertical"
              ? "flex-row items-center gap-3 rounded-4xl border border-controls-border bg-controls-background p-3"
              : "items-center gap-2 rounded-4xl border border-controls-border bg-controls-background p-3"
          }
        >
          {previews}
          {rail}
        </Animated.View>
      ) : (
        <View className="rounded-4xl border border-controls-border bg-controls-background">
          {rail}
        </View>
      )}
    </View>
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
  // Render by the artefact's own shape (not the entry's primary type) so a
  // future/unknown artefact type renders a placeholder instead of crashing on
  // a missing imagePath, and mixed-type entries preview correctly.
  const artefact = entry.artefacts[index];

  if (isPrintArtefact(artefact)) {
    return (
      <View
        className="aspect-print h-20 items-center gap-0.5 overflow-hidden border border-controls-border bg-paper pt-1.5 shadow-sm"
        pointerEvents="none"
      >
        <StyledImage
          className="aspect-print-image w-[80%]"
          source={artefact.imagePath}
          contentFit="cover"
          cachePolicy="memory-disk"
          transition={0}
        />
        <Text className="font-paper text-primary" numberOfLines={1} style={{ fontSize: 6 }}>
          {artefact.text}
        </Text>
      </View>
    );
  }

  if (isUnknownArtefact(artefact)) {
    return (
      <View
        className="aspect-print h-20 items-center justify-center overflow-hidden border border-controls-border bg-paper p-1.5 shadow-sm"
        pointerEvents="none"
      >
        <Text className="font-paper text-primary" numberOfLines={3} style={{ fontSize: 6 }}>
          Unsupported artefact
        </Text>
      </View>
    );
  }

  return (
    <View
      className="aspect-a4 h-20 overflow-hidden border border-controls-border bg-paper p-1.5 shadow-sm"
      pointerEvents="none"
    >
      <Text
        className="font-paper text-primary"
        numberOfLines={9}
        style={{ fontSize: 6, lineHeight: 8 }}
      >
        {artefact.text}
      </Text>
    </View>
  );
};
