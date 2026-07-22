/**
 * Stack — one Entry's collapsed deck and retained fullscreen pager.
 *
 * React phases coordinate the portal lifecycle. Ease owns the discrete bloom
 * endpoints, while Reanimated remains responsible only for fractional pager
 * position and indicator interpolation.
 */
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import {
  Pressable,
  ScrollView,
  View,
  type GestureResponderEvent,
  useWindowDimensions,
} from "react-native";
import { EaseView } from "react-native-ease";
import Animated, {
  type AnimatedRef,
  measure,
  useAnimatedRef,
  useAnimatedScrollHandler,
  useDerivedValue,
  useSharedValue,
} from "react-native-reanimated";
import { Portal } from "react-native-teleport";
import { StyleSheet, withUnistyles } from "react-native-unistyles";
import { scheduleOnRN, scheduleOnUI } from "react-native-worklets";

import type { Entry } from "../data/entries";

import {
  EASE_DEFAULT_TIMING,
  EASE_STACK_CHROME_TIMING,
  EASE_STACK_EXPANSION_SPRING,
} from "../constants/animation";
import { LAYOUT } from "../constants/layout";
import { useReducedMotionPreference } from "../hooks/useReducedMotionPreference";
import { useShare } from "../share/ShareContext";
import { EaseMotionCompletionQueue } from "../utils/easeMotionCompletion";
import { useFeaturedWidgets } from "../widgets/FeaturedWidgetsContext";
import { getCollapsedArtefactLayout, getExpandedArtefactLayout } from "./artefactLayout";
import CollapsedDeck, { deckStyles, useWrappedArtefacts } from "./CollapsedDeck";
import { useExpandContext } from "./ExpandContext";
import FocusOverlay, { type FocusMenuItem } from "./FocusOverlay";
import { Icon } from "./Icon";
import LongPressable from "./LongPressable";
import { ArtefactPreview, ScrollIndicator } from "./ScrollIndicator";
import { StackCollapseReversalTapGesture } from "./stackCollapseReversal";
import { stackExpandedControlsVisible } from "./stackExpansion";
import { getCollapseReversalHitFrame, getCollapsedPortalOffset } from "./stackPortalGeometry";

const StyledEaseView = withUnistyles(EaseView);
const StyledPortal = withUnistyles(Portal);
const ThemedIcon = withUnistyles(Icon, (theme) => ({
  color: theme.colors.icon.default,
}));
const CLOSE_TRAVEL_Y = 40;
const CLOSE_FADE_MS = 220;
const CLOSE_FADE_DELAY_MS = 60;
const PORTAL_MEASUREMENT_RETRIES = 2;
const STACK_MOTION_WATCHDOG_MS = 1000;
const STACK_REDUCED_MOTION_WATCHDOG_MS = 50;

type PortalOffset = { x: number; y: number };

/**
 * Measure the canonical deck in page coordinates, then compare it with the
 * visual viewport centre used to lay out the teleported Ease frame. Teleport's
 * host inherits a SafeAreaView page offset, but that offset is not part of its
 * child's visual transform coordinate space.
 */
