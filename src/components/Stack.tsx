/**
 * Stack — one Entry's collapsed deck and retained fullscreen pager.
 *
 * React phases coordinate the portal lifecycle. Ease owns the discrete bloom
 * endpoints, while Reanimated remains responsible only for fractional pager
 * position and indicator interpolation.
 */
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { Pressable, ScrollView, View, useWindowDimensions } from "react-native";
import { EaseView } from "react-native-ease/uniwind";
import Animated, {
  useAnimatedRef,
  useAnimatedScrollHandler,
  useDerivedValue,
  useSharedValue,
} from "react-native-reanimated";
import { Portal } from "react-native-teleport";
import { withUniwind } from "uniwind";

import type { Entry } from "../data/entries";

import { EASE_DEFAULT_TIMING, EASE_STACK_EXPANSION_SPRING } from "../constants/animation";
import { LAYOUT } from "../constants/layout";
import { useReducedMotionPreference } from "../hooks/useReducedMotionPreference";
import { useShare } from "../share/ShareContext";
import { useFeaturedWidgets } from "../widgets/FeaturedWidgetsContext";
import CollapsedDeck, { useWrappedArtefacts } from "./CollapsedDeck";
import { useExpandContext } from "./ExpandContext";
import FocusOverlay, { type FocusMenuItem } from "./FocusOverlay";
import { Icon } from "./Icon";
import LongPressable from "./LongPressable";
import { ArtefactPreview, ScrollIndicator } from "./ScrollIndicator";

const StyledPortal = withUniwind(Portal);
const CLOSE_TRAVEL_Y = 40;
const CLOSE_FADE_MS = 220;
const CLOSE_FADE_DELAY_MS = 60;

type StackProps = {
  entry: Entry;
  /** Exact child requested by a consumed widget URL; null for normal Home use. */
  widgetArtefactId?: string | null;
  /** Clears the one-shot command after the expanded pager owns the target. */
  onWidgetTargetConsumed?: () => void;
  /** Entry-transition request targeting the collapsed first Artefact. */
  firstArtefactReadinessRequestId?: number | null;
  /** Reports when the first Paper lays out or first Print displays/errors. */
  onFirstArtefactReady?: (requestId: number) => void;
};

