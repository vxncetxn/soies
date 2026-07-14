/**
 * Stack — one entry's "deck of cards" and its expand/collapse interaction.
 *
 * This is the core interaction of the home screen. An entry has several
 * artefacts (pages of a paper, or photos of a print). In the **collapsed**
 * state they're shown as a fanned deck (rendered by `CollapsedDeck`); a tap
 * **expands** the entry into a fullscreen horizontal pager you swipe through,
 * and tapping the backdrop or close button **collapses** it back.
 *
 * Architecture (the non-obvious bit):
 *   Collapsed and expanded are **two separate render branches**, not one
 *   teleported node. The collapsed `CollapsedDeck` unmounts when expanded and
 *   a brand-new pager tree mounts inside a root-level `Portal` (`overlay`).
 *   Continuity comes from a single `progress` shared value (0 = collapsed,
 *   1 = expanded) that both branches' `ArtefactWrapper`s read, so the newly
 *   mounted expanded tree picks up the same spring and the morph looks smooth.
 *
 * There's also a third interaction: a **long-press** opens `FocusOverlay` — a
 * blurred backdrop with an actions menu (Edit/Share/Delete...) — which clones
 * the deck and animates from its measured frame. That lives in `FocusOverlay`.
 */
import { useLayoutEffect, useRef, useState } from "react";
import { Pressable, ScrollView, View, useWindowDimensions } from "react-native";
import Animated, {
  interpolate,
  useAnimatedRef,
  useAnimatedScrollHandler,
  useAnimatedStyle,
  useDerivedValue,
  useSharedValue,
  withSpring,
} from "react-native-reanimated";
import { Portal } from "react-native-teleport";
import { withUniwind } from "uniwind";

import type { Entry } from "../data/entries";

import { SPRING_CONFIG } from "../constants/animation";
import { LAYOUT } from "../constants/layout";
import { useGalleryAdd } from "../gallery/GalleryAddContext";
import { useShare } from "../share/ShareContext";
import CollapsedDeck, { useWrappedArtefacts } from "./CollapsedDeck";
import { useExpandContext } from "./ExpandContext";
import FocusOverlay, { type FocusMenuItem } from "./FocusOverlay";
import { Icon } from "./Icon";
import LongPressable from "./LongPressable";
import { ArtefactPreview, ScrollIndicator } from "./ScrollIndicator";

// `Portal` from react-native-teleport doesn't accept className natively, so we
// wrap it with withUniwind to enable Tailwind classes on the portal's content.
const StyledPortal = withUniwind(Portal);

type StackProps = {
  entry: Entry;
};

