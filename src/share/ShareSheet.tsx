/**
 * ShareSheet — SM ModalBottomSheet for sharing a single artefact.
 *
 * Structure (top → bottom):
 *   1. Full-canvas horizontal carousel (WYSIWYG preview of the canvas export)
 *   2. Page dots when count > 1
 *   3. Light / dark background swatches
 *   4. Copy · Download · Instagram · Facebook · Others
 *
 * Rasterization is offscreen via ShareCaptureHost — the carousel is display-only.
 * Sheet stays open after actions; confirmations use ShareActionToast above the control.
 */
import { ModalBottomSheet } from "@swmansion/react-native-bottom-sheet";
import { useCallback, useLayoutEffect, useMemo, useRef, useState } from "react";
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

import type { Artefact, Entry, PaperArtefact, PrintArtefact } from "../data/entries";

import { isUnknownArtefact } from "../data/entries";
import {
  SHARE_BG,
  SHARE_EXPORT_HEIGHT,
  SHARE_EXPORT_WIDTH,
  type ShareBackgroundId,
} from "./constants";
import {
  copyImageToClipboard,
  getMetaAppId,
  isFacebookAvailable,
  isInstagramAvailable,
  requestPhotoLibraryWritePermission,
  saveImageToPhotos,
  ShareDestinationError,
  shareToFacebookStories,
  shareToInstagramStories,
  shareWithSystemSheet,
} from "./destinations";
import {
  ActionCircle,
  CopyGlyph,
  DownloadGlyph,
  FacebookGlyph,
  InstagramGlyph,
  OthersGlyph,
} from "./ShareActionGlyphs";
import { ShareActionToast } from "./ShareActionToast";
import {
  clearShareActionToast,
  createShareActionToastState,
  resetShareActionToast,
  showShareActionToast,
  type ShareActionToastAnchor,
} from "./shareActionToastState";
import { useShareCapture } from "./ShareCaptureHost";
import { ShareComposition } from "./ShareComposition";
import {
  initialShareSheetPosition,
  shareSheetPositionAfterOpenChange,
} from "./shareSheetLifecycle";

type ShareSheetProps = {
  entry: Entry | null;
  initialPage: number;
  open: boolean;
  onClose: () => void;
};

type BusyAction = "copy" | "download" | "instagram" | "facebook" | "others" | null;

type ShareableArtefact = {
  artefact: PaperArtefact | PrintArtefact;
  sourceIndex: number;
};

const ACTION_COUNT = 5;
const TOAST_WIDTH = 128;
const TOAST_EDGE_INSET = 8;
const TOAST_ANCHORS = [
  "copy",
  "download",
  "instagram",
  "facebook",
  "others",
] as const satisfies readonly ShareActionToastAnchor[];

function isShareableArtefact(a: Artefact): a is PaperArtefact | PrintArtefact {
  return !isUnknownArtefact(a);
}

function shareableArtefacts(entry: Entry): ShareableArtefact[] {
  // Entry.artefacts is a per-type array union; normalize to Artefact[] for the guard.
  return (entry.artefacts as Artefact[]).flatMap((artefact, sourceIndex) =>
    isShareableArtefact(artefact) ? [{ artefact, sourceIndex }] : [],
  );
}

function sharePageForSourceIndex(artefacts: ShareableArtefact[], sourceIndex: number): number {
  const exactPage = artefacts.findIndex((item) => item.sourceIndex === sourceIndex);
  if (exactPage >= 0) {
    return exactPage;
  }

  // If the requested source artefact is unknown, prefer the next shareable
  // sibling; otherwise fall back to the final known artefact.
  const nextPage = artefacts.findIndex((item) => item.sourceIndex > sourceIndex);
  return nextPage >= 0 ? nextPage : Math.max(artefacts.length - 1, 0);
}

function actionErrorMessage(action: Exclude<BusyAction, null>, error: unknown): string {
  if (error instanceof ShareDestinationError) {
    if (error.code === "META_APP_ID_MISSING") {
      return "Sharing isn’t configured";
    }
    if (error.code === "PHOTO_PERMISSION_DENIED") {
      return "Photos permission needed";
    }
    if (error.code === "SHARE_FILE_UNAVAILABLE") {
      return "Share image is unavailable";
    }
    if (error.code === "SHARE_IMAGE_INVALID") {
      return "Share image couldn’t be read";
    }
  }

  const fallback: Record<Exclude<BusyAction, null>, string> = {
    copy: "Couldn’t copy image",
    download: "Couldn’t save image",
    instagram: "Couldn’t share to Instagram",
    facebook: "Couldn’t share to Facebook",
    others: "Couldn’t open sharing",
  };
  return fallback[action];
}

