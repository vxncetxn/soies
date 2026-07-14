/**
 * GalleryAddSheet — pick one artefact from an entry to feature in the Gallery.
 *
 * Horizontal framed carousel (≤5 artefacts). Cancel dismisses; Add is dimmed
 * with a short message when the selection is already featured. On success:
 * persist → bump gallery version → set pending page → close → navigate Gallery.
 */
import { ModalBottomSheet } from "@swmansion/react-native-bottom-sheet";
import { useRouter } from "expo-router";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  NativeScrollEvent,
  NativeSyntheticEvent,
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
import { addArtefactToGallery, getFeaturedArtefactIds, getGallery } from "../data/entries";
import { setPendingGalleryPage } from "./pendingGalleryPage";

type GalleryAddSheetProps = {
  entry: Entry | null;
  initialPage: number;
  open: boolean;
  onClose: () => void;
};

const SHEET_SURFACE = "#F5F5F4";

export function GalleryAddSheet({ entry, initialPage, open, onClose }: GalleryAddSheetProps) {
  const insets = useSafeAreaInsets();
  const { width: screenWidth, height: screenHeight } = useWindowDimensions();
  const { bumpGalleryVersion } = useGalleryVersion();
  const { push } = useRouter();

  const [cachedEntry, setCachedEntry] = useState<Entry | null>(entry);
  if (entry !== null && entry !== cachedEntry) {
    setCachedEntry(entry);
  }
  const activeEntry = entry ?? cachedEntry;
  const artefacts = (activeEntry?.artefacts ?? []) as Artefact[];

  // Shared Astro 3:4 well; board fits sheet with room for neighbour frame chrome only.
  const well = wellSizeFittingBoard(screenWidth * 0.48, screenHeight * 0.3);
  const wellWidth = well.width;
  const pageWidth = wellWidth * FRAME_BOARD_SCALE;
  const pageHeight = well.height * FRAME_BOARD_SCALE;
  // Peek only outer board chrome (~22.5% of well per side), not the artefact.
  const chromePeek = wellWidth * ((FRAME_BOARD_SCALE - 1) / 2) * 0.75;
  const sidePad = Math.max(0, (screenWidth - pageWidth) / 2);
  const pageGap = Math.max(chromePeek, Math.round(sidePad - chromePeek));
  const snap = pageWidth + pageGap;
  const snapOffsets = artefacts.map((_, index) => index * snap);

  const clampedInitial = Math.max(0, Math.min(Math.max(artefacts.length - 1, 0), initialPage));

  const [sheetIndex, setSheetIndex] = useState(0);
  const [page, setPage] = useState(clampedInitial);
  const [featuredIds, setFeaturedIds] = useState<Set<string>>(new Set());
  const [contentHeight, setContentHeight] = useState(0);
  const [busy, setBusy] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [prevOpen, setPrevOpen] = useState(open);
  const busyRef = useRef(false);
  const scrollRef = useRef<ScrollView>(null);

  if (open !== prevOpen) {
    setPrevOpen(open);
    if (open && artefacts.length > 0) {
      setPage(clampedInitial);
      setErrorMessage(null);
      setBusy(false);
      setSheetIndex(1);
    } else if (!open) {
      setSheetIndex(0);
    }
  }

  useLayoutEffect(() => {
    if (open) {
      busyRef.current = false;
    }
  }, [open]);

  useEffect(() => {
    if (!open) {
      return;
    }
    let cancelled = false;
    void getFeaturedArtefactIds().then((ids) => {
      if (!cancelled) {
        setFeaturedIds(ids);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [open, activeEntry]);

  useLayoutEffect(() => {
    if (!open || artefacts.length === 0) {
      return;
    }
    scrollRef.current?.scrollTo({ x: clampedInitial * snap, y: 0, animated: false });
  }, [open, clampedInitial, snap, artefacts.length]);

  const onIndexChange = (index: number) => {
    setSheetIndex(index);
    if (index === 0) {
      onClose();
    }
  };

  const onScrollEnd = (event: NativeSyntheticEvent<NativeScrollEvent>, targetX?: number) => {
    const x = targetX ?? event.nativeEvent.contentOffset.x;
    const next = Math.max(0, Math.min(artefacts.length - 1, Math.round(x / snap)));
    setPage(next);
  };

  const selected = artefacts[page];
  const alreadyFeatured = selected ? featuredIds.has(selected.id) : false;
  const openDetent = contentHeight > 0 ? contentHeight : screenHeight;

  const confirmAdd = () => {
    if (!selected || alreadyFeatured || busyRef.current) {
      return;
    }
    const artefactId = selected.id;
    busyRef.current = true;
    setBusy(true);
    setErrorMessage(null);

    void getGallery()
      .then(async (before) => {
        let existingIndex = -1;
        for (let index = 0; index < before.length; index += 1) {
          if (before[index].artefact.id === artefactId) {
            existingIndex = index;
            break;
          }
        }
        await addArtefactToGallery(artefactId);
        let nextIndex = before.length;
        if (existingIndex >= 0) {
          nextIndex = existingIndex;
        }
        setPendingGalleryPage(nextIndex);
        bumpGalleryVersion();
        onClose();
        push("/gallery");
      })
      .catch(() => {
        setErrorMessage("Couldn't add to Gallery");
        busyRef.current = false;
        setBusy(false);
      });
  };

  if (!activeEntry || artefacts.length === 0) {
    return null;
  }

  return (
    <ModalBottomSheet
      index={sheetIndex}
      detents={[0, openDetent]}
      onIndexChange={onIndexChange}
      animateIn
      extendUnderStatusBar
      scrimColor="rgba(0,0,0,0.35)"
      surface={<View style={[StyleSheet.absoluteFill, styles.surface]} />}
    >
      <View
        style={[styles.content, { paddingBottom: Math.max(insets.bottom, 16) }]}
        onLayout={(event) => {
          const { height } = event.nativeEvent.layout;
          setContentHeight((previous) => (Math.abs(previous - height) < 0.5 ? previous : height));
        }}
      >
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
          onMomentumScrollEnd={onScrollEnd}
          onScrollEndDrag={(event) => {
            onScrollEnd(event, event.nativeEvent.targetContentOffset?.x);
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
              <GalleryFrame artefact={artefact} wellWidth={wellWidth} />
            </View>
          ))}
        </ScrollView>

        {artefacts.length > 1 ? (
          <View style={styles.dots}>
            {artefacts.map((artefact, index) => (
              <View
                key={artefact.id}
                style={[styles.dot, index === page ? styles.dotActive : styles.dotIdle]}
              />
            ))}
          </View>
        ) : (
          <View style={{ height: 16 }} />
        )}

        {errorMessage ? (
          <Text className="px-4 text-center text-sm text-red-600">{errorMessage}</Text>
        ) : alreadyFeatured ? (
          <Text className="px-4 text-center text-sm text-stone-500">Already in Gallery</Text>
        ) : (
          <View className="h-5" />
        )}

        <View className="mt-4 flex-row gap-3 px-4">
          <Pressable
            onPress={onClose}
            accessibilityRole="button"
            accessibilityLabel="Cancel"
            className="flex-1 items-center rounded-2xl bg-stone-200 py-3.5"
            style={{ borderCurve: "continuous" }}
          >
            <Text className="font-sans-medium text-base text-primary">Cancel</Text>
          </Pressable>
          <Pressable
            disabled={busy || alreadyFeatured}
            onPress={() => {
              void confirmAdd();
            }}
            accessibilityRole="button"
            accessibilityLabel="Add to Gallery"
            className={`flex-1 items-center rounded-2xl py-3.5 ${busy || alreadyFeatured ? "bg-stone-300" : "bg-primary"}`}
            style={{
              borderCurve: "continuous",
              opacity: busy || alreadyFeatured ? 0.55 : 1,
            }}
          >
            {busy ? (
              <ActivityIndicator color="#FFFFFF" />
            ) : (
              <Text
                className={`font-sans-medium text-base ${alreadyFeatured ? "text-stone-500" : "text-white"}`}
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
