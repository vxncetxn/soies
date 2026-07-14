/**
 * GalleryPager — horizontal paging strip of framed Gallery artefacts.
 *
 * Mirrors DayPager's paging + ScrollIndicator pattern on the X axis. Artefact
 * identity—not a pixel offset—is the selection source of truth, so rotation,
 * refresh, and post-add ordering changes all resolve back to the same frame.
 *
 * Rows contain only their live frame and trigger. The pager owns one transient
 * FocusOverlay for the selected target and keeps it mounted through the close
 * spring, avoiding ten full-screen portals and ten duplicate subject trees at
 * Gallery capacity. Persistence failures stay distinct from a truthful empty
 * Gallery and expose retry rather than silently replacing good rows.
 */
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  Pressable,
  Text,
  useWindowDimensions,
  View,
} from "react-native";
import Animated, {
  type AnimatedRef,
  useAnimatedRef,
  useAnimatedScrollHandler,
  useDerivedValue,
} from "react-native-reanimated";

import type { Entry, GalleryArtefact } from "../data/entries";

import { getGallery, isPrintArtefact, removeArtefactFromGallery } from "../data/entries";
import {
  clearPendingGalleryArtefact,
  getPendingGalleryArtefact,
} from "../gallery/pendingGalleryPage";
import { useHomeChromeFade } from "../hooks/useHomeChromeFade";
import { usePagingScroll } from "../hooks/usePagingScroll";
import FocusOverlay, { type FocusMenuItem } from "./FocusOverlay";
import { useGalleryVersion } from "./GalleryContext";
import GalleryFrame, { wellSizeFittingBoard } from "./GalleryFrame";
import { ArtefactPreview, ScrollIndicator } from "./ScrollIndicator";

function entryForPreview(galleryArtefact: GalleryArtefact): Entry {
  if (isPrintArtefact(galleryArtefact.artefact)) {
    return {
      title: galleryArtefact.entryTitle,
      type: "print",
      artefacts: [galleryArtefact.artefact],
    };
  }
  if ("rawData" in galleryArtefact.artefact) {
    return {
      title: galleryArtefact.entryTitle,
      type: galleryArtefact.artefact.type,
      artefacts: [galleryArtefact.artefact],
    };
  }
  return {
    title: galleryArtefact.entryTitle,
    type: "paper",
    artefacts: [galleryArtefact.artefact],
  };
}

type GalleryPageProps = {
  galleryArtefact: GalleryArtefact;
  pageWidth: number;
  wellWidth: number;
  viewportWidth: number;
  onRequestFocus: (target: FocusTarget) => void;
};

type FocusTarget = {
  galleryArtefact: GalleryArtefact;
  triggerRef: AnimatedRef<Animated.View>;
};

function GalleryPage({
  galleryArtefact,
  pageWidth,
  wellWidth,
  viewportWidth,
  onRequestFocus,
}: GalleryPageProps) {
  const triggerRef = useAnimatedRef<Animated.View>();

  return (
    <View style={{ width: pageWidth }} className="flex-1 items-center justify-center">
      <GalleryFrame
        artefact={galleryArtefact.artefact}
        wellWidth={wellWidth}
        viewportWidth={viewportWidth}
        triggerRef={triggerRef}
        interactive
        onRequestFocus={() => onRequestFocus({ galleryArtefact, triggerRef })}
      />
    </View>
  );
}

