/**
 * BloomPanel — the measure-and-morph bloom engine shared by `BloomButton` (a
 * single trigger pill) and `BloomBar` (a multi-icon bar that blooms from its
 * whole measured frame).
 *
 * Callers own the **origin node** (the inline trigger/bar, which stays in
 * normal layout and is never teleported — see `BloomButton` for why) and pass
 * its `originRef` plus a `progress` shared value (so the caller can fade the
 * origin in sync via `useBloomOriginFade`). This component renders the panel
 * into a root portal host (`hostName`, defaults to "bloom") so it floats above
 * the whole app. The panel is always mounted (preloaded) and only animates on
 * open/close — see the `previousOpenRef` transition guard.
 *
 * The morph itself (measure-and-morph):
 *   On open we measure the origin's on-screen frame (`pageX/pageY/width/
 *   height`) from a UI-thread worklet and stash it in `origin`. The panel BOX
 *   animates its real `width`/`height` (origin → target) plus `translate`
 *   (origin → target) — we animate the box's size, NOT a scale, so the uniform
 *   `borderRadius` stays circular on every frame (an anisotropic scale would
 *   squash the radius into an ellipse and the panel would read as squarish).
 *   The CONTENT inside is pinned to the target size (lays out once → no
 *   per-frame relayout) and SCALES (origin/target → 1, `transformOrigin:
 *   'top left'`) so it grows alongside the panel while fading in.
 *
 * Blurred background:
 *   The bloomed panel has an `expo-blur` `BlurView` (light tint,
 *   `BLOOM_BLUR_INTENSITY`) over a `bg-controls-background` fallback, wired
 *   through `BlurTargetViewProvider` in _layout (same plumbing as
 *   FocusOverlay). Requires that provider; both current callers render inside
 *   it. The menu panel's BlurView mounts lazily on the first open (gated on
 *   `hasOpened`, after `origin` is measured) so it never initializes at the
 *   1×1 default rest frame — with the menu's 1px border the absoluteFill blur
 *   would be a zero/negative frame that expo-blur can't recover from on cold
 *   load. The fullscreen panel has no border and is not gated.
 *
 * Variants:
 *   - `menu` (default): width = screenWidth − 40, horizontally centered, height
 *     is *intrinsic* (measured from `panelNode` via onLayout). Vertically it's
 *     edge-anchored toward the open space — bottom-anchored if the origin is
 *     in the lower half of the screen (so it blooms upward), top-anchored
 *     otherwise (blooms downward). The panel has frosted blur +
 *     `border-controls-border`. Height springs when content changes while open
 *     (see `contentKey`). An invisible backdrop closes the panel on tap.
 *   - `fullscreen`: morphs to fill the whole screen (the calendar use case).
 *     Same frosted blur as menu, but the panel is intentionally borderless so
 *     a 1px frame doesn't ring the whole screen. No backdrop.
 *
 * Controlled API:
 *   The parent owns `open`. The origin tap (handled by the caller) calls
 *   `onOpenChange(true)`; the backdrop tap and hardware-back call
 *   `onOpenChange(false)`. `onClose` fires on the JS thread *after* the close
 *   spring finishes — HomeHeader uses that to sync the calendar's highlight
 *   date only once the morph is done, so the calendar never re-renders
 *   mid-animation. Completion crosses UI→RN via a primitive sequence counter
 *   (never via a function-valued `scheduleOnRN` argument): the spring
 *   increments a SharedValue and dispatches that number into React state; an
 *   RN effect then invokes the latest `onClose` from a ref. React Compiler
 *   callback caching does not replace Worklets' remote-function / serialization
 *   contract — only stable React dispatchers plus serializable primitives may
 *   cross that boundary.
 *
 * Content switching (menu only, opt-in):
 *   Pass `contentKey` when the parent swaps `panelNode` at a different height.
 *   On key change while open, the old content cross-fades out in an absolutely-
 *   positioned outgoing layer while the new content fades in; `panelHeight`
 *   springs to the new measured height. Omit `contentKey` for static content
 *   (no cross-fade). The outgoing layer re-renders the previous node as a fresh
 *   React instance (no preserved local state) — fine for menu lists/buttons.
 *   Clearing the outgoing layer uses `scheduleOnRN(setOutgoing, null)` — a
 *   stable dispatcher plus a primitive — never a helper that takes the setter
 *   as a function-valued argument.
 *
 * Animation feel (matches bloom-reference.gif):
 *   The origin cross-fades out over the first slice of progress, the panel
 *   background snaps in so the morphing rounded shape is visible from frame
 *   one, and the panel content fades in + GROWS alongside the panel (it scales
 *   from the origin's proportions to full size in sync with the box's
 *   width/height morph). The spring is tuned for a snappy "folder-open" feel
 *   with a touch of overshoot.
 */
