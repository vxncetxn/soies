/**
 * GalleryAddSheet — select one artefact from an Entry and feature it.
 *
 * The sheet uses three identities instead of positions:
 *   1. The Entry object identifies one presentation session.
 *   2. `selectedArtefactIdRef` is the authoritative carousel selection.
 *   3. The same artefact ID is handed to Gallery after persistence.
 * This keeps the visible frame, committed artefact, and post-navigation target
 * aligned across rotation and asynchronous Gallery refreshes.
 *
 * The native `'content'` detent measures the first presentation without a
 * full-height intermediate frame. GalleryAddProvider retains the keyed session
 * only until the close animation settles, then all framed content unmounts. During the
 * repository transaction, Cancel and the closed detent become programmatic-
 * only: the UI communicates that Add is committing and cannot dismiss a write
 * whose result would later navigate from a different session.
 *
 * Membership loading is a prerequisite, not an optimistic hint. Add stays
 * disabled until the bounded candidate query succeeds, and capacity/read/write
 * failures have distinct recovery copy.
 */
import { ModalBottomSheet, programmatic } from "@swmansion/react-native-bottom-sheet";
import { useRouter } from "expo-router";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import type { Artefact, Entry } from "../data/entries";

import { useGalleryVersion } from "../components/GalleryContext";
import GalleryFrame, { FRAME_BOARD_SCALE, wellSizeFittingBoard } from "../components/GalleryFrame";
import {
  addArtefactToGallery,
  GALLERY_CAPACITY,
  getGalleryPickerState,
  isGalleryCapacityError,
} from "../data/entries";
import { setPendingGalleryArtefact } from "./pendingGalleryPage";

type GalleryAddSheetProps = {
  /** Entry held by GalleryAddProvider through the entire native close animation. */
  entry: Entry;
  /** Home page visible when this session was requested. */
  initialPage: number;
  /** Controlled presentation state owned by GalleryAddProvider. */
  open: boolean;
  /** Marks the provider session closed while preserving content for native settle. */
  onClose: () => void;
  /** Unmounts the keyed session only after the native sheet reaches detent zero. */
  onClosed: () => void;
};

const SHEET_SURFACE = "#F5F5F4";