export default function GalleryPager() {
  const { galleryVersion, bumpGalleryVersion } = useGalleryVersion();
  const { width: screenWidth, height: screenHeight } = useWindowDimensions();
  const indicatorFadeStyle = useHomeChromeFade();

  const [galleryArtefacts, setGalleryArtefacts] = useState<GalleryArtefact[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<Error | null>(null);
  const [loadAttempt, setLoadAttempt] = useState(0);
  const [removeError, setRemoveError] = useState<string | null>(null);
  const [failedRemoveId, setFailedRemoveId] = useState<string | null>(null);
  // Native resize restoration needs the last settled identity but rendering
  // does not; a ref avoids an extra React pass on every completed swipe.
  const activeArtefactIdRef = useRef<string | null>(null);
  const [focusTarget, setFocusTarget] = useState<FocusTarget | null>(null);
  const [focusOpen, setFocusOpen] = useState(false);
  const pendingRemoveRef = useRef<string | null>(null);
  const previousPageWidthRef = useRef(screenWidth);
  const measuredContentWidthRef = useRef(0);
  const [contentLayoutVersion, setContentLayoutVersion] = useState(0);
  const pageWidth = screenWidth;
  // Calculate the portrait frame once per viewport; rows and the overlay clone
  // consume the same dimensions instead of subscribing independently.
  const well = wellSizeFittingBoard(screenWidth - 72, screenHeight * 0.52);

  const { scrollRef, scrollOffset, jumpToIndex } = usePagingScroll({
    pageSize: pageWidth,
    axis: "x",
  });

  const currentPage = useDerivedValue(() => {
    if (pageWidth <= 0) {
      return 0;
    }
    return scrollOffset.get() / pageWidth;
  });

  const onScroll = useAnimatedScrollHandler((event) => {
    scrollOffset.set(event.contentOffset.x);
  });

  const animateClampAfterDeleteRef = useRef(false);

  useEffect(() => {
    let cancelled = false;
    void getGallery()
      .then((next) => {
        if (!cancelled) {
          setGalleryArtefacts(next);
          setLoadError(null);
          if (
            !activeArtefactIdRef.current ||
            !next.some(
              (galleryArtefact) => galleryArtefact.artefact.id === activeArtefactIdRef.current,
            )
          ) {
            activeArtefactIdRef.current = next[0]?.artefact.id ?? null;
          }
        }
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          setLoadError(error instanceof Error ? error : new Error(String(error)));
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
  }, [galleryVersion, loadAttempt]);

  useLayoutEffect(() => {
    const pendingArtefactId = getPendingGalleryArtefact();
    if (pendingArtefactId == null || galleryArtefacts.length === 0) {
      return;
    }
    const index = galleryArtefacts.findIndex(
      (galleryArtefact) => galleryArtefact.artefact.id === pendingArtefactId,
    );
    if (index < 0) {
      return;
    }
    // A lazy first mount can have React rows before the native ScrollView has
    // measured them. Keep the identity pending until the target page exists in
    // native content and `jumpToIndex` can issue a real scroll command.
    if (measuredContentWidthRef.current < (index + 1) * pageWidth) {
      return;
    }
    if (!jumpToIndex(index, false)) {
      return;
    }
    activeArtefactIdRef.current = pendingArtefactId;
    clearPendingGalleryArtefact(pendingArtefactId);
  }, [contentLayoutVersion, galleryArtefacts, jumpToIndex, pageWidth]);

  useLayoutEffect(() => {
    const sizeChanged = previousPageWidthRef.current !== pageWidth;
    previousPageWidthRef.current = pageWidth;
    if (!sizeChanged || galleryArtefacts.length === 0) {
      return;
    }
    const index = Math.max(
      0,
      galleryArtefacts.findIndex(
        (galleryArtefact) => galleryArtefact.artefact.id === activeArtefactIdRef.current,
      ),
    );
    jumpToIndex(index, false);
  }, [galleryArtefacts, jumpToIndex, pageWidth]);

  useLayoutEffect(() => {
    if (!animateClampAfterDeleteRef.current) {
      return;
    }
    animateClampAfterDeleteRef.current = false;
    if (galleryArtefacts.length === 0) {
      scrollOffset.set(0);
      return;
    }
    const page = Math.round(scrollOffset.get() / pageWidth);
    const clamped = Math.max(0, Math.min(galleryArtefacts.length - 1, page));
    activeArtefactIdRef.current = galleryArtefacts[clamped]?.artefact.id ?? null;
    jumpToIndex(clamped, true);
  }, [galleryArtefacts, jumpToIndex, pageWidth, scrollOffset]);

  const handleDelete = (artefactId: string) => {
    setRemoveError(null);
    setFailedRemoveId(null);
    void removeArtefactFromGallery(artefactId)
      .then(() => {
        animateClampAfterDeleteRef.current = true;
        bumpGalleryVersion();
      })
      .catch(() => {
        setRemoveError("Couldn't remove this artefact from Gallery. Try again.");
        setFailedRemoveId(artefactId);
      });
  };

  const onScrollEnd = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    if (pageWidth <= 0 || galleryArtefacts.length === 0) {
      return;
    }
    const index = Math.max(
      0,
      Math.min(
        galleryArtefacts.length - 1,
        Math.round(event.nativeEvent.contentOffset.x / pageWidth),
      ),
    );
    activeArtefactIdRef.current = galleryArtefacts[index]?.artefact.id ?? null;
  };

  const focusMenuItems: FocusMenuItem[] = focusTarget
    ? [
        {
          label: "Remove from Gallery",
          icon: "trash",
          onPress: () => {
            pendingRemoveRef.current = focusTarget.galleryArtefact.artefact.id;
            setFocusOpen(false);
          },
        },
      ]
    : [];

  const finishFocusClose = () => {
    const artefactId = pendingRemoveRef.current;
    pendingRemoveRef.current = null;
    setFocusTarget(null);
    if (artefactId) {
      handleDelete(artefactId);
    }
  };

  const retryLoad = () => {
    setLoading(true);
    setLoadError(null);
    setLoadAttempt((attempt) => attempt + 1);
  };

  if (loading && galleryArtefacts.length === 0 && !loadError) {
    return (
      <View className="flex-1 items-center justify-center bg-background">
        <ActivityIndicator />
      </View>
    );
  }

  if (loadError && galleryArtefacts.length === 0) {
    return (
      <View className="flex-1 items-center justify-center gap-4 bg-background px-8">
        <Text className="text-center text-primary">Couldn&apos;t load Gallery.</Text>
        <Pressable
          onPress={retryLoad}
          accessibilityRole="button"
          accessibilityLabel="Retry loading Gallery"
          className="rounded-full border border-controls-border bg-controls-background px-5 py-2"
        >
          <Text className="text-primary">Try again</Text>
        </Pressable>
      </View>
    );
  }

  if (galleryArtefacts.length === 0 && !loading) {
    return (
      <View className="flex-1 items-center justify-center bg-background px-8">
        <Text className="text-center text-primary">No artefacts in Gallery yet.</Text>
      </View>
    );
  }

  return (
    <View className="flex-1 bg-background">
      <Animated.ScrollView
        ref={scrollRef}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onScroll={onScroll}
        onMomentumScrollEnd={onScrollEnd}
        onContentSizeChange={(width) => {
          measuredContentWidthRef.current = width;
          setContentLayoutVersion((version) => version + 1);
        }}
        scrollEventThrottle={16}
        style={{ flex: 1, backgroundColor: "transparent" }}
        contentContainerStyle={{
          minHeight: "100%",
          // SafeAreaView already insets the tab body — only clear the floating tab bar.
          paddingBottom: 96,
          alignItems: "center",
        }}
      >
        {galleryArtefacts.map((galleryArtefact) => (
          <GalleryPage
            key={galleryArtefact.galleryId}
            galleryArtefact={galleryArtefact}
            pageWidth={pageWidth}
            wellWidth={well.width}
            viewportWidth={screenWidth}
            onRequestFocus={(target) => {
              setFocusTarget(target);
              setFocusOpen(true);
            }}
          />
        ))}
      </Animated.ScrollView>

      {loadError || removeError ? (
        <View className="absolute top-4 right-4 left-4 flex-row items-center justify-between gap-3 rounded-2xl bg-stone-800 px-4 py-3">
          <Text className="flex-1 text-sm text-white">
            {removeError ?? "Couldn't refresh Gallery."}
          </Text>
          {loadError || failedRemoveId ? (
            <Pressable
              onPress={() => {
                if (failedRemoveId) {
                  handleDelete(failedRemoveId);
                } else {
                  retryLoad();
                }
              }}
              accessibilityRole="button"
              accessibilityLabel={
                failedRemoveId ? "Retry removing artefact from Gallery" : "Retry refreshing Gallery"
              }
            >
              <Text className="font-sans-medium text-sm text-white">Try again</Text>
            </Pressable>
          ) : null}
        </View>
      ) : null}

      <Animated.View
        style={indicatorFadeStyle}
        className="absolute right-0 bottom-28 left-0 items-center"
        pointerEvents="box-none"
      >
        <ScrollIndicator
          orientation="horizontal"
          count={galleryArtefacts.length}
          currentPage={currentPage}
          onJumpToIndex={(index) => {
            activeArtefactIdRef.current = galleryArtefacts[index]?.artefact.id ?? null;
            jumpToIndex(index, false);
          }}
          renderPreview={(index) => {
            const galleryArtefact = galleryArtefacts[index];
            if (!galleryArtefact) {
              return null;
            }
            return <ArtefactPreview entry={entryForPreview(galleryArtefact)} index={0} />;
          }}
        />
      </Animated.View>

      {focusTarget ? (
        <FocusOverlay
          triggerRef={focusTarget.triggerRef}
          open={focusOpen}
          subject={
            <GalleryFrame
              artefact={focusTarget.galleryArtefact.artefact}
              wellWidth={well.width}
              viewportWidth={screenWidth}
            />
          }
          menuItems={focusMenuItems}
          onRequestClose={() => setFocusOpen(false)}
          onCloseComplete={finishFocusClose}
          accessibilityDismissLabel="Dismiss Gallery options"
        />
      ) : null}
    </View>
  );
}