import { BlurView } from "expo-blur";
import { ReactNode, useEffect, useLayoutEffect, useRef, useState } from "react";
import { LayoutChangeEvent, Pressable, StyleSheet, useWindowDimensions, View } from "react-native";
import Animated, {
  type AnimatedRef,
  interpolate,
  measure,
  type SharedValue,
  useAnimatedReaction,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Portal } from "react-native-teleport";
import { scheduleOnRN, scheduleOnUI } from "react-native-worklets";

import {
  BLOOM_BLUR_INTENSITY,
  BLOOM_BLUR_TINT,
  BLOOM_CONTENT_START,
  BLOOM_MENU_GAP,
  BLOOM_MENU_RADIUS,
  BLOOM_PANEL_FADE_END,
  BLOOM_RESIZE_SPRING,
  BLOOM_SPRING,
  BLOOM_TRIGGER_FADE_END,
  BLOOM_TRIGGER_RADIUS,
} from "../constants/animation";
import { useHardwareBackDismiss } from "../hooks/useHardwareBackDismiss";
import { useAndroidBlurTargetProps } from "./BlurTargetViewContext";

// Fast enough that menu navigation feels immediate, but long enough for the
// outgoing and incoming content to read as one intentional height transition.
const BLOOM_CONTENT_CROSSFADE_MS = 200;

type PanelOrigin = { x: number; y: number; width: number; height: number };
type OutgoingContent = { node: ReactNode; height: number };

const animateOpen = ({
  originRef,
  origin,
  progress,
}: {
  originRef: AnimatedRef<Animated.View>;
  origin: SharedValue<PanelOrigin>;
  progress: SharedValue<number>;
}) => {
  scheduleOnUI(() => {
    "worklet";
    const layout = measure(originRef);

    if (!layout) {
      return;
    }

    origin.set({
      x: layout.pageX,
      y: layout.pageY,
      width: layout.width,
      height: layout.height,
    });

    progress.set(withSpring(1, BLOOM_SPRING));
  });
};

/**
 * Springs progress to 0. On finished, increments `closeSequence` and dispatches
 * that primitive into React via a stable setter — never a render-local callback
 * or function-valued argument (Worklets serializes args; function args crash).
 */
const animateClose = ({
  progress,
  closeSequence,
  setCloseSequence,
}: {
  progress: SharedValue<number>;
  closeSequence: SharedValue<number>;
  setCloseSequence: (value: number) => void;
}) => {
  scheduleOnUI(() => {
    "worklet";
    progress.set(
      withSpring(0, BLOOM_SPRING, (finished) => {
        if (finished) {
          const next = closeSequence.get() + 1;
          closeSequence.set(next);
          scheduleOnRN(setCloseSequence, next);
        }
      }),
    );
  });
};

export function useBloomOriginFade(progress: SharedValue<number>) {
  return useAnimatedStyle(() => ({
    opacity: interpolate(progress.get(), [0, BLOOM_TRIGGER_FADE_END], [1, 0], "clamp"),
  }));
}

type BloomPanelProps = {
  originRef: AnimatedRef<Animated.View>;
  progress: SharedValue<number>;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onClose?: () => void;
  panelNode: ReactNode;
  variant?: "fullscreen" | "menu";
  contentKey?: string | number;
  hostName?: string;
  /**
   * Correction for when the ORIGIN trigger lives inside teleported content that
   * is itself nested under padding (e.g. BloomBar inside the create overlay,
   * which sits under the root SafeAreaView). For such triggers `measure()`
   * reports declaration-site coordinates (shifted down by the ancestor padding),
   * but the panel paints in window space — so without correction the panel
   * blooms that far below the trigger. The caller passes the ancestor offset
   * (typically the safe-area insets) and we subtract it from the measured origin
   * so the panel lands exactly on the trigger. Defaults to {0,0} (inline
   * triggers like BloomButton, whose measurement already matches paint space).
   */
  originOffset?: { x: number; y: number };
};