export function ShareSheet({ entry, initialPage, open, onClose }: ShareSheetProps) {
  const insets = useSafeAreaInsets();
  const { width: screenWidth, height: screenHeight } = useWindowDimensions();
  const { captureShareImage } = useShareCapture();

  // Keep the last entry while the sheet animates closed.
  const [cachedEntry, setCachedEntry] = useState<Entry | null>(entry);
  if (entry !== null && entry !== cachedEntry) {
    setCachedEntry(entry);
  }
  const activeEntry = entry ?? cachedEntry;

  const artefacts = useMemo(
    () => (activeEntry ? shareableArtefacts(activeEntry) : []),
    [activeEntry],
  );
  const requestedSharePage =
    artefacts.length > 0 ? sharePageForSourceIndex(artefacts, initialPage) : 0;
  const pageWidth = Math.min(screenWidth * 0.72, 320);
  const pageGap = 16;
  const snap = pageWidth + pageGap;
  const previewHeight = pageWidth * (SHARE_EXPORT_HEIGHT / SHARE_EXPORT_WIDTH);
  const sidePad = (screenWidth - pageWidth) / 2;
  const snapOffsets = useMemo(() => artefacts.map((_, index) => index * snap), [artefacts, snap]);

  const [sheetIndex, setSheetIndex] = useState<number>(
    () => initialShareSheetPosition(open, requestedSharePage, artefacts.length).sheetIndex,
  );
  const [page, setPage] = useState(
    () => initialShareSheetPosition(open, requestedSharePage, artefacts.length).page,
  );
  const [background, setBackground] = useState<ShareBackgroundId>("light");
  const [busy, setBusy] = useState<BusyAction>(null);
  const [toast, setToast] = useState(createShareActionToastState);
  const [prevOpen, setPrevOpen] = useState(open);
  // The native `content` detent under-measures this tree after the horizontal
  // carousel (runtime: 614pt sheet for 806pt React content). Feed the measured
  // React height back as a numeric detent so every child participates.
  const [contentHeight, setContentHeight] = useState(0);
  // React state paints the spinner, while this ref is the synchronous lock that
  // prevents a second tap from entering before that render commits.
  const busyRef = useRef(false);

  const scrollRef = useRef<ScrollView>(null);

  // Sync open → sheet index / picker state during render (no effect cascade).
  const positionChange = shareSheetPositionAfterOpenChange(
    prevOpen,
    open,
    requestedSharePage,
    artefacts.length,
  );
  if (positionChange) {
    setPrevOpen(open);
    if (positionChange.page !== undefined) {
      setPage(positionChange.page);
      setBackground("light");
      setToast(resetShareActionToast);
    }
    setSheetIndex(positionChange.sheetIndex);
  }

  // Cached sheet content may not emit another onLayout when reopened. Position
  // it from the requested source artefact after the open commit, but never from
  // user-driven `page` updates — doing that competes with native snap momentum.
  useLayoutEffect(() => {
    if (open && artefacts.length > 0) {
      scrollRef.current?.scrollTo({ x: requestedSharePage * snap, animated: false });
    }
  }, [artefacts.length, open, requestedSharePage, snap]);

  const onIndexChange = useCallback(
    (index: number) => {
      setSheetIndex(index);
      if (index === 0) {
        onClose();
      }
    },
    [onClose],
  );

  const onScrollEnd = useCallback(
    (e: NativeSyntheticEvent<NativeScrollEvent>, projectedX?: number) => {
      const x = projectedX ?? e.nativeEvent.contentOffset.x;
      const next = Math.round(x / snap);
      setPage(Math.min(Math.max(next, 0), Math.max(artefacts.length - 1, 0)));
    },
    [artefacts.length, snap],
  );

  const selected = artefacts[page]?.artefact ?? null;
  const clearToast = useCallback(
    (cycleId: number) => setToast((current) => clearShareActionToast(current, cycleId)),
    [],
  );

  const runAction = useCallback(
    (action: Exclude<BusyAction, null>, fn: () => Promise<void>, successToast?: string) => {
      if (!selected || busyRef.current) {
        return;
      }
      busyRef.current = true;
      // Yield a frame so the busy spinner can paint before heavy capture work.
      setBusy(action);
      void new Promise<void>((resolve) => {
        requestAnimationFrame(() => {
          requestAnimationFrame(() => resolve());
        });
      })
        .then(() => fn())
        .then(() => {
          if (successToast) {
            setToast((current) => showShareActionToast(current, action, successToast));
          }
        })
        .catch((error: unknown) => {
          setToast((current) =>
            showShareActionToast(current, action, actionErrorMessage(action, error)),
          );
        })
        .finally(() => {
          busyRef.current = false;
          setBusy(null);
        });
    },
    [selected],
  );

  const onCopy = () => {
    if (!selected) return;
    runAction(
      "copy",
      async () => {
        const uri = await captureShareImage({
          artefact: selected,
          variant: "canvas",
          background,
        });
        await copyImageToClipboard(uri);
      },
      "Copied",
    );
  };

  const onDownload = () => {
    if (!selected) return;
    runAction(
      "download",
      async () => {
        await requestPhotoLibraryWritePermission();
        const uri = await captureShareImage({
          artefact: selected,
          variant: "canvas",
          background,
        });
        await saveImageToPhotos(uri);
      },
      "Saved",
    );
  };

  const onInstagram = () => {
    if (!selected) return;
    runAction("instagram", async () => {
      if (!getMetaAppId()) {
        throw new ShareDestinationError("META_APP_ID_MISSING");
      }
      const available = await isInstagramAvailable();
      if (!available) {
        setToast((current) =>
          showShareActionToast(current, "instagram", "Instagram isn’t installed"),
        );
        return;
      }
      const uri = await captureShareImage({
        artefact: selected,
        variant: "sticker",
        background,
      });
      await shareToInstagramStories(uri, SHARE_BG[background]);
    });
  };

  const onFacebook = () => {
    if (!selected) return;
    runAction("facebook", async () => {
      if (!getMetaAppId()) {
        throw new ShareDestinationError("META_APP_ID_MISSING");
      }
      const available = await isFacebookAvailable();
      if (!available) {
        setToast((current) =>
          showShareActionToast(current, "facebook", "Facebook isn’t installed"),
        );
        return;
      }
      const uri = await captureShareImage({
        artefact: selected,
        variant: "sticker",
        background,
      });
      await shareToFacebookStories(uri, SHARE_BG[background]);
    });
  };

  const onOthers = () => {
    if (!selected) return;
    runAction("others", async () => {
      const uri = await captureShareImage({
        artefact: selected,
        variant: "canvas",
        background,
      });
      await shareWithSystemSheet(uri);
    });
  };

  const toastAnchorIndex = toast.anchor == null ? -1 : TOAST_ANCHORS.indexOf(toast.anchor);
  const toastLeft =
    toastAnchorIndex < 0
      ? TOAST_EDGE_INSET
      : Math.min(
          Math.max(
            ((toastAnchorIndex + 0.5) / ACTION_COUNT) * screenWidth - TOAST_WIDTH / 2,
            TOAST_EDGE_INSET,
          ),
          screenWidth - TOAST_WIDTH - TOAST_EDGE_INSET,
        );
  const openDetent = contentHeight > 0 ? contentHeight : screenHeight;

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

        <ScrollView
          ref={scrollRef}
          horizontal
          showsHorizontalScrollIndicator={false}
          style={{ backgroundColor: "transparent" }}
          decelerationRate="fast"
          snapToOffsets={snapOffsets}
          snapToAlignment="start"
          disableIntervalMomentum
          contentContainerStyle={{
            paddingHorizontal: sidePad,
            backgroundColor: "transparent",
          }}
          onMomentumScrollEnd={onScrollEnd}
          onScrollEndDrag={(event) => {
            onScrollEnd(event, event.nativeEvent.targetContentOffset?.x);
          }}
        >
          {artefacts.map(({ artefact, sourceIndex }, index) => (
            <View
              key={sourceIndex}
              style={{
                width: pageWidth,
                height: previewHeight,
                marginRight: index < artefacts.length - 1 ? pageGap : 0,
                borderRadius: 16,
                borderCurve: "continuous",
                overflow: "hidden",
              }}
            >
              <ShareComposition
                artefact={artefact}
                variant="canvas"
                background={background}
                width={pageWidth}
                height={previewHeight}
              />
            </View>
          ))}
        </ScrollView>

        {artefacts.length > 1 ? (
          <View style={styles.dots}>
            {artefacts.map(({ sourceIndex }, index) => (
              <View
                key={sourceIndex}
                style={[styles.dot, index === page ? styles.dotActive : styles.dotIdle]}
              />
            ))}
          </View>
        ) : (
          <View style={{ height: 16 }} />
        )}

        <View style={styles.swatches}>
          {(Object.keys(SHARE_BG) as ShareBackgroundId[]).map((id) => {
            const selectedSwatch = background === id;
            return (
              <Pressable
                key={id}
                onPress={() => setBackground(id)}
                accessibilityRole="button"
                accessibilityLabel={`${id} background`}
                style={[
                  styles.swatch,
                  { backgroundColor: SHARE_BG[id] },
                  selectedSwatch && styles.swatchSelected,
                  id === "dark" && selectedSwatch && styles.swatchSelectedOnDark,
                ]}
              />
            );
          })}
        </View>

        <View style={styles.actionsBlock}>
          {/* This lane always occupies the same height. The content detent
              therefore has nothing to remeasure when a toast appears, and
              clamping keeps Copy/Others inside the sheet's measured bounds. */}
          <View pointerEvents="none" style={styles.toastLane}>
            <View style={[styles.toastAnchor, { left: toastLeft }]}>
              <ShareActionToast
                cycleId={toast.message ? toast.cycleId : null}
                message={toast.message}
                onDone={clearToast}
              />
            </View>
          </View>

          <View style={styles.actions}>
            <ActionButton
              label="Copy"
              busy={busy === "copy"}
              disabled={busy !== null}
              onPress={onCopy}
            >
              <ActionCircle>
                <CopyGlyph />
              </ActionCircle>
            </ActionButton>

            <ActionButton
              label="Download"
              busy={busy === "download"}
              disabled={busy !== null}
              onPress={onDownload}
            >
              <ActionCircle>
                <DownloadGlyph />
              </ActionCircle>
            </ActionButton>

            <ActionButton
              label="Instagram"
              busy={busy === "instagram"}
              disabled={busy !== null}
              onPress={onInstagram}
            >
              <ActionCircle variant="instagram">
                <InstagramGlyph />
              </ActionCircle>
            </ActionButton>

            <ActionButton
              label="Facebook"
              busy={busy === "facebook"}
              disabled={busy !== null}
              onPress={onFacebook}
            >
              <ActionCircle variant="facebook">
                <FacebookGlyph />
              </ActionCircle>
            </ActionButton>

            <ActionButton
              label="Others"
              busy={busy === "others"}
              disabled={busy !== null}
              onPress={onOthers}
            >
              <ActionCircle>
                <OthersGlyph />
              </ActionCircle>
            </ActionButton>
          </View>
        </View>
      </View>
    </ModalBottomSheet>
  );
}

