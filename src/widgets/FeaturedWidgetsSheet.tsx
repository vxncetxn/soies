/**
 * FeaturedWidgetsSheet — one fixed-height native sheet with two cross-faded phases.
 *
 * Picker renders raw entry artefacts and commits one selected identity. Featured
 * renders five stable slot pages from cached raster frames. Both phase trees
 * stay inside the same fixed body and animate opacity over 200 ms, so selection
 * never dismisses, reopens, or asks the native sheet to resize.
 *
 * Replace, Delete, Add Artefact, and Help are intentionally enabled silent
 * no-ops in this milestone. The visible management set still follows the
 * centered slot: bound slots show Replace/Delete and empty slots show Add
 * Artefact, without implying that those mutations have shipped.
 *
 * Map:
 * - `PickerPhase` snaps raw live Artefacts and owns retry/duplicate/full copy;
 * - `FeaturedPhase` pages five cached frames or branded framed placeholders;
 * - `FeaturedWidgetsSheet` owns the fixed detent and two retained Ease fades;
 * - native scroll identity is retained across rotation and new center commands.
 */
import { ModalBottomSheet, programmatic } from "@swmansion/react-native-bottom-sheet";
import { Image as ExpoImage } from "expo-image";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  Pressable,
  ScrollView,
  Text,
  useWindowDimensions,
  View,
} from "react-native";
import { EaseView, type Transition } from "react-native-ease";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { StyleSheet, useUnistyles, withUnistyles } from "react-native-unistyles";

import type { Artefact, Entry } from "../data/entries";
import type {
  FeaturedWidgetSlot,
  FeaturedWidgetSlotIndex,
} from "../db/repositories/featuredWidgetSlots";

import ArtefactFrame from "../components/ArtefactFrame";
import { FRAME_BOARD_SCALE } from "../components/artefactFrameGeometry";
import { getArtefactCanvasLayout } from "../components/artefactLayout";
import { Icon } from "../components/Icon";
import { renderArtefactContent } from "../components/renderArtefactContent";
import { EASE_DEFAULT_TIMING } from "../constants/animation";
import { isPrintArtefact } from "../data/entries";
import { createPaperDocument } from "../data/paperDocument";
import { getFeaturedWidgetPickerState } from "../db/repositories/featuredWidgetSlots";
import { useReducedMotionPreference } from "../hooks/useReducedMotionPreference";
import { fixedTokens } from "../styles/tokens";
import { cachedWidgetFrameUri } from "./widgetFrameCache";
import { type WidgetFrameGeometry, widgetFrameGeometryFittingBoard } from "./widgetFrameGeometry";
import {
  FEATURED_WIDGET_PHASE_FADE_MS,
  featuredCarouselTarget,
  featuredWidgetControlsForSelection,
  featuredWidgetSheetGeometry,
  getPickerActionState,
  performFeaturedWidgetStubControl,
} from "./widgetSheetState";

type FeaturedWidgetsSheetProps = {
  /** Controller-owned identity and phase command for one native presentation. */
  session: {
    id: number;
    phase: "picker" | "featured";
    entry: Entry | null;
    initialPage: number;
    centeredSlot: FeaturedWidgetSlotIndex;
  };
  slots: FeaturedWidgetSlot[];
  /** Non-blocking state shown only after durable intent is already committed. */
  publicationWarning: boolean;
  onFeatureArtefact: (artefactId: string) => Promise<FeaturedWidgetSlotIndex>;
  onRefreshSlots: () => Promise<FeaturedWidgetSlot[]>;
  onClosed: () => void;
};

/** Shared physical gap makes snap offsets equal measured page width plus spacing. */
const CAROUSEL_GAP = 20;
/** Fixed label box keeps every slot title on one baseline across frame states. */
const FEATURED_SLOT_LABEL_HEIGHT = fixedTokens.widget.typography.slotLabelHeight;
/** Separates the fixed label box from the shared padded frame canvas. */
const FEATURED_SLOT_LABEL_GAP = 8;
/** Retains the reference board scale while its soft shadow may cross the page gutter. */
const FEATURED_FRAME_BOARD_WIDTH_FRACTION = 0.75;
/** Stable fallback avoids allocating a new empty array during picker fade-out. */
const EMPTY_ARTEFACTS: Artefact[] = [];