const BloomPanel = ({
  originRef,
  progress,
  open,
  onOpenChange,
  onClose,
  panelNode,
  variant = "menu",
  contentKey,
  hostName = "bloom",
  originOffset,
}: BloomPanelProps) => {
  // Transition guard: only animate when `open` actually flips. Initialized from
  // `open` so mount / StrictMode setup-cleanup replay does not schedule a
  // spurious close spring (unlike a one-shot `isFirstRun` flag that can be
  // confused by effect remount).
  const previousOpenRef = useRef(open);
  const isFirstContentKeyRun = useRef(true);

  // Latest onClose, updated in an effect (never during render) so the close
  // completion path always invokes the current callback without putting a
  // function across the Worklets boundary.
  const onCloseRef = useRef(onClose);
  const closeSequenceSV = useSharedValue(0);
  const [closeSequence, setCloseSequence] = useState(0);

  // Android-only blurTarget — see useAndroidBlurTargetProps (avoids StrictMode
  // findNodeHandle from expo-blur on iOS).
  const androidBlurProps = useAndroidBlurTargetProps();

  const { width: screenWidth, height: screenHeight } = useWindowDimensions();
  const insets = useSafeAreaInsets();

  const screenW = useSharedValue(screenWidth);
  const screenH = useSharedValue(screenHeight);
  const insetTop = useSharedValue(insets.top);
  const insetBottom = useSharedValue(insets.bottom);

  const origin = useSharedValue({ x: 0, y: 0, width: 1, height: 1 });
  const originOffsetX = useSharedValue(originOffset?.x ?? 0);
  const originOffsetY = useSharedValue(originOffset?.y ?? 0);
  const contentHeight = useSharedValue(200);
  const panelHeight = useSharedValue(200);
  const outgoingFade = useSharedValue(0);
  const currentFade = useSharedValue(1);

  const prevPanelNodeRef = useRef(panelNode);
  const prevContentKeyRef = useRef(contentKey);
  const [outgoing, setOutgoing] = useState<OutgoingContent | null>(null);
  const [hasOpened, setHasOpened] = useState(false);

  const panelLayoutWidth = variant === "fullscreen" ? screenWidth : screenWidth - 40;

  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    if (closeSequence === 0) {
      return;
    }

    onCloseRef.current?.();
  }, [closeSequence]);

  useEffect(() => {
    screenW.set(screenWidth);
    screenH.set(screenHeight);
  }, [screenHeight, screenWidth, screenH, screenW]);

  useEffect(() => {
    insetTop.set(insets.top);
    insetBottom.set(insets.bottom);
  }, [insetBottom, insetTop, insets.bottom, insets.top]);

  useEffect(() => {
    originOffsetX.set(originOffset?.x ?? 0);
    originOffsetY.set(originOffset?.y ?? 0);
  }, [originOffset?.x, originOffset?.y, originOffsetX, originOffsetY]);

  useAnimatedReaction(
    () => contentHeight.get(),
    (next, prev) => {
      if (next === prev) {
        return;
      }

      const willSpring = progress.get() === 1 && prev != null;
      panelHeight.set(willSpring ? withSpring(next, BLOOM_RESIZE_SPRING) : next);
    },
  );

  useLayoutEffect(() => {
    if (previousOpenRef.current === open) {
      return;
    }

    previousOpenRef.current = open;

    if (open) {
      animateOpen({ originRef, origin, progress });
      return;
    }

    animateClose({ progress, closeSequence: closeSequenceSV, setCloseSequence });
  }, [closeSequenceSV, open, origin, originRef, progress, variant]);

  useLayoutEffect(() => {
    if (variant !== "menu" || contentKey === undefined) {
      prevPanelNodeRef.current = panelNode;
      return;
    }

    if (!open) {
      prevPanelNodeRef.current = panelNode;
      prevContentKeyRef.current = contentKey;
      return;
    }

    if (isFirstContentKeyRun.current) {
      isFirstContentKeyRun.current = false;
      prevPanelNodeRef.current = panelNode;
      prevContentKeyRef.current = contentKey;
      return;
    }

    if (contentKey === prevContentKeyRef.current) {
      prevPanelNodeRef.current = panelNode;
      return;
    }

    setOutgoing({
      node: prevPanelNodeRef.current,
      height: contentHeight.get(),
    });
    prevPanelNodeRef.current = panelNode;
    prevContentKeyRef.current = contentKey;

    outgoingFade.set(1);
    currentFade.set(0);
    outgoingFade.set(
      withTiming(0, { duration: BLOOM_CONTENT_CROSSFADE_MS }, (finished) => {
        if (finished) {
          // Stable React dispatcher + primitive — mirrors setCreate(null).
          scheduleOnRN(setOutgoing, null);
        }
      }),
    );
    currentFade.set(withTiming(1, { duration: BLOOM_CONTENT_CROSSFADE_MS }));
  }, [contentHeight, contentKey, currentFade, open, outgoingFade, panelNode, progress, variant]);

  // Hardware-back (Android) closes the panel when open. React Compiler handles
  // caching this handler for unchanged `onOpenChange`.
  const dismiss = () => onOpenChange(false);
  useHardwareBackDismiss(open, dismiss);

  const handleContentLayout = (event: LayoutChangeEvent) => {
    const maxHeight = screenHeight - insets.top - insets.bottom - 2 * BLOOM_MENU_GAP;
    const rawHeight = event.nativeEvent.layout.height;
    const nextHeight = Math.min(rawHeight, maxHeight);
    contentHeight.set(nextHeight);
  };

  const handlePanelLayout = (event: LayoutChangeEvent) => {
    if (variant !== "menu" || hasOpened || !open) {
      return;
    }

    const { width, height } = event.nativeEvent.layout;
    // Gate: BlurView must not mount into BloomPanel's 1×1 rest frame.
    // onLayout runs on RN after the measured panel begins expanding.
    if (width > 1 && height > 1) {
      setHasOpened(true);
    }
  };

  const panelStyle = useAnimatedStyle(() => {
    const o = origin.get();

    const targetWidth = variant === "fullscreen" ? screenW.get() : screenW.get() - 40;
    const targetHeight = variant === "fullscreen" ? screenH.get() : panelHeight.get() || o.height;

    const targetX = variant === "fullscreen" ? 0 : (screenW.get() - targetWidth) / 2;

    let targetY = 0;
    if (variant === "menu") {
      const triggerCenterY = o.y + o.height / 2;
      targetY =
        triggerCenterY >= screenH.get() / 2
          ? screenH.get() - targetHeight - insetBottom.get() - BLOOM_MENU_GAP
          : insetTop.get() + BLOOM_MENU_GAP;
    }

    const endRadius = variant === "fullscreen" ? 0 : BLOOM_MENU_RADIUS;
    const p = progress.get();

    // Correct for a teleported trigger whose measure() is declaration-site (see
    // originOffset docs). Only the ORIGIN end of the interpolation is shifted:
    // the panel must START on the real trigger. The TARGET is computed from
    // screen/inset values that are already in paint space, so it is left as-is.
    const offX = originOffsetX.get();
    const offY = originOffsetY.get();
    const startX = o.x - offX;
    const startY = o.y - offY;

    return {
      opacity: interpolate(p, [0, BLOOM_PANEL_FADE_END], [0, 1], "clamp"),
      width: interpolate(p, [0, 1], [o.width, targetWidth]),
      height: interpolate(p, [0, 1], [o.height, targetHeight]),
      transform: [
        { translateX: interpolate(p, [0, 1], [startX, targetX]) },
        { translateY: interpolate(p, [0, 1], [startY, targetY]) },
      ],
      borderRadius: interpolate(p, [0, 1], [BLOOM_TRIGGER_RADIUS, endRadius]),
    };
  });

  const contentStyle = useAnimatedStyle(() => {
    const o = origin.get();

    const targetWidth = variant === "fullscreen" ? screenW.get() : screenW.get() - 40;
    const targetHeight = variant === "fullscreen" ? screenH.get() : contentHeight.get() || o.height;

    return {
      opacity: interpolate(progress.get(), [BLOOM_CONTENT_START, 1], [0, 1], "clamp"),
      transform: [
        { scaleX: interpolate(progress.get(), [0, 1], [o.width / targetWidth, 1]) },
        { scaleY: interpolate(progress.get(), [0, 1], [o.height / targetHeight, 1]) },
      ],
    };
  });

  const outgoingStyle = useAnimatedStyle(() => ({
    opacity: outgoingFade.get(),
  }));

  const measuringFadeStyle = useAnimatedStyle(() => ({
    opacity: currentFade.get(),
  }));

  const handleBackdropPress = () => {
    onOpenChange(false);
  };

  return (
    <Portal hostName={hostName}>
      <View style={styles.root} pointerEvents={open ? "auto" : "none"}>
        {variant === "menu" ? (
          <Pressable
            style={styles.backdrop}
            onPress={handleBackdropPress}
            accessibilityRole="button"
            accessibilityLabel="Close menu"
          />
        ) : null}

        <Animated.View
          onLayout={handlePanelLayout}
          style={[styles.panel, panelStyle]}
          pointerEvents="auto"
          className={
            variant === "menu"
              ? "border border-controls-border bg-controls-background"
              : "bg-controls-background"
          }
        >
          {variant === "fullscreen" || hasOpened ? (
            <>
              <BlurView
                {...androidBlurProps}
                tint={BLOOM_BLUR_TINT}
                intensity={BLOOM_BLUR_INTENSITY}
                style={StyleSheet.absoluteFill}
              />
            </>
          ) : null}
          <Animated.View
            style={
              variant === "fullscreen"
                ? [
                    { width: panelLayoutWidth, height: screenHeight },
                    styles.contentWrap,
                    contentStyle,
                  ]
                : [styles.contentWrap, contentStyle]
            }
          >
            {variant === "menu" ? (
              <>
                {outgoing ? (
                  <Animated.View
                    pointerEvents="none"
                    style={[
                      {
                        position: "absolute",
                        top: 0,
                        left: 0,
                        width: panelLayoutWidth,
                        height: outgoing.height,
                      },
                      outgoingStyle,
                    ]}
                  >
                    {outgoing.node}
                  </Animated.View>
                ) : null}
                <Animated.View style={[{ width: panelLayoutWidth }, measuringFadeStyle]}>
                  {panelNode}
                </Animated.View>
              </>
            ) : (
              panelNode
            )}
          </Animated.View>
        </Animated.View>

        {/* Off-screen natural-height mirror (menu only). Renders `panelNode` at
            the target width, fully unconstrained and off-screen, so its
            onLayout reports the content's REAL natural height — independent of
            the animated panel box (whose height tracks panelHeight). Measuring
            the in-panel content instead created a feedback loop: the panel box
            height contaminated the content measurement, which fed back into
            panelHeight and (a) never let it grow past the origin height when it
            started at 0 → text clipped on open, and (b) ratcheted it down
            ~0.33px/frame after a content-key resize → slow collapse. The mirror
            breaks that loop. pointerEvents none + opacity 0 + off-screen so the
            duplicate Pressables never receive touches and it never paints. */}
        {variant === "menu" ? (
          <View
            pointerEvents="none"
            onLayout={handleContentLayout}
            style={[styles.mirror, { width: panelLayoutWidth }]}
          >
            {panelNode}
          </View>
        ) : null}
      </View>
    </Portal>
  );
};

const styles = StyleSheet.create({
  root: {
    ...StyleSheet.absoluteFill,
  },
  backdrop: {
    ...StyleSheet.absoluteFill,
  },
  panel: {
    position: "absolute",
    top: 0,
    left: 0,
    overflow: "hidden",
  },
  contentWrap: {
    transformOrigin: "top left",
  },
  mirror: {
    position: "absolute",
    left: -9999,
    top: 0,
    opacity: 0,
  },
});

export default BloomPanel;