const measureCollapsedPortalOffset = ({
  triggerRef,
  viewport,
  onMeasured,
}: {
  triggerRef: AnimatedRef<Animated.View>;
  viewport: { width: number; height: number };
  onMeasured: (offset: PortalOffset | null) => void;
}) => {
  scheduleOnUI(() => {
    "worklet";
    const triggerLayout = measure(triggerRef);
    const offset = triggerLayout ? getCollapsedPortalOffset(triggerLayout, viewport) : null;

    scheduleOnRN(onMeasured, offset);
  });
};

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
    abort,
    releaseOwner,
  } = useExpandContext();
  const reduceMotionEnabled = useReducedMotionPreference();
  const { openShare } = useShare();
  const { supported: featuredWidgetsSupported, openPicker: openWidgetPicker } =
    useFeaturedWidgets();
  const { width: screenWidth, height: screenHeight } = useWindowDimensions();
  const screenViewport = { width: screenWidth, height: screenHeight };
  const artefactKind = entry.type === "paper" ? "paper" : "print";
  const collapsedArtefactLayout = getCollapsedArtefactLayout(screenWidth, artefactKind);
  const expandedArtefactLayout = getExpandedArtefactLayout(screenWidth, artefactKind);
  const expandedWidth = expandedArtefactLayout.width;
  const pageWidth = expandedWidth + LAYOUT.EXPANDED_STACK_GAP;

  const [focusMounted, setFocusMounted] = useState(false);
  const [focusOpen, setFocusOpen] = useState(false);
  const [activePageState, setActivePage] = useState(0);
  const [collapsedPortalOffset, setCollapsedPortalOffset] = useState<PortalOffset>({ x: 0, y: 0 });
  const [collapseMeasurementPending, setCollapseMeasurementPending] = useState(false);
  const collapseMeasurementPendingRef = useRef(false);
  const collapseMeasurementRequestRef = useRef(0);
  const collapseMeasurementFrameRef = useRef<number | null>(null);
  const handledWidgetArtefactIdRef = useRef<string | null>(null);
  const portalPreparationRequestRef = useRef<number | null>(null);
  const portalReadyFrameRef = useRef<number | null>(null);
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
  const expandedControlsVisible = ownsExpansion && stackExpandedControlsVisible(expansion);
  const expandedControlsInteractive =
    ownsExpansion && expansion.phase === "expanded" && !collapseMeasurementPending;
  const collapseReversalInteractive =
    ownsExpansion && (collapseMeasurementPending || expansion.phase === "collapsing");
  const canonicalDeckVisible = !ownsExpansion || expansion.phase === "preparing";
  const motionRequestId =
    ownsExpansion && (expansion.phase === "expanding" || expansion.phase === "collapsing")
      ? expansion.requestId
      : null;
  const portalFrameValues = {
    translateX: portalExpanded ? 0 : collapsedPortalOffset.x,
    translateY: portalExpanded ? 0 : collapsedPortalOffset.y,
  };
  const collapseReversalHitFrame = getCollapseReversalHitFrame({
    viewport: screenViewport,
    expanded: expandedArtefactLayout,
    collapsed: collapsedArtefactLayout,
    collapsedOffset: collapsedPortalOffset,
  });
  const portalFrameTarget = `${portalExpanded ? "expanded" : "collapsed"}:${portalFrameValues.translateX}:${portalFrameValues.translateY}`;
  const [portalFrameCompletionQueue] = useState(
    () => new EaseMotionCompletionQueue<number>(portalFrameTarget),
  );
  const [collapseReversalTapGesture] = useState(() => new StackCollapseReversalTapGesture());

  useLayoutEffect(() => {
    // Preparation can change the collapsed geometry with a no-motion Ease
    // update. Queue that null token as well so its native completion cannot be
    // mistaken for the following expansion request.
    portalFrameCompletionQueue.transition(portalFrameTarget, motionRequestId);
  }, [motionRequestId, portalFrameCompletionQueue, portalFrameTarget]);

  useEffect(() => {
    if (motionRequestId === null) {
      return;
    }

    // Ease's native callback has no request identity and can be dropped if an
    // in-flight native batch is invalidated by another prop commit. The model
    // layer still owns the requested endpoint, so settle after a conservative
    // spring window and discard callbacks that belonged to the abandoned batch.
    const watchdog = setTimeout(
      () => {
        portalFrameCompletionQueue.reset(portalFrameTarget);
        motionFinished(motionRequestId);
      },
      reduceMotionEnabled ? STACK_REDUCED_MOTION_WATCHDOG_MS : STACK_MOTION_WATCHDOG_MS,
    );

    return () => clearTimeout(watchdog);
  }, [
    motionFinished,
    motionRequestId,
    portalFrameCompletionQueue,
    portalFrameTarget,
    reduceMotionEnabled,
  ]);

  useLayoutEffect(() => {
    if (previousEntryRef.current === entry) {
      return;
    }
    previousEntryRef.current = entry;
    setActivePage(0);
    scrollOffset.set(0);
  }, [entry, scrollOffset]);

  useEffect(
    () => () => {
      if (portalReadyFrameRef.current !== null) {
        cancelAnimationFrame(portalReadyFrameRef.current);
      }
      if (collapseMeasurementFrameRef.current !== null) {
        cancelAnimationFrame(collapseMeasurementFrameRef.current);
      }
      portalPreparationRequestRef.current = null;
      collapseMeasurementPendingRef.current = false;
      collapseMeasurementRequestRef.current += 1;
      releaseOwner(entry.id);
    },
    [entry.id, releaseOwner],
  );

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

  const finishCollapseMeasurement = () => {
    collapseMeasurementPendingRef.current = false;
    setCollapseMeasurementPending(false);
  };

  const reverseCollapse = () => {
    if (collapseMeasurementPendingRef.current) {
      collapseMeasurementRequestRef.current += 1;
      if (collapseMeasurementFrameRef.current !== null) {
        cancelAnimationFrame(collapseMeasurementFrameRef.current);
        collapseMeasurementFrameRef.current = null;
      }
      finishCollapseMeasurement();
      return;
    }

    expand();
  };

  const beginCollapseReversalTap = (event: GestureResponderEvent) => {
    const touch = event.nativeEvent.touches[0] ?? event.nativeEvent;
    collapseReversalTapGesture.begin({ pageX: touch.pageX, pageY: touch.pageY });
  };

  const trackCollapseReversalTap = (event: GestureResponderEvent) => {
    const touch = event.nativeEvent.touches[0] ?? event.nativeEvent;
    collapseReversalTapGesture.move({ pageX: touch.pageX, pageY: touch.pageY });
  };

  const finishCollapseReversalTap = () => {
    if (collapseReversalTapGesture.consumeTap()) {
      reverseCollapse();
    }
  };

  const measureCollapsePortal = (measurementRequestId: number, retriesRemaining: number): void => {
    measureCollapsedPortalOffset({
      triggerRef,
      viewport: screenViewport,
      onMeasured: (offset) => {
        if (
          !collapseMeasurementPendingRef.current ||
          measurementRequestId !== collapseMeasurementRequestRef.current
        ) {
          return;
        }
        if (offset === null && retriesRemaining > 0) {
          collapseMeasurementFrameRef.current = requestAnimationFrame(() => {
            collapseMeasurementFrameRef.current = null;
            measureCollapsePortal(measurementRequestId, retriesRemaining - 1);
          });
          return;
        }
        if (offset === null) {
          finishCollapseMeasurement();
          return;
        }

        setCollapsedPortalOffset(offset);
        finishCollapseMeasurement();
        requestCollapse(entry.id);
      },
    });
  };

  const collapse = () => {
    if (
      collapseMeasurementPendingRef.current ||
      !ownsExpansion ||
      (expansion.phase !== "expanding" && expansion.phase !== "expanded")
    ) {
      return;
    }
    collapseMeasurementRequestRef.current += 1;
    const measurementRequestId = collapseMeasurementRequestRef.current;
    collapseMeasurementPendingRef.current = true;
    setCollapseMeasurementPending(true);
    persistPage();
    measureCollapsePortal(measurementRequestId, PORTAL_MEASUREMENT_RETRIES);
  };

  const preparePortal = (requestId: number, retriesRemaining: number): void => {
    measureCollapsedPortalOffset({
      triggerRef,
      viewport: screenViewport,
      onMeasured: (offset) => {
        if (portalPreparationRequestRef.current !== requestId) {
          return;
        }
        if (offset === null) {
          if (retriesRemaining > 0) {
            portalReadyFrameRef.current = requestAnimationFrame(() => {
              portalReadyFrameRef.current = null;
              preparePortal(requestId, retriesRemaining - 1);
            });
            return;
          }
          portalPreparationRequestRef.current = null;
          abort(entry.id, requestId);
          return;
        }

        setCollapsedPortalOffset(offset);

        // Preparing applies the measured endpoint without animation. Give that
        // native commit one frame before revealing and targeting expansion.
        portalReadyFrameRef.current = requestAnimationFrame(() => {
          portalReadyFrameRef.current = null;
          portalPreparationRequestRef.current = null;
          portalReady(entry.id, requestId);
          if (widgetArtefactId && handledWidgetArtefactIdRef.current === widgetArtefactId) {
            onWidgetTargetConsumed?.();
          }
        });
      },
    });
  };

  const restoreScroll = () => {
    scrollRef.current?.scrollTo({ x: activePage * pageWidth, y: 0, animated: false });
    scrollOffset.set(activePage * pageWidth);
    if (
      !ownsExpansion ||
      expansion.phase !== "preparing" ||
      expansion.requestId === null ||
      portalPreparationRequestRef.current === expansion.requestId
    ) {
      return;
    }

    const requestId = expansion.requestId;
    portalPreparationRequestRef.current = requestId;
    preparePortal(requestId, PORTAL_MEASUREMENT_RETRIES);
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
  });

  const handlePortalFrameMotionEnd = (finished: boolean) => {
    // The portal cannot hand back to Home until its outermost position reaches
    // the canonical deck. Inner card springs may report completion first.
    const requestId = portalFrameCompletionQueue.finish(finished);
    // An interrupted batch does not prove that the portal reached its handoff
    // endpoint. The request-scoped watchdog will settle it safely if no
    // replacement completion follows.
    if (finished && requestId !== null) {
      motionFinished(requestId);
    }
  };

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
  const portalFrameTransition =
    reduceMotionEnabled || expansion.phase === "preparing"
      ? ({ type: "none" } as const)
      : EASE_STACK_EXPANSION_SPRING;
  const expandedControlsTransition = reduceMotionEnabled
    ? ({ type: "none" } as const)
    : EASE_STACK_CHROME_TIMING;
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
      <View
        style={[styles.canonicalDeck, { opacity: canonicalDeckVisible ? 1 : 0 }]}
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
          style={styles.optionsButton}
        >
          <ThemedIcon name="ellipsis-horizontal" size={20} />
        </Pressable>
      </View>

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
        <StyledPortal hostName="overlay" style={styles.portal}>
          <Animated.View
            collapsable={false}
            style={[styles.portalLayer, { opacity: expansion.phase === "preparing" ? 0 : 1 }]}
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
            <Pressable style={styles.absoluteFill} onPress={collapse} />
            <StyledEaseView
              style={deckStyles.deck(entry.type, screenWidth)}
              initialAnimate={portalFrameValues}
              animate={portalFrameValues}
              transition={portalFrameTransition}
              onTransitionEnd={(event) => handlePortalFrameMotionEnd(event.finished)}
              pointerEvents="box-none"
            >
              <Animated.ScrollView
                ref={scrollRef}
                horizontal
                snapToInterval={pageWidth}
                decelerationRate="fast"
                showsHorizontalScrollIndicator={false}
                scrollEventThrottle={16}
                scrollEnabled={expandedControlsInteractive}
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
            </StyledEaseView>

            {/* Ease animates only presentation layers on iOS, so a transformed
                responder would jump to the collapsed hit frame immediately. */}
            <View
              style={{
                position: "absolute",
                ...collapseReversalHitFrame,
                zIndex: 150,
              }}
              pointerEvents={collapseReversalInteractive ? "box-none" : "none"}
              accessibilityElementsHidden
              importantForAccessibility="no-hide-descendants"
            >
              <Pressable
                style={styles.absoluteFill}
                onPressIn={beginCollapseReversalTap}
                onPressMove={trackCollapseReversalTap}
                onPress={finishCollapseReversalTap}
              />
            </View>

            <View
              style={[styles.indicatorControls, { zIndex: 200 }]}
              pointerEvents={expandedControlsInteractive ? "box-none" : "none"}
              accessibilityElementsHidden={!expandedControlsInteractive}
              importantForAccessibility={
                expandedControlsInteractive ? "auto" : "no-hide-descendants"
              }
            >
              <StyledEaseView
                initialAnimate={{ opacity: 0 }}
                animate={{ opacity: expandedControlsVisible ? 1 : 0 }}
                transition={expandedControlsTransition}
              >
                <ScrollIndicator
                  orientation="horizontal"
                  count={entry.artefacts.length}
                  currentPage={currentPage}
                  maxVisible={5}
                  onJumpToIndex={jumpToArtefact}
                  renderPreview={(index) => <ArtefactPreview entry={entry} index={index} />}
                />
              </StyledEaseView>
            </View>

            <View
              style={[styles.closeControls, { zIndex: 210 }]}
              pointerEvents="box-none"
              accessibilityElementsHidden={!expandedControlsInteractive}
              importantForAccessibility={
                expandedControlsInteractive ? "auto" : "no-hide-descendants"
              }
            >
              <StyledEaseView
                initialAnimate={{ opacity: 0, translateY: CLOSE_TRAVEL_Y }}
                animate={closeValues}
                transition={closeTransition}
                pointerEvents={expandedControlsInteractive ? "auto" : "none"}
              >
                <Pressable
                  onPress={collapse}
                  accessibilityRole="button"
                  accessibilityLabel="Close entry"
                  style={styles.closeButton}
                >
                  <ThemedIcon name="x-mark" size={22} />
                </Pressable>
              </StyledEaseView>
            </View>
          </Animated.View>
        </StyledPortal>
      ) : null}
    </>
  );
};

export default Stack;

const styles = StyleSheet.create((theme) => ({
  absoluteFill: StyleSheet.absoluteFill,
  canonicalDeck: {
    position: "relative",
  },
  closeButton: {
    backgroundColor: theme.colors.surface.control,
    borderColor: theme.colors.border.control,
    borderRadius: 999,
    borderWidth: 1,
    padding: 12,
  },
  closeControls: {
    bottom: 40,
    left: "50%",
    position: "absolute",
    transform: [{ translateX: "-50%" }],
  },
  indicatorControls: {
    bottom: 96,
    left: "50%",
    position: "absolute",
    transform: [{ translateX: "-50%" }],
  },
  optionsButton: {
    borderRadius: 999,
    padding: 8,
    position: "absolute",
    right: -8,
    top: -48,
    zIndex: 110,
  },
  portal: {
    alignItems: "center",
    justifyContent: "center",
  },
  portalLayer: {
    ...StyleSheet.absoluteFill,
    alignItems: "center",
    justifyContent: "center",
  },
}));