const Stack = ({ entry }: StackProps) => {
  // `chromeProgress` is a screen-level shared value (via ExpandContext) that
  // drives header/chrome fade-out while *any* entry is expanded. We bump it
  // to 1 on expand and back to 0 on collapse.
  const { chromeProgress } = useExpandContext();
  const { openShare } = useShare();
  const { openGalleryAdd } = useGalleryAdd();
  const { width: SCREEN_WIDTH } = useWindowDimensions();

  // Layout math (see docs/01 for the full diagram):
  //   EXPANDED_WIDTH = one artefact's visible width when expanded (screen - 20px gutter)
  //   PAGE_WIDTH     = the snap interval; wider than EXPANDED_WIDTH by a "peek"
  //                    gap so a sliver of the next artefact hints there's more.
  const EXPANDED_WIDTH = SCREEN_WIDTH - 20;
  const PAGE_WIDTH = EXPANDED_WIDTH + LAYOUT.EXPANDED_STACK_GAP;

  // React state (each toggle triggers a re-render that swaps the branches).
  const [isExpanded, setIsExpanded] = useState(false);
  const [focusOpen, setFocusOpen] = useState(false);
  // Which artefact page is currently active. Persisted across expand/collapse
  // cycles so re-expanding lands you on the same page you left on.
  const [activePage, setActivePage] = useState(0);
  // Tracks which entry `activePage` / `scrollOffset` currently reflect so we
  // can reset them during render when the DayPager reuses this Stack across
  // dates (see adjust-state block below).
  const [prevEntry, setPrevEntry] = useState(entry);
  // Share / Add-to-Gallery are deferred until FocusOverlay reports its close
  // spring has settled. Store the exact session requested by the tap so a
  // list/date update during the animation cannot switch the artefact underneath.
  const pendingShareRef = useRef<{ entry: Entry; page: number } | null>(null);
  const pendingGalleryAddRef = useRef<{ entry: Entry; page: number } | null>(null);
  type PendingFocusAction = "share" | "galleryAdd" | null;
  const pendingFocusActionRef = useRef<PendingFocusAction>(null);

  // Ref to the collapsed deck's outer view. Used by FocusOverlay to measure the
  // deck's on-screen frame and animate the long-press overlay from it.
  const triggerRef = useAnimatedRef<Animated.View>();
  // Ref to the expanded horizontal ScrollView, for imperative scrollTo on jump.
  const scrollRef = useAnimatedRef<ScrollView>();
  // Raw horizontal scroll offset of the expanded pager (UI thread).
  const scrollOffset = useSharedValue(0);
  // 0 = collapsed deck, 1 = expanded pager. The single animation clock shared
  // by both render branches' ArtefactWrappers.
  const progress = useSharedValue(0);

  // Reset the persisted artefact page when the entry changes. index.tsx updates
  // the DayPager in place on date navigation (no remount), so this Stack
  // instance is reused across entries; without this, `activePage` from a
  // previous entry could be out of range for the new one and land the expanded
  // pager beyond the last artefact. `entry` is a stable reference per date
  // (served from the entry cache), so this only fires on an actual entry change
  // — not on every expand/collapse within the same entry.
  //
  // `scrollOffset` must be reset too: it's a shared value that retains its last
  // value across re-renders (unlike `useState`, it isn't recreated on remount).
  // Before the in-place-update change, `key={effectiveDate}` on DayPager forced
  // a remount, which recreated `scrollOffset` at 0. Now the Stack is reused, so
  // a leaked `scrollOffset = 2*PAGE_WIDTH` (from collapsing on artefact 2) would
  // persist into the new date's collapsed deck — `activeIndex = round(scrollOffset/PAGE_WIDTH)`
  // would be 2, showing artefact 2 on top of the new date's stack. Resetting it
  // here keeps the collapsed deck on artefact 0 for the new entry.
  //
  // React state adjusts during render (RC-safe). The SharedValue reset runs in
  // useLayoutEffect — writing `.set()` during render trips Reanimated's
  // "Writing to value during component render" warning under StrictMode.
  if (prevEntry !== entry) {
    setPrevEntry(entry);
    setActivePage(0);
  }

  useLayoutEffect(() => {
    scrollOffset.set(0);
  }, [entry, scrollOffset]);

  // Worklet that copies the horizontal scroll offset into `scrollOffset`. Runs
  // on the UI thread so the artefacts and indicator track scrolling with no
  // JS round-trip per frame.
  const onScroll = useAnimatedScrollHandler((event) => {
    scrollOffset.set(event.contentOffset.x);
  });

  // Fractional current page of the expanded pager (0.0 = first artefact, 1.5 =
  // halfway between the 2nd and 3rd). Drives the artefacts' horizontal
  // positioning and the scroll indicator.
  const currentPage = useDerivedValue(() => {
    return scrollOffset.get() / PAGE_WIDTH;
  });

  // The index of the artefact currently "on top". In the expanded pager this is
  // the page you're nearest; in the collapsed deck it's the card on top of the
  // stack. `Math.round` of the fractional current page gives the nearest page.
  const activeIndex = useDerivedValue(() => {
    return Math.round(currentPage.get());
  });

  // Build the wrapped artefacts for the EXPANDED pager. (CollapsedDeck builds
  // its own internally for the collapsed state.) Both use the same shared
  // values, so the same `progress`/`currentPage`/`activeIndex` drive both.
  const wrappedArtefacts = useWrappedArtefacts({
    entry,
    progress,
    currentPage,
    activeIndex,
  });

  // The close button fades/slides in partway through the expand animation
  // (starts at progress 0.2) so it doesn't appear instantly with the deck.
  const closeBtnStyle = useAnimatedStyle(() => ({
    opacity: interpolate(progress.get(), [0.2, 1], [0, 1]),
    transform: [{ translateY: interpolate(progress.get(), [0.2, 1], [40, 0]) }],
  }));

  /**
   * Capture the page the user is currently on, so collapsing and re-expanding
   * returns to the same page. Reads the live `scrollOffset` and rounds it to
   * the nearest page index, clamped to the artefact range. Called from
   * `collapse` *before* unmounting the pager (after unmount, scrollOffset is
   * stale/zeroed).
   */
  const persistPage = () => {
    const page = Math.max(
      0,
      Math.min(entry.artefacts.length - 1, Math.round(scrollOffset.get() / PAGE_WIDTH)),
    );

    setActivePage(page);
  };

  /**
   * Expand the entry: swap to the expanded render branch and spring `progress`
   * (and the screen-level `chromeProgress`) to 1. The new pager tree mounts and
   * its ArtefactWrappers immediately read the spring, so the deck appears to
   * bloom into the pager.
   */
  const expand = () => {
    setIsExpanded(true);

    progress.set(withSpring(1, SPRING_CONFIG));
    chromeProgress.set(withSpring(1, SPRING_CONFIG));
  };

  /**
   * Collapse the entry: first remember the current page (`persistPage`), then
   * swap back to the collapsed branch and spring `progress`/`chromeProgress` to
   * 0. The collapsed deck remounts and its ArtefactWrappers animate back to the
   * stacked positions using the same `progress`.
   */
  const collapse = () => {
    persistPage();

    setIsExpanded(false);

    progress.set(withSpring(0, SPRING_CONFIG));
    chromeProgress.set(withSpring(0, SPRING_CONFIG));
  };

  // Long-press opens the focus/actions overlay (separate from expand/collapse).
  const openFocus = () => {
    setFocusOpen(true);
  };

  const closeFocus = () => {
    setFocusOpen(false);
  };

  // Begin closing Focus. Presentation happens from `finishFocusClose`, not a
  // guessed frame delay, so the blur/morph never overlaps the sheet scrim.
  const openShareFromFocus = () => {
    pendingFocusActionRef.current = "share";
    pendingShareRef.current = { entry, page: activePage };
    setFocusOpen(false);
  };

  const openGalleryAddFromFocus = () => {
    pendingFocusActionRef.current = "galleryAdd";
    pendingGalleryAddRef.current = { entry, page: activePage };
    setFocusOpen(false);
  };

  const finishFocusClose = () => {
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

    if (action === "galleryAdd") {
      const pending = pendingGalleryAddRef.current;
      pendingGalleryAddRef.current = null;
      if (pending) {
        openGalleryAdd(pending.entry, pending.page);
      }
    }
  };

  const focusMenuItems: FocusMenuItem[] = [
    { label: "Edit", icon: "pencil", onPress: () => {} },
    { label: "Add to Gallery", icon: "photo", onPress: openGalleryAddFromFocus },
    { label: "Share", icon: "share", onPress: openShareFromFocus },
    { label: "Delete", icon: "trash", onPress: () => {} },
  ];

  // Frozen clone shared values for Focus subject (do not share live pager values).
  const cloneProgress = useSharedValue(0);
  const cloneCurrentPage = useSharedValue(0);
  const cloneActiveIndex = useSharedValue(0);

  useLayoutEffect(() => {
    cloneCurrentPage.set(activePage);
    cloneActiveIndex.set(activePage);
  }, [activePage, cloneActiveIndex, cloneCurrentPage]);

  /**
   * Restore the saved page when the expanded pager lays out. Because the pager
   * is portaled and mounts fresh each expand, its scroll starts at 0; this
   * jumps it back to `activePage` (non-animated) and syncs `scrollOffset` so
   * the indicator and artefacts are immediately correct. Runs on `onLayout`
   * because the ref isn't usable until the ScrollView has mounted.
   */
  const restoreScroll = () => {
    scrollRef.current?.scrollTo({ x: activePage * PAGE_WIDTH, y: 0, animated: false });
    scrollOffset.set(activePage * PAGE_WIDTH);
  };

  /**
   * Jump to a specific artefact page (called by the expanded ScrollIndicator).
   * Imperatively scrolls (non-animated) and syncs `scrollOffset` + `activePage`
   * immediately so downstream animations don't lag by a frame.
   */
  const jumpToArtefact = (index: number) => {
    scrollRef.current?.scrollTo({ x: index * PAGE_WIDTH, y: 0, animated: false });
    scrollOffset.set(index * PAGE_WIDTH);
    setActivePage(index);
  };

  return (
    <>
      {/* ---- Collapsed branch ---- */}
      {!isExpanded && (
        <View className="relative">
          {/* Tap expands; long-press opens the focus/actions overlay. */}
          <LongPressable onPress={expand} onLongPress={openFocus}>
            <CollapsedDeck
              triggerRef={triggerRef}
              entry={entry}
              progress={progress}
              currentPage={currentPage}
              activeIndex={activeIndex}
            />
          </LongPressable>
          {/* A small "ellipsis" button floating above the deck as an
              alternative way to open the actions overlay (besides long-press).
              Positioned above-right of the deck. */}
          <Pressable
            onPress={openFocus}
            accessibilityRole="button"
            accessibilityLabel="Entry options"
            className="absolute -top-12 -right-2 z-[110] rounded-full p-2"
          >
            <Icon name="ellipsis-horizontal" size={20} color="#79716B" />
          </Pressable>
        </View>
      )}

      {/* The focus/actions overlay. Always mounted so it can preload; it
          animates based on `open`. It measures `triggerRef` (the collapsed
          deck) when opening. */}
      <FocusOverlay
        triggerRef={triggerRef}
        open={focusOpen}
        subject={
          <CollapsedDeck
            entry={entry}
            progress={cloneProgress}
            currentPage={cloneCurrentPage}
            activeIndex={cloneActiveIndex}
          />
        }
        menuItems={focusMenuItems}
        onRequestClose={closeFocus}
        onCloseComplete={finishFocusClose}
        accessibilityDismissLabel="Dismiss entry options"
      />

      {/* ---- Expanded branch ---- */}
      {isExpanded && (
        // The entire expanded UI is teleported to the root `overlay` portal
        // host (mounted in _layout.tsx), so it floats above everything else.
        <StyledPortal hostName="overlay" className="items-center justify-center">
          <View className="absolute inset-0 items-center justify-center">
            {/* Invisible backdrop: tap to collapse. Sits behind the card frame. */}
            <Pressable className="absolute inset-0" onPress={collapse} />
            {/* The card frame. Same aspect-ratio + max-height as the collapsed
                deck (see deckClassName), so the expanded artefacts scale into a
                frame that matches the deck's proportions.
                `pointerEvents="box-none"` is critical: it lets the frame pass
                touches through to the ScrollView + artefacts beneath instead of
                capturing them. The artefacts themselves are pointerEvents none
                (set in ArtefactWrapper), so all gestures go to the ScrollView. */}
            <View
              className={`${entry.type === "paper" ? "aspect-a4" : "aspect-print"} relative max-h-[calc((100vw-80px)/210*297)] w-[calc(100vw-80px)]`}
              pointerEvents="box-none"
            >
              {/* The horizontal pager. `snapToInterval` makes it snap one
                  PAGE_WIDTH at a time; `decelerationRate="fast"` makes flings
                  stop quickly. Crucially, its *only child* is an empty spacer
                  View that defines the total scrollable width — the visible
                  artefacts are NOT children of the ScrollView. They're siblings
                  (`wrappedArtefacts` below) positioned by transforms that read
                  the same `currentPage`. This decouples gestures/snapping from
                  the rendered content so the pager stays cheap to scroll. */}
              <Animated.ScrollView
                ref={scrollRef}
                horizontal
                snapToInterval={PAGE_WIDTH}
                decelerationRate="fast"
                showsHorizontalScrollIndicator={false}
                scrollEventThrottle={16}
                onScroll={onScroll}
                onLayout={restoreScroll}
              >
                {/* Spacer giving the pager its scrollable width:
                    (n-1) full page widths + one final EXPANDED_WIDTH so the
                    last page stops aligned to the left margin instead of
                    overshooting. */}
                <View
                  style={{ width: (entry.artefacts.length - 1) * PAGE_WIDTH + EXPANDED_WIDTH }}
                />
              </Animated.ScrollView>

              {/* The visible artefacts, laid out on top of the pager and
                  positioned by their ArtefactWrapper transforms. */}
              {wrappedArtefacts}
            </View>

            {/* Bottom-centred horizontal scroll indicator for paging through
                artefacts. `pointerEvents="box-none"` so the gaps between
                indicators don't block the pager gestures. z-200 above cards. */}
            <View
              style={{ zIndex: 200 }}
              className="absolute bottom-24 left-1/2 -translate-x-1/2"
              pointerEvents="box-none"
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

            {/* The close button. Fades/slides in via closeBtnStyle (appears
                partway through expand). z-210 above the indicator. */}
            <View
              style={{ zIndex: 210 }}
              className="absolute bottom-10 left-1/2 -translate-x-1/2"
              pointerEvents="box-none"
            >
              <Animated.View style={closeBtnStyle}>
                <Pressable
                  onPress={collapse}
                  accessibilityRole="button"
                  accessibilityLabel="Close entry"
                  className="rounded-full border border-controls-border bg-controls-background p-3"
                >
                  <Icon name="x-mark" size={22} color="#79716B" />
                </Pressable>
              </Animated.View>
            </View>
          </View>
        </StyledPortal>
      )}
    </>
  );
};

export default Stack;