export function GalleryAddSheet({
  entry,
  initialPage,
  open,
  onClose,
  onClosed,
}: GalleryAddSheetProps) {
  const insets = useSafeAreaInsets();
  const { width: screenWidth, height: screenHeight } = useWindowDimensions();
  const { bumpGalleryVersion } = useGalleryVersion();
  const { push } = useRouter();

  const artefacts = entry.artefacts as Artefact[];

  // Shared 3:4 frame geometry. Rotation recomputes `snap`, then the layout
  // effect below resolves the same selected ID back to its new native offset.
  const well = wellSizeFittingBoard(screenWidth * 0.48, screenHeight * 0.3);
  const wellWidth = well.width;
  const pageWidth = wellWidth * FRAME_BOARD_SCALE;
  const pageHeight = well.height * FRAME_BOARD_SCALE;
  const chromePeek = wellWidth * ((FRAME_BOARD_SCALE - 1) / 2) * 0.75;
  const sidePad = Math.max(0, (screenWidth - pageWidth) / 2);
  const pageGap = Math.max(chromePeek, Math.round(sidePad - chromePeek));
  const snap = pageWidth + pageGap;
  const snapOffsets = artefacts.map((_, index) => index * snap);
  const clampedInitial = Math.max(0, Math.min(Math.max(artefacts.length - 1, 0), initialPage));

  const initialArtefactId = artefacts[clampedInitial]?.id ?? null;
  const [sheetIndex, setSheetIndex] = useState(1);
  const [selectedArtefactId, setSelectedArtefactId] = useState<string | null>(initialArtefactId);
  const selectedArtefactIdRef = useRef<string | null>(initialArtefactId);
  const [featuredIds, setFeaturedIds] = useState<Set<string>>(new Set());
  const [galleryFull, setGalleryFull] = useState(false);
  const [membershipLoading, setMembershipLoading] = useState(true);
  const [membershipError, setMembershipError] = useState(false);
  const [membershipAttempt, setMembershipAttempt] = useState(0);
  const [busy, setBusy] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const busyRef = useRef(false);
  const closingRef = useRef(false);
  const scrollRef = useRef<ScrollView>(null);

  /** Restore the selected identity whenever geometry or candidate order changes. */
  useLayoutEffect(() => {
    if (!open || artefacts.length === 0) {
      return;
    }
    const selectedId = selectedArtefactIdRef.current;
    const selectedIndex = Math.max(
      0,
      artefacts.findIndex((artefact) => artefact.id === selectedId),
    );
    scrollRef.current?.scrollTo({ x: selectedIndex * snap, y: 0, animated: false });
  }, [artefacts, open, snap]);

  useEffect(() => {
    if (!open) {
      return;
    }
    let cancelled = false;
    void getGalleryPickerState(artefacts.map((artefact) => artefact.id))
      .then((state) => {
        if (!cancelled) {
          setFeaturedIds(state.featuredIds);
          setGalleryFull(state.isFull);
          setMembershipError(false);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setMembershipError(true);
        }
      })
      .finally(() => {
        if (!cancelled) {
          setMembershipLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [artefacts, membershipAttempt, open]);

  const selectAtOffset = (event: NativeSyntheticEvent<NativeScrollEvent>, targetX?: number) => {
    if (artefacts.length === 0 || snap <= 0) {
      return;
    }
    const x = targetX ?? event.nativeEvent.contentOffset.x;
    const index = Math.max(0, Math.min(artefacts.length - 1, Math.round(x / snap)));
    const artefactId = artefacts[index]?.id ?? null;
    selectedArtefactIdRef.current = artefactId;
    setSelectedArtefactId(artefactId);
    setErrorMessage(null);
  };

  const selected = artefacts.find((artefact) => artefact.id === selectedArtefactId);
  const alreadyFeatured = selected ? featuredIds.has(selected.id) : false;
  const addDisabled =
    busy || membershipLoading || membershipError || galleryFull || alreadyFeatured || !selected;

  /**
   * Start the transactional commit. From this point until resolution, the only
   * reachable detent is the open content detent and Cancel is disabled; callers
   * therefore cannot create a dismissed-session mutation/navigation race.
   */
  const confirmAdd = () => {
    if (addDisabled || !selected || busyRef.current) {
      return;
    }
    const artefactId = selected.id;
    busyRef.current = true;
    setBusy(true);
    setErrorMessage(null);

    void addArtefactToGallery(artefactId)
      .then(() => {
        setPendingGalleryArtefact(artefactId);
        bumpGalleryVersion();
        closingRef.current = true;
        setSheetIndex(0);
        onClose();
        push("/gallery");
      })
      .catch((error: unknown) => {
        if (isGalleryCapacityError(error)) {
          setGalleryFull(true);
          setErrorMessage(`Gallery is full (${GALLERY_CAPACITY} artefacts).`);
        } else {
          setErrorMessage("Couldn't add this artefact to Gallery. Try again.");
        }
        busyRef.current = false;
        setBusy(false);
      });
  };

  const requestClose = () => {
    if (busyRef.current) {
      return;
    }
    closingRef.current = true;
    setSheetIndex(0);
    onClose();
  };

  if (artefacts.length === 0) {
    return null;
  }

  return (
    <ModalBottomSheet
      index={sheetIndex}
      detents={busy ? [programmatic(0), "content"] : [0, "content"]}
      onIndexChange={(index) => {
        if (index === 0) {
          requestClose();
          return;
        }
        setSheetIndex(index);
      }}
      onSettle={(index) => {
        if (index === 0 && closingRef.current) {
          onClosed();
        }
      }}
      animateIn
      extendUnderStatusBar
      scrimColor="rgba(0,0,0,0.35)"
      surface={<View style={[StyleSheet.absoluteFill, styles.surface]} />}
    >
      <View style={[styles.content, { paddingBottom: Math.max(insets.bottom, 16) }]}>
        <View style={styles.handle} />
        <Text className="mb-4 text-center font-sans-medium text-base text-primary">
          Add to Gallery
        </Text>

        <ScrollView
          ref={scrollRef}
          horizontal
          showsHorizontalScrollIndicator={false}
          decelerationRate="fast"
          snapToOffsets={snapOffsets}
          snapToAlignment="start"
          disableIntervalMomentum
          style={{ backgroundColor: SHEET_SURFACE }}
          contentContainerStyle={{
            paddingHorizontal: sidePad,
            alignItems: "center",
            paddingVertical: 24,
            backgroundColor: SHEET_SURFACE,
          }}
          onMomentumScrollEnd={selectAtOffset}
          onScrollEndDrag={(event) => {
            selectAtOffset(event, event.nativeEvent.targetContentOffset?.x);
          }}
        >
          {artefacts.map((artefact, index) => (
            <View
              key={artefact.id}
              style={{
                width: pageWidth,
                height: pageHeight,
                marginRight: index < artefacts.length - 1 ? pageGap : 0,
                alignItems: "center",
                justifyContent: "center",
                backgroundColor: SHEET_SURFACE,
              }}
            >
              <GalleryFrame artefact={artefact} wellWidth={wellWidth} viewportWidth={screenWidth} />
            </View>
          ))}
        </ScrollView>

        {artefacts.length > 1 ? (
          <View style={styles.dots}>
            {artefacts.map((artefact) => (
              <View
                key={artefact.id}
                style={[
                  styles.dot,
                  artefact.id === selectedArtefactId ? styles.dotActive : styles.dotIdle,
                ]}
              />
            ))}
          </View>
        ) : (
          <View style={{ height: 16 }} />
        )}

        <View className="min-h-5 flex-row items-center justify-center gap-2 px-4">
          {errorMessage ? (
            <Text className="text-center text-sm text-red-600">{errorMessage}</Text>
          ) : membershipLoading ? (
            <Text className="text-center text-sm text-stone-500">Checking Gallery…</Text>
          ) : membershipError ? (
            <>
              <Text className="text-center text-sm text-red-600">Couldn&apos;t check Gallery.</Text>
              <Pressable
                onPress={() => {
                  setMembershipLoading(true);
                  setMembershipError(false);
                  setMembershipAttempt((attempt) => attempt + 1);
                }}
                accessibilityRole="button"
                accessibilityLabel="Retry checking Gallery"
              >
                <Text className="font-sans-medium text-sm text-red-700">Try again</Text>
              </Pressable>
            </>
          ) : alreadyFeatured ? (
            <Text className="text-center text-sm text-stone-500">Already in Gallery</Text>
          ) : galleryFull ? (
            <Text className="text-center text-sm text-stone-500">
              Gallery is full ({GALLERY_CAPACITY} artefacts)
            </Text>
          ) : null}
        </View>

        <View className="mt-4 flex-row gap-3 px-4">
          <Pressable
            disabled={busy}
            onPress={requestClose}
            accessibilityRole="button"
            accessibilityLabel="Cancel"
            accessibilityState={{ disabled: busy }}
            className="flex-1 items-center rounded-2xl bg-stone-200 py-3.5"
            style={{ borderCurve: "continuous", opacity: busy ? 0.5 : 1 }}
          >
            <Text className="font-sans-medium text-base text-primary">Cancel</Text>
          </Pressable>
          <Pressable
            disabled={addDisabled}
            onPress={confirmAdd}
            accessibilityRole="button"
            accessibilityLabel="Add to Gallery"
            accessibilityState={{ disabled: addDisabled, busy }}
            className={`flex-1 items-center rounded-2xl py-3.5 ${addDisabled ? "bg-stone-300" : "bg-primary"}`}
            style={{ borderCurve: "continuous", opacity: addDisabled ? 0.55 : 1 }}
          >
            {busy ? (
              <ActivityIndicator color="#FFFFFF" />
            ) : (
              <Text
                className={`font-sans-medium text-base ${addDisabled ? "text-stone-500" : "text-white"}`}
              >
                Add to Gallery
              </Text>
            )}
          </Pressable>
        </View>
      </View>
    </ModalBottomSheet>
  );
}

const styles = StyleSheet.create({
  surface: {
    backgroundColor: SHEET_SURFACE,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
  },
  content: {
    paddingTop: 8,
    backgroundColor: SHEET_SURFACE,
  },
  handle: {
    alignSelf: "center",
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: "#D6D3D1",
    marginBottom: 12,
  },
  dots: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    gap: 8,
    height: 16,
    backgroundColor: SHEET_SURFACE,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  dotActive: {
    backgroundColor: "#57534E",
  },
  dotIdle: {
    backgroundColor: "#D6D3D1",
  },
});