const StyledArtefactFrame = withUnistyles(ArtefactFrame);
const StyledEaseView = withUnistyles(EaseView);
const StyledExpoImage = withUnistyles(ExpoImage);
const OnActionActivityIndicator = withUnistyles(ActivityIndicator, (theme) => ({
  color: theme.colors.content.onAction,
}));
const ThemedIcon = withUnistyles(Icon, (theme) => ({
  color: theme.colors.icon.default,
}));
const ThemedMutedIcon = withUnistyles(Icon, (theme) => ({
  color: theme.colors.icon.muted,
}));

/** Scale raw Home content as one unit; no frame chrome belongs in picker phase. */
function RawArtefactPreview({
  artefact,
  viewportWidth,
  maxWidth,
  maxHeight,
}: {
  artefact: Artefact;
  viewportWidth: number;
  maxWidth: number;
  maxHeight: number;
}) {
  const kind = isPrintArtefact(artefact) ? "print" : "paper";
  const natural = getArtefactCanvasLayout(viewportWidth, kind);
  const scale = Math.min(maxWidth / natural.width, maxHeight / natural.height);
  const width = natural.width * scale;
  const height = natural.height * scale;

  return (
    <View style={{ width, height, overflow: "visible" }}>
      <View
        style={{
          width: natural.width,
          height: natural.height,
          transform: [{ scale }],
          transformOrigin: "top left",
        }}
      >
        {renderArtefactContent(artefact)}
      </View>
    </View>
  );
}