const Stack = ({
  entry,
  widgetArtefactId = null,
  onWidgetTargetConsumed,
  firstArtefactReadinessRequestId,
  onFirstArtefactReady,
}: StackProps) => {
  const {
    state: expansion,
    requestExpand,
    requestCollapse,
    portalReady,
    motionFinished,
    releaseOwner,
  } = useExpandContext();
  const reduceMotionEnabled = useReducedMotionPreference();
  const { openShare } = useShare();
  const { supported: featuredWidgetsSupported, openPicker: openWidgetPicker } =
    useFeaturedWidgets();
  const { width: screenWidth } = useWindowDimensions();
  const expandedWidth = screenWidth - 20;
  const pageWidth = expandedWidth + LAYOUT.EXPANDED_STACK_GAP;

  const [focusMounted, setFocusMounted] = useState(false);
  const [focusOpen, setFocusOpen] = useState(false);
  const [activePageState, setActivePage] = useState(0);
  const handledWidgetArtefactIdRef = useRef<string | null>(null);
  const previousEntryRef = useRef(entry);
  const pendingShareRef = useRef<{ entry: Entry; page: number } | null>(null);
  const pendingWidgetPickerRef = useRef<{ entry: Entry; page: number } | null>(null);
  type PendingFocusAction = "share" | "widgetPicker" | null;
  const pendingFocusActionRef = useRef<PendingFocusAction>(null);

  const triggerRef = useAnimatedRef<Animated.View>();
  const scrollRef = useAnimatedRef<ScrollView>();
  const scrollOffset = useSharedValue(0);
  const activePage = Math.max(0, Math.min(entry.artefacts.length - 1, activePageState));
  const ownsExpansion = expansion.ownerEntryId === entry.id;
  const portalMounted = ownsExpansion && expansion.phase !== "collapsed";
  const portalExpanded =
    ownsExpansion && (expansion.phase === "expanding" || expansion.phase === "expanded");
  const canonicalDeckVisible = !ownsExpansion || expansion.phase === "preparing";
  const motionRequestId =
    ownsExpansion && (expansion.phase === "expanding" || expansion.phase === "collapsing")
      ? expansion.requestId
      : null;

  useLayoutEffect(() => {
    if (previousEntryRef.current === entry) {
      return;
    }
    previousEntryRef.current = entry;
    setActivePage(0);
    scrollOffset.set(0);
  }, [entry, scrollOffset]);

  useEffect(() => () => releaseOwner(entry.id), [entry.id, releaseOwner]);

  const onScroll = useAnimatedScrollHandler((event) => {
    scrollOffset.set(event.contentOffset.x);
  });
  const currentPage = useDerivedValue(() => scrollOffset.get() / pageWidth);
  const activeIndex = useDerivedValue(() => Math.round(currentPage.get()));

  const persistPage = () => {
    const page = Math.max(
      0,
      Math.min(entry.artefacts.length - 1, Math.round(scrollOffset.get() / pageWidth)),
    );
    setActivePage(page);
    scrollRef.current?.scrollTo({ x: page * pageWidth, y: 0, animated: false });
    scrollOffset.set(page * pageWidth);
    return page;
  };

  const expand = () => {
    requestExpand(entry.id, false);
  };

  const collapse = () => {
    persistPage();
    requestCollapse(entry.id);
  };

  const restoreScroll = () => {
    scrollRef.current?.scrollTo({ x: activePage * pageWidth, y: 0, animated: false });
    scrollOffset.set(activePage * pageWidth);
    if (ownsExpansion && expansion.phase === "preparing" && expansion.requestId !== null) {
      portalReady(entry.id, expansion.requestId);
      if (widgetArtefactId && handledWidgetArtefactIdRef.current === widgetArtefactId) {
        onWidgetTargetConsumed?.();
      }
    }
  };

  const jumpToArtefact = (index: number) => {
    scrollRef.current?.scrollTo({ x: index * pageWidth, y: 0, animated: false });
    scrollOffset.set(index * pageWidth);
    setActivePage(index);
  };

  const widgetTargetPage = widgetArtefactId
    ? entry.artefacts.findIndex((artefact) => artefact.id === widgetArtefactId)
    : -1;

  useLayoutEffect(() => {
    if (!widgetArtefactId) {
      handledWidgetArtefactIdRef.current = null;
      return;
    }

    // Widget commands arrive as external route state. Defer the resulting
    // React updates to the next frame so this layout effect only subscribes to
    // that external change instead of synchronously cascading a render.
    const frame = requestAnimationFrame(() => {
      if (widgetTargetPage < 0 || handledWidgetArtefactIdRef.current === widgetArtefactId) {
        return;
      }

      handledWidgetArtefactIdRef.current = widgetArtefactId;
      setActivePage(widgetTargetPage);
      scrollOffset.set(widgetTargetPage * pageWidth);

      if (ownsExpansion && portalMounted) {
        scrollRef.current?.scrollTo({
          x: widgetTargetPage * pageWidth,
          y: 0,
          animated: false,
        });
        if (expansion.phase === "collapsing") {
          requestExpand(entry.id, false);
        }
        onWidgetTargetConsumed?.();
        return;
      }

      const replacingOwner = expansion.ownerEntryId !== null && expansion.ownerEntryId !== entry.id;
      requestExpand(entry.id, replacingOwner);
    });

    return () => cancelAnimationFrame(frame);
  }, [
    entry.id,
    expansion.ownerEntryId,
    expansion.phase,
    onWidgetTargetConsumed,
    ownsExpansion,
    pageWidth,
    portalMounted,
    requestExpand,
    scrollOffset,
    scrollRef,
    widgetArtefactId,
    widgetTargetPage,
  ]);

  const wrappedArtefacts = useWrappedArtefacts({
    entry,
    expanded: portalExpanded,
    activePage,
    currentPage,
    activeIndex,
    motionRequestId,
    onMotionEnd: motionFinished,
  });

  const openFocus = () => {
    setFocusMounted(true);
  };
  const openMountedFocus = () => setFocusOpen(true);
  const closeFocus = () => setFocusOpen(false);

  const openShareFromFocus = () => {
    pendingFocusActionRef.current = "share";
    pendingShareRef.current = { entry, page: activePage };
    setFocusOpen(false);
  };

  const openWidgetPickerFromFocus = () => {
    pendingFocusActionRef.current = "widgetPicker";
    pendingWidgetPickerRef.current = { entry, page: activePage };
    setFocusOpen(false);
  };

  const finishFocusClose = () => {
    setFocusMounted(false);
    const action = pendingFocusActionRef.current;
    pendingFocusActionRef.current = null;
    if (action === "share") {
      const pending = pendingShareRef.current;
      pendingShareRef.current = null;
      if (pending) {
        openShare(pending.entry, pending.page);
      }
      return;
    }
    if (action === "widgetPicker") {
      const pending = pendingWidgetPickerRef.current;
      pendingWidgetPickerRef.current = null;
      if (pending) {
        openWidgetPicker(pending.entry, pending.page);
      }
    }
  };

  const focusMenuItems: FocusMenuItem[] = [
    { label: "Edit", icon: "pencil", onPress: () => {} },
    ...(featuredWidgetsSupported
      ? [
          {
            label: "Feature in Widget",
            icon: "photo" as const,
            onPress: openWidgetPickerFromFocus,
          },
        ]
      : []),
    { label: "Share", icon: "share", onPress: openShareFromFocus },
    { label: "Delete", icon: "trash", onPress: () => {} },
  ];

  const cloneCurrentPage = useSharedValue(0);
  const cloneActiveIndex = useSharedValue(0);
  useLayoutEffect(() => {
    cloneCurrentPage.set(activePage);
    cloneActiveIndex.set(activePage);
  }, [activePage, cloneActiveIndex, cloneCurrentPage]);

  const closeVisible = portalExpanded;
  const closeValues = {
    opacity: closeVisible ? 1 : 0,
    translateY: closeVisible ? 0 : CLOSE_TRAVEL_Y,
  };
  const closeTransition = reduceMotionEnabled
    ? ({ type: "none" } as const)
    : {
        opacity: {
          ...EASE_DEFAULT_TIMING,
          duration: CLOSE_FADE_MS,
          delay: closeVisible ? CLOSE_FADE_DELAY_MS : 0,
        },
        transform: EASE_STACK_EXPANSION_SPRING,
      };

  return (
    <>
      {canonicalDeckVisible ? (
        <View
          className="relative"
          pointerEvents={ownsExpansion ? "none" : "auto"}
          accessibilityElementsHidden={ownsExpansion}
          importantForAccessibility={ownsExpansion ? "no-hide-descendants" : "auto"}
        >
          <LongPressable onPress={expand} onLongPress={openFocus}>
            <CollapsedDeck
              triggerRef={triggerRef}
              entry={entry}
              activePage={activePage}
              currentPage={currentPage}
              activeIndex={activeIndex}
              firstArtefactReadinessRequestId={firstArtefactReadinessRequestId}
              onFirstArtefactReady={onFirstArtefactReady}
            />
          </LongPressable>
          <Pressable
            onPress={openFocus}
            accessibilityRole="button"
            accessibilityLabel="Entry options"
            className="absolute -top-12 -right-2 z-[110] rounded-full p-2"
          >
            <Icon name="ellipsis-horizontal" size={20} color="#79716B" />
          </Pressable>
        </View>
      ) : null}

      {focusMounted ? (
        <FocusOverlay
          triggerRef={triggerRef}
          open={focusOpen}
          subject={
            <CollapsedDeck
              entry={entry}
              activePage={activePage}
              currentPage={cloneCurrentPage}
              activeIndex={cloneActiveIndex}
            />
          }
          menuItems={focusMenuItems}
          onNativeReady={openMountedFocus}
          onRequestClose={closeFocus}
          onCloseComplete={finishFocusClose}
          accessibilityDismissLabel="Dismiss entry options"
        />
      ) : null}

      {portalMounted ? (
        <StyledPortal hostName="overlay" className="items-center justify-center">
          <View
            className="absolute inset-0 items-center justify-center"
            style={{ opacity: expansion.phase === "preparing" ? 0 : 1 }}
            pointerEvents="auto"
            accessibilityElementsHidden={
              expansion.phase === "preparing" || expansion.phase === "collapsing"
            }
            importantForAccessibility={
              expansion.phase === "preparing" || expansion.phase === "collapsing"
                ? "no-hide-descendants"
                : "auto"
            }
            accessibilityViewIsModal={
              expansion.phase === "expanding" || expansion.phase === "expanded"
            }
          >
            <Pressable className="absolute inset-0" onPress={collapse} />
            <View
              className={`${entry.type === "paper" ? "aspect-a4" : "aspect-print"} relative max-h-[calc((100vw-80px)/210*297)] w-[calc(100vw-80px)]`}
              pointerEvents="box-none"
            >
              <Animated.ScrollView
                ref={scrollRef}
                horizontal
                snapToInterval={pageWidth}
                decelerationRate="fast"
                showsHorizontalScrollIndicator={false}
                scrollEventThrottle={16}
                scrollEnabled={expansion.phase === "expanded"}
                onScroll={onScroll}
                onLayout={restoreScroll}
              >
                <View
                  style={{
                    width: (entry.artefacts.length - 1) * pageWidth + expandedWidth,
                  }}
                />
              </Animated.ScrollView>
              {wrappedArtefacts}
            </View>

            <View
              style={{ zIndex: 200 }}
              className="absolute bottom-24 left-1/2 -translate-x-1/2"
              pointerEvents={expansion.phase === "expanded" ? "box-none" : "none"}
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
              <EaseView
                initialAnimate={{ opacity: 0, translateY: CLOSE_TRAVEL_Y }}
                animate={closeValues}
                transition={closeTransition}
                pointerEvents={closeVisible ? "auto" : "none"}
              >
                <Pressable
                  onPress={collapse}
                  accessibilityRole="button"
                  accessibilityLabel="Close entry"
                  className="rounded-full border border-controls-border bg-controls-background p-3"
                >
                  <Icon name="x-mark" size={22} color="#79716B" />
                </Pressable>
              </EaseView>
            </View>
          </View>
        </StyledPortal>
      ) : null}
    </>
  );
};

export default Stack;
