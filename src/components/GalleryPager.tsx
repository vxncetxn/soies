/**
 * GalleryPager — horizontal paging strip of framed Gallery artefacts.
 *
 * Mirrors DayPager’s paging + ScrollIndicator pattern on the X axis. Uses
 * `usePagingScroll` for jump/offset wiring. Pending page (post-add) is applied
 * before paint so the camera-shift lands already on the new frame.
 */
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { Text, useWindowDimensions, View } from "react-native";
import Animated, {
  useAnimatedRef,
  useAnimatedScrollHandler,
  useDerivedValue,
} from "react-native-reanimated";

import type { Entry, GalleryArtefact } from "../data/entries";

import { getGallery, isPrintArtefact, removeArtefactFromGallery } from "../data/entries";
import { consumePendingGalleryPage } from "../gallery/pendingGalleryPage";
import { useHomeChromeFade } from "../hooks/useHomeChromeFade";
import { usePagingScroll } from "../hooks/usePagingScroll";
import FocusOverlay, { type FocusMenuItem } from "./FocusOverlay";
import { useGalleryVersion } from "./GalleryContext";
import GalleryFrame, { wellSizeFittingBoard } from "./GalleryFrame";
import { ArtefactPreview, ScrollIndicator } from "./ScrollIndicator";

function entryForPreview(item: GalleryArtefact): Entry {
  if (isPrintArtefact(item.artefact)) {
    return {
      title: item.entryTitle,
      type: "print",
      artefacts: [item.artefact],
    };
  }
  if ("rawData" in item.artefact) {
    return {
      title: item.entryTitle,
      type: item.artefact.type,
      artefacts: [item.artefact],
    };
  }
  return {
    title: item.entryTitle,
    type: "paper",
    artefacts: [item.artefact],
  };
}

type GalleryItemProps = {
  item: GalleryArtefact;
  pageWidth: number;
  onRequestDelete: (artefactId: string) => void;
};

function GalleryItem({ item, pageWidth, onRequestDelete }: GalleryItemProps) {
  const [focusOpen, setFocusOpen] = useState(false);
  const triggerRef = useAnimatedRef<Animated.View>();
  const pendingDeleteRef = useRef(false);
  const { width: screenWidth, height: screenHeight } = useWindowDimensions();
  // Outer board must fit inside the screen; well is Astro 3:4 (not Paper/Print).
  const well = wellSizeFittingBoard(screenWidth - 72, screenHeight * 0.52);
  const wellWidth = well.width;

  const menuItems: FocusMenuItem[] = [
    {
      label: "Delete from Gallery",
      icon: "trash",
      onPress: () => {
        pendingDeleteRef.current = true;
        setFocusOpen(false);
      },
    },
  ];

  const finishFocusClose = () => {
    if (!pendingDeleteRef.current) {
      return;
    }
    pendingDeleteRef.current = false;
    onRequestDelete(item.artefact.id);
  };

  return (
    <View style={{ width: pageWidth }} className="flex-1 items-center justify-center">
      <GalleryFrame
        artefact={item.artefact}
        wellWidth={wellWidth}
        triggerRef={triggerRef}
        interactive
        onRequestFocus={() => setFocusOpen(true)}
      />
      <FocusOverlay
        triggerRef={triggerRef}
        open={focusOpen}
        subject={<GalleryFrame artefact={item.artefact} wellWidth={wellWidth} />}
        menuItems={menuItems}
        onRequestClose={() => setFocusOpen(false)}
        onCloseComplete={finishFocusClose}
        accessibilityDismissLabel="Dismiss gallery options"
      />
    </View>
  );
}

export default function GalleryPager() {
  const { galleryVersion, bumpGalleryVersion } = useGalleryVersion();
  const { width: screenWidth } = useWindowDimensions();
  const indicatorFadeStyle = useHomeChromeFade();

  const [items, setItems] = useState<GalleryArtefact[]>([]);
  const [loading, setLoading] = useState(true);
  const pageWidth = screenWidth;

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
          setItems(next);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setItems([]);
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
  }, [galleryVersion]);

  useLayoutEffect(() => {
    const pending = consumePendingGalleryPage();
    if (pending == null || items.length === 0) {
      return;
    }
    const clamped = Math.max(0, Math.min(items.length - 1, pending));
    jumpToIndex(clamped, false);
  }, [items, jumpToIndex]);

  useLayoutEffect(() => {
    if (!animateClampAfterDeleteRef.current) {
      return;
    }
    animateClampAfterDeleteRef.current = false;
    if (items.length === 0) {
      scrollOffset.set(0);
      return;
    }
    const page = Math.round(scrollOffset.get() / pageWidth);
    const clamped = Math.max(0, Math.min(items.length - 1, page));
    jumpToIndex(clamped, true);
  }, [items, jumpToIndex, pageWidth, scrollOffset]);

  const handleDelete = (artefactId: string) => {
    void removeArtefactFromGallery(artefactId)
      .then(() => {
        animateClampAfterDeleteRef.current = true;
        bumpGalleryVersion();
      })
      .catch(() => {
        // Ignore — membership unchanged.
      });
  };

  if (loading && items.length === 0) {
    return (
      <View className="flex-1 items-center justify-center bg-background">
        <Text className="text-center text-primary">Loading…</Text>
      </View>
    );
  }

  if (items.length === 0) {
    return (
      <View className="flex-1 items-center justify-center bg-background px-8">
        <Text className="text-center text-primary">No items in gallery.</Text>
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
        scrollEventThrottle={16}
        style={{ flex: 1, backgroundColor: "transparent" }}
        contentContainerStyle={{
          minHeight: "100%",
          // SafeAreaView already insets the tab body — only clear the floating tab bar.
          paddingBottom: 96,
          alignItems: "center",
        }}
      >
        {items.map((item) => (
          <GalleryItem
            key={item.galleryId}
            item={item}
            pageWidth={pageWidth}
            onRequestDelete={handleDelete}
          />
        ))}
      </Animated.ScrollView>

      <Animated.View
        style={indicatorFadeStyle}
        className="absolute right-0 bottom-28 left-0 items-center"
        pointerEvents="box-none"
      >
        <ScrollIndicator
          orientation="horizontal"
          count={items.length}
          currentPage={currentPage}
          onJumpToIndex={(index) => jumpToIndex(index, false)}
          renderPreview={(index) => {
            const item = items[index];
            if (!item) {
              return null;
            }
            return <ArtefactPreview entry={entryForPreview(item)} index={0} />;
          }}
        />
      </Animated.View>
    </View>
  );
}