/** Live entry picker that commits only the currently snapped Artefact identity. */
function PickerPhase({
  entry,
  initialPage,
  viewportWidth,
  availableHeight,
  active,
  onFeatureArtefact,
  onBusyChange,
}: {
  entry: Entry | null;
  initialPage: number;
  viewportWidth: number;
  availableHeight: number;
  active: boolean;
  onFeatureArtefact: FeaturedWidgetsSheetProps["onFeatureArtefact"];
  onBusyChange: (busy: boolean) => void;
}) {
  const artefacts = entry ? (entry.artefacts as Artefact[]) : EMPTY_ARTEFACTS;
  const clampedInitial = Math.max(0, Math.min(artefacts.length - 1, initialPage));
  const initialId = artefacts[clampedInitial]?.id ?? null;
  /** React state paints the dot/copy; the ref is authoritative during rotation. */
  const [selectedId, setSelectedId] = useState<string | null>(initialId);
  const selectedIdRef = useRef<string | null>(initialId);
  /** Candidate subset returned by one picker-state database query. */
  const [featuredIds, setFeaturedIds] = useState<Set<string>>(new Set());
  const [isFull, setIsFull] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [attempt, setAttempt] = useState(0);
  /** Locks sheet dismissal while capture/assignment/publication is in flight. */
  const [busy, setBusy] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const scrollRef = useRef<ScrollView>(null);
  const pageWidth = viewportWidth * 0.72;
  const snap = pageWidth + CAROUSEL_GAP;
  const sidePad = Math.max(0, (viewportWidth - pageWidth) / 2);
  const previewHeight = Math.max(72, Math.min(availableHeight - 170, 360));
  const snapOffsets = artefacts.map((_, index) => index * snap);

  useLayoutEffect(() => {
    if (!active || artefacts.length === 0) {
      return;
    }
    const index = Math.max(
      0,
      artefacts.findIndex((artefact) => artefact.id === selectedIdRef.current),
    );
    scrollRef.current?.scrollTo({ x: index * snap, y: 0, animated: false });
  }, [active, artefacts, snap]);

  useEffect(() => {
    if (!active || artefacts.length === 0) {
      return;
    }
    let cancelled = false;
    void getFeaturedWidgetPickerState(artefacts.map((artefact) => artefact.id))
      .then((state) => {
        if (!cancelled) {
          setFeaturedIds(state.featuredIds);
          setIsFull(state.isFull);
          setLoadError(false);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setLoadError(true);
        }
      })
      .finally(() => {
        if (!cancelled) {
          setLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [active, artefacts, attempt]);

  /** Normalize drag and momentum endpoints to the nearest bounded page. */
  const selectAtOffset = (event: NativeSyntheticEvent<NativeScrollEvent>, targetX?: number) => {
    if (artefacts.length === 0 || snap <= 0) {
      return;
    }
    const x = targetX ?? event.nativeEvent.contentOffset.x;
    const index = Math.max(0, Math.min(artefacts.length - 1, Math.round(x / snap)));
    const nextId = artefacts[index]?.id ?? null;
    selectedIdRef.current = nextId;
    setSelectedId(nextId);
    setErrorMessage(null);
  };

  const selected = artefacts.find((artefact) => artefact.id === selectedId);
  const alreadyFeatured = selected ? featuredIds.has(selected.id) : false;
  const selectDisabled = getPickerActionState({
    busy,
    loading,
    loadError,
    isFull,
    alreadyFeatured,
    hasSelection: Boolean(selected),
  }).disabled;

  /** Keep retryable failures in picker; the controller owns successful phase change. */
  const confirm = () => {
    if (selectDisabled || !selected) {
      return;
    }
    setBusy(true);
    onBusyChange(true);
    setErrorMessage(null);
    void onFeatureArtefact(selected.id)
      .catch((error: unknown) => {
        if (error instanceof Error && error.name === "FeaturedWidgetsFullError") {
          setIsFull(true);
          setErrorMessage("All five widget slots are occupied.");
        } else {
          setErrorMessage(
            error instanceof Error && error.message === "This artefact is no longer available"
              ? error.message
              : "Couldn't feature this artefact. Try again.",
          );
        }
      })
      .finally(() => {
        setBusy(false);
        onBusyChange(false);
      });
  };

  if (!entry || artefacts.length === 0) {
    return null;
  }

  return (
    <View style={styles.phaseContent}>
      <Text style={styles.phaseTitle}>Choose an artefact</Text>
      <ScrollView
        ref={scrollRef}
        horizontal
        showsHorizontalScrollIndicator={false}
        decelerationRate="fast"
        snapToOffsets={snapOffsets}
        disableIntervalMomentum
        contentContainerStyle={{
          paddingHorizontal: sidePad,
          alignItems: "center",
          paddingVertical: 16,
        }}
        onMomentumScrollEnd={selectAtOffset}
        onScrollEndDrag={(event) => selectAtOffset(event, event.nativeEvent.targetContentOffset?.x)}
      >
        {artefacts.map((artefact, index) => (
          <View
            key={artefact.id}
            style={{
              width: pageWidth,
              height: previewHeight,
              marginRight: index < artefacts.length - 1 ? CAROUSEL_GAP : 0,
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <RawArtefactPreview
              artefact={artefact}
              viewportWidth={viewportWidth}
              maxWidth={pageWidth * 0.88}
              maxHeight={previewHeight * 0.92}
            />
          </View>
        ))}
      </ScrollView>

      <View style={styles.dots}>
        {artefacts.map((artefact) => (
          <View
            key={artefact.id}
            style={[styles.dot, artefact.id === selectedId ? styles.dotActive : styles.dotIdle]}
          />
        ))}
      </View>

      <View style={styles.pickerStatus}>
        {errorMessage ? (
          <Text style={styles.errorText}>{errorMessage}</Text>
        ) : loading ? (
          <Text style={styles.statusText}>Checking widget slots…</Text>
        ) : loadError ? (
          <View style={styles.retryRow}>
            <Text style={styles.errorText}>Couldn&apos;t check widget slots.</Text>
            <Pressable
              onPress={() => {
                setLoading(true);
                setLoadError(false);
                setAttempt((value) => value + 1);
              }}
              accessibilityRole="button"
              accessibilityLabel="Retry checking widget slots"
            >
              <Text style={styles.retryText}>Try again</Text>
            </Pressable>
          </View>
        ) : alreadyFeatured ? (
          <Text style={styles.statusText}>Already featured</Text>
        ) : isFull ? (
          <Text style={styles.statusText}>All five widget slots are occupied</Text>
        ) : null}
      </View>

      <Pressable
        disabled={selectDisabled}
        onPress={confirm}
        accessibilityRole="button"
        accessibilityLabel="Select Artefact"
        accessibilityState={{ disabled: selectDisabled, busy }}
        style={[
          styles.primaryButton,
          selectDisabled ? styles.primaryButtonDisabled : styles.primaryButtonEnabled,
          { opacity: selectDisabled ? 0.58 : 1 },
        ]}
      >
        {busy ? (
          <OnActionActivityIndicator />
        ) : (
          <Text
            style={[styles.primaryButtonLabel, selectDisabled && styles.primaryButtonLabelDisabled]}
          >
            Select Artefact
          </Text>
        )}
      </Pressable>
    </View>
  );
}

/** Use the same frame geometry for empty, unavailable, and missing-cache states. */
function FramedPlaceholder({
  slot,
  geometry,
  viewportWidth,
}: {
  slot: FeaturedWidgetSlot;
  /** Same canvas/board measurements used by an occupied cached PNG. */
  geometry: WidgetFrameGeometry;
  viewportWidth: number;
}) {
  const prompt =
    slot.state === "unavailable"
      ? "Artefact in Recently Deleted"
      : slot.state === "featured"
        ? "Open Soies to refresh"
        : "Feature an artefact in Soies";
  const placeholderArtefact = {
    id: `slot-${slot.slotIndex}-placeholder`,
    ...createPaperDocument(),
  };

  return (
    <StyledArtefactFrame
      artefact={placeholderArtefact}
      wellWidth={geometry.boardWidth / FRAME_BOARD_SCALE}
      viewportWidth={viewportWidth}
      style={[styles.liveFrame, { left: geometry.boardLeft, top: geometry.boardTop }]}
    >
      <View style={styles.placeholder}>
        <ThemedMutedIcon name="photo" size={40} />
        <Text style={styles.placeholderText}>{prompt}</Text>
      </View>
    </StyledArtefactFrame>
  );
}

/** Five-page management carousel backed exclusively by cached raster frames. */
function FeaturedPhase({
  slots,
  centeredSlot,
  viewportWidth,
  availableHeight,
  active,
  publicationWarning,
  onRefreshSlots,
}: {
  slots: FeaturedWidgetSlot[];
  centeredSlot: FeaturedWidgetSlotIndex;
  viewportWidth: number;
  availableHeight: number;
  active: boolean;
  publicationWarning: boolean;
  onRefreshSlots: FeaturedWidgetsSheetProps["onRefreshSlots"];
}) {
  const scrollRef = useRef<ScrollView>(null);
  /** Paints the active dot; the ref is the immediate no-op action target. */
  const [selectedSlot, setSelectedSlot] = useState<FeaturedWidgetSlotIndex>(centeredSlot);
  const selectedSlotRef = useRef<FeaturedWidgetSlotIndex>(centeredSlot);
  const previousCenteredSlotRef = useRef<FeaturedWidgetSlotIndex>(centeredSlot);
  /** Broken image URIs degrade to a framed refresh prompt for this sheet session. */
  const [failedImages, setFailedImages] = useState<Set<string>>(new Set());
  const pageWidth = viewportWidth * 0.62;
  const snap = pageWidth + CAROUSEL_GAP;
  const sidePad = Math.max(0, (viewportWidth - pageWidth) / 2);
  const previewHeight = Math.max(56, Math.min(availableHeight - 240, 380));
  const snapOffsets = slots.map((_, index) => index * snap);
  const frameGeometry = widgetFrameGeometryFittingBoard(
    pageWidth * FEATURED_FRAME_BOARD_WIDTH_FRACTION,
    Math.max(0, previewHeight - FEATURED_SLOT_LABEL_HEIGHT - FEATURED_SLOT_LABEL_GAP),
  );

  useLayoutEffect(() => {
    if (!active) {
      return;
    }

    // A changed command (for example picker -> newly assigned slot) wins over
    // local paging. A geometry-only rerun keeps the user's current page, so a
    // rotation cannot make the visible frame, dot, and stub action disagree.
    const target = featuredCarouselTarget({
      previousCenteredSlot: previousCenteredSlotRef.current,
      centeredSlot,
      selectedSlot: selectedSlotRef.current,
    });
    previousCenteredSlotRef.current = centeredSlot;
    selectedSlotRef.current = target;
    setSelectedSlot(target);
    scrollRef.current?.scrollTo({ x: (target - 1) * snap, y: 0, animated: false });
  }, [active, centeredSlot, snap]);

  useEffect(() => {
    if (active) {
      void onRefreshSlots().catch(() => {});
    }
  }, [active, onRefreshSlots]);

  /** Commit native scroll settlement to dot and reference-control identity. */
  const selectAtOffset = (event: NativeSyntheticEvent<NativeScrollEvent>, targetX?: number) => {
    const x = targetX ?? event.nativeEvent.contentOffset.x;
    const index = Math.max(0, Math.min(slots.length - 1, Math.round(x / snap)));
    const slotIndex = (index + 1) as FeaturedWidgetSlotIndex;
    selectedSlotRef.current = slotIndex;
    setSelectedSlot(slotIndex);
  };

  /** Enabled milestone stubs deliberately preserve the selected slot exactly. */
  const noOp = () => {
    performFeaturedWidgetStubControl(selectedSlotRef.current);
  };

  const controls = featuredWidgetControlsForSelection(slots, selectedSlot);

  return (
    <View style={styles.phaseContent}>
      <Text style={styles.phaseTitle}>Featured Artefacts</Text>
      <ScrollView
        ref={scrollRef}
        horizontal
        showsHorizontalScrollIndicator={false}
        decelerationRate="fast"
        snapToOffsets={snapOffsets}
        disableIntervalMomentum
        contentContainerStyle={{
          paddingHorizontal: sidePad,
          alignItems: "center",
          paddingTop: 12,
          paddingBottom: 16,
        }}
        onMomentumScrollEnd={selectAtOffset}
        onScrollEndDrag={(event) => selectAtOffset(event, event.nativeEvent.targetContentOffset?.x)}
      >
        {slots.map((slot, index) => {
          const frameUri = slot.state === "featured" ? cachedWidgetFrameUri(slot) : undefined;
          const showImage = frameUri && !failedImages.has(frameUri);
          return (
            <View
              key={slot.slotIndex}
              style={{
                width: pageWidth,
                height: previewHeight,
                marginRight: index < slots.length - 1 ? CAROUSEL_GAP : 0,
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Text style={styles.slotLabel}>SLOT {slot.slotIndex}</Text>
              <View
                style={[
                  styles.frameCanvas,
                  {
                    width: frameGeometry.canvasWidth,
                    height: frameGeometry.canvasHeight,
                    marginTop: FEATURED_SLOT_LABEL_GAP,
                  },
                ]}
              >
                {showImage ? (
                  <StyledExpoImage
                    source={{ uri: frameUri }}
                    contentFit="contain"
                    style={StyleSheet.absoluteFill}
                    accessibilityLabel={
                      slot.state === "featured"
                        ? `Featured artefact from ${slot.entryTitle}`
                        : undefined
                    }
                    onError={() => {
                      setFailedImages((current) => new Set(current).add(frameUri));
                    }}
                  />
                ) : (
                  <FramedPlaceholder
                    slot={slot}
                    geometry={frameGeometry}
                    viewportWidth={viewportWidth}
                  />
                )}
              </View>
            </View>
          );
        })}
      </ScrollView>

      <View style={styles.dots}>
        {slots.map((slot) => (
          <View
            key={slot.slotIndex}
            style={[
              styles.dot,
              slot.slotIndex === selectedSlot ? styles.dotActive : styles.dotIdle,
            ]}
          />
        ))}
      </View>

      {publicationWarning ? (
        <Text style={styles.publicationWarning}>
          Widget refresh is pending. Soies will retry automatically.
        </Text>
      ) : (
        <View style={styles.warningSpacer} />
      )}

      <View style={styles.actions}>
        {controls.map((action) => (
          <Pressable
            key={action.label}
            onPress={noOp}
            accessibilityRole="button"
            accessibilityLabel={action.label}
            style={styles.action}
          >
            <View style={styles.actionIcon}>
              <ThemedIcon name={action.icon} size={22} />
            </View>
            <Text style={styles.actionLabel}>{action.label}</Text>
          </Pressable>
        ))}
      </View>

      <Pressable
        onPress={noOp}
        accessibilityRole="button"
        accessibilityLabel="How to add a widget"
        style={[styles.primaryButton, styles.primaryButtonEnabled]}
      >
        <Text style={styles.primaryButtonLabel}>How to add a widget</Text>
      </Pressable>
    </View>
  );
}

/** Own the sole native sheet instance and cross-fade both absolute phase trees. */
export function FeaturedWidgetsSheet({
  session,
  slots,
  publicationWarning,
  onFeatureArtefact,
  onRefreshSlots,
  onClosed,
}: FeaturedWidgetsSheetProps) {
  const { theme } = useUnistyles();
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const reduceMotionEnabled = useReducedMotionPreference();
  // The detent stays constant across phases, but must still fit the current
  // orientation. Carousel previews absorb the height change so controls remain
  // reachable on a short landscape viewport.
  const { sheetHeight, bodyHeight } = featuredWidgetSheetGeometry(
    height,
    insets.top,
    insets.bottom,
  );
  const [sheetIndex, setSheetIndex] = useState(1);
  /** Disables drag/close while the picker transaction cannot safely be abandoned. */
  const [busy, setBusy] = useState(false);
  /** Distinguishes a real close settlement from transient index callbacks. */
  const closingRef = useRef(false);
  const phaseTransition: Transition = reduceMotionEnabled
    ? { type: "none" }
    : { ...EASE_DEFAULT_TIMING, duration: FEATURED_WIDGET_PHASE_FADE_MS };

  /** Begin native dismissal; session cleanup waits for the zero detent to settle. */
  const requestClose = () => {
    if (busy) {
      return;
    }
    closingRef.current = true;
    setSheetIndex(0);
  };

  return (
    <ModalBottomSheet
      index={sheetIndex}
      detents={busy ? [programmatic(0), sheetHeight] : [0, sheetHeight]}
      onIndexChange={(index) => {
        if (index === 0) {
          requestClose();
        } else {
          setSheetIndex(index);
        }
      }}
      onSettle={(index) => {
        if (index === 0 && closingRef.current) {
          onClosed();
        }
      }}
      animateIn
      extendUnderStatusBar
      scrimColor={theme.colors.overlay.scrim}
      surface={<View style={[StyleSheet.absoluteFill, styles.surface]} />}
    >
      <View style={styles.sheetBody(sheetHeight, Math.max(insets.bottom, 12))}>
        <View style={styles.handle} />
        <Pressable
          onPress={requestClose}
          disabled={busy}
          accessibilityRole="button"
          accessibilityLabel="Close Featured Artefacts"
          accessibilityState={{ disabled: busy }}
          style={[styles.closeButton, { opacity: busy ? 0.5 : 1 }]}
        >
          <ThemedIcon name="x-mark" size={20} />
        </Pressable>

        <View style={styles.phaseViewport(bodyHeight)}>
          <StyledEaseView
            pointerEvents={session.phase === "picker" ? "auto" : "none"}
            accessibilityElementsHidden={session.phase !== "picker"}
            importantForAccessibility={session.phase === "picker" ? "auto" : "no-hide-descendants"}
            style={StyleSheet.absoluteFill}
            initialAnimate={{ opacity: session.phase === "picker" ? 1 : 0 }}
            animate={{ opacity: session.phase === "picker" ? 1 : 0 }}
            transition={phaseTransition}
          >
            <PickerPhase
              entry={session.entry}
              initialPage={session.initialPage}
              viewportWidth={width}
              availableHeight={bodyHeight}
              active={session.phase === "picker"}
              onFeatureArtefact={onFeatureArtefact}
              onBusyChange={setBusy}
            />
          </StyledEaseView>
          <StyledEaseView
            pointerEvents={session.phase === "featured" ? "auto" : "none"}
            accessibilityElementsHidden={session.phase !== "featured"}
            importantForAccessibility={
              session.phase === "featured" ? "auto" : "no-hide-descendants"
            }
            style={StyleSheet.absoluteFill}
            initialAnimate={{ opacity: session.phase === "featured" ? 1 : 0 }}
            animate={{ opacity: session.phase === "featured" ? 1 : 0 }}
            transition={phaseTransition}
          >
            <FeaturedPhase
              slots={slots}
              centeredSlot={session.centeredSlot}
              viewportWidth={width}
              availableHeight={bodyHeight}
              active={session.phase === "featured"}
              publicationWarning={publicationWarning}
              onRefreshSlots={onRefreshSlots}
            />
          </StyledEaseView>
        </View>
      </View>
    </ModalBottomSheet>
  );
}

const styles = StyleSheet.create((theme) => ({
  action: {
    alignItems: "center",
    width: 64,
  },
  actionIcon: {
    alignItems: "center",
    backgroundColor: theme.colors.surface.elevated,
    borderRadius: 999,
    boxShadow: fixedTokens.effects.previewShadow,
    height: 48,
    justifyContent: "center",
    width: 48,
  },
  actionLabel: {
    ...theme.typography.ui.caption,
    color: theme.colors.content.secondary,
    marginTop: 6,
    textAlign: "center",
  },
  actions: {
    alignItems: "flex-start",
    flexDirection: "row",
    gap: 24,
    justifyContent: "center",
    marginTop: 4,
  },
  closeButton: {
    alignItems: "center",
    backgroundColor: theme.colors.surface.elevated,
    borderRadius: 999,
    boxShadow: fixedTokens.effects.closeButtonShadow,
    height: 40,
    justifyContent: "center",
    position: "absolute",
    right: 20,
    top: 20,
    width: 40,
    zIndex: 20,
  },
  /** Native sheet surface supplied separately from the fixed-height body. */
  surface: {
    backgroundColor: theme.colors.surface.sheet,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
  },
  handle: {
    alignSelf: "center",
    backgroundColor: theme.colors.surface.disabled,
    borderRadius: 2,
    height: 4,
    marginBottom: 14,
    marginTop: 10,
    width: 36,
  },
  phaseContent: {
    flex: 1,
    paddingTop: 8,
  },
  phaseTitle: {
    ...theme.typography.ui.titleMedium,
    color: theme.colors.content.primary,
    textAlign: "center",
  },
  dots: {
    alignItems: "center",
    flexDirection: "row",
    gap: 7,
    justifyContent: "center",
    minHeight: 16,
  },
  dot: {
    borderRadius: 3,
    height: 6,
    width: 6,
  },
  dotActive: {
    backgroundColor: theme.colors.content.secondary,
  },
  dotIdle: {
    backgroundColor: theme.colors.surface.disabled,
  },
  errorText: {
    ...theme.typography.ui.label,
    color: theme.colors.status.danger,
    textAlign: "center",
  },
  // A fixed line box means conditional frame content cannot move the slot label.
  slotLabel: {
    ...theme.typography.ui.metadataCapsMedium,
    color: theme.colors.content.muted,
    height: FEATURED_SLOT_LABEL_HEIGHT,
    textAlign: "center",
  },
  // Cached PNGs fill this canvas; live placeholders use the captured board origin.
  // The shared crop boundary makes the visible shadow identical in both paths.
  frameCanvas: {
    position: "relative",
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  liveFrame: {
    position: "absolute",
  },
  phaseViewport: (height: number) => ({
    height,
    overflow: "hidden",
  }),
  pickerStatus: {
    alignItems: "center",
    justifyContent: "center",
    minHeight: 24,
    paddingHorizontal: 20,
  },
  placeholder: {
    alignItems: "center",
    backgroundColor: theme.colors.surface.subtle,
    flex: 1,
    justifyContent: "center",
    paddingHorizontal: 32,
  },
  placeholderText: {
    ...theme.typography.ui.titleMedium,
    color: theme.colors.content.secondary,
    marginTop: 16,
    textAlign: "center",
  },
  primaryButton: {
    alignItems: "center",
    borderCurve: "continuous",
    borderRadius: 16,
    marginHorizontal: 20,
    marginTop: 12,
    paddingVertical: 16,
  },
  primaryButtonDisabled: {
    backgroundColor: theme.colors.action.disabled,
  },
  primaryButtonEnabled: {
    backgroundColor: theme.colors.action.primary,
  },
  primaryButtonLabel: {
    ...theme.typography.ui.bodyMedium,
    color: theme.colors.content.onAction,
  },
  primaryButtonLabelDisabled: {
    color: theme.colors.content.onDisabledAction,
  },
  publicationWarning: {
    ...theme.typography.ui.caption,
    color: theme.colors.status.warning,
    marginTop: 4,
    textAlign: "center",
  },
  retryRow: {
    alignItems: "center",
    flexDirection: "row",
    gap: 8,
  },
  retryText: {
    ...theme.typography.ui.labelMedium,
    color: theme.colors.status.dangerStrong,
  },
  sheetBody: (height: number, paddingBottom: number) => ({
    height,
    paddingBottom,
  }),
  statusText: {
    ...theme.typography.ui.label,
    color: theme.colors.content.muted,
  },
  warningSpacer: {
    height: 20,
  },
}));