function ActionButton({
  label,
  children,
  onPress,
  busy,
  disabled,
}: {
  label: string;
  children: React.ReactNode;
  onPress: () => void;
  busy: boolean;
  disabled: boolean;
}) {
  return (
    <View style={styles.actionItem}>
      <Pressable
        onPress={onPress}
        disabled={disabled}
        accessibilityRole="button"
        accessibilityLabel={label}
        style={{ opacity: disabled ? 0.5 : 1 }}
      >
        {busy ? (
          <View style={styles.busyCircle}>
            <ActivityIndicator color="#57534E" />
          </View>
        ) : (
          children
        )}
      </Pressable>
      <Text style={styles.actionLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  surface: {
    backgroundColor: "#FFFFFF",
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
  },
  content: {
    paddingTop: 8,
    gap: 16,
    backgroundColor: "transparent",
  },
  handle: {
    alignSelf: "center",
    width: 36,
    height: 5,
    borderRadius: 3,
    backgroundColor: "#D6D3D1",
    marginBottom: 8,
  },
  dots: {
    flexDirection: "row",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 4,
  },
  dot: {
    width: 7,
    height: 7,
    borderRadius: 4,
  },
  dotActive: {
    backgroundColor: "#57534E",
  },
  dotIdle: {
    backgroundColor: "#D6D3D1",
  },
  swatches: {
    flexDirection: "row",
    justifyContent: "center",
    gap: 16,
    paddingVertical: 4,
  },
  swatch: {
    width: 44,
    height: 44,
    borderRadius: 22,
    borderWidth: 2,
    borderColor: "transparent",
  },
  swatchSelected: {
    borderColor: "#1C1917",
    borderWidth: 3,
  },
  swatchSelectedOnDark: {
    borderColor: "#FAFAF9",
  },
  actionsBlock: {
    position: "relative",
  },
  toastLane: {
    height: 32,
    position: "relative",
    zIndex: 2,
  },
  toastAnchor: {
    position: "absolute",
    width: TOAST_WIDTH,
    alignItems: "center",
  },
  actions: {
    flexDirection: "row",
    justifyContent: "space-evenly",
    paddingHorizontal: 8,
    paddingTop: 8,
  },
  actionItem: {
    alignItems: "center",
    gap: 8,
    minWidth: 64,
  },
  actionLabel: {
    fontFamily: "Geist-Regular",
    fontSize: 12,
    color: "#57534E",
  },
  busyCircle: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: "#E7E5E4",
    alignItems: "center",
    justifyContent: "center",
  },
});
