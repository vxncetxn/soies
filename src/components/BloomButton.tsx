/**
 * BloomButton — a pressable trigger that "blooms" into an expanded panel.
 *
 * The component has two halves that live in different places in the tree:
 *   1. An **inline trigger** (the button itself), which stays in normal layout
 *      and is NEVER teleported. It's the thing the user taps, and the thing we
 *      measure to learn where the bloom should originate from.
 *   2. A **panel**, rendered into a root portal host so it floats above the
 *      whole app. It's always mounted (preloaded) and only animates on
 *      open/close — see the `isFirstRun` guard.
 *
 * Why split trigger and panel (the "two-world problem"):
 *   An earlier version teleported the *same* button node into the portal on
 *   open and back on close. That node had a transform positioning it in the
 *   portal's absolute coordinate system; when it reparented back into the
 *   header's flex layout it carried that transform with it, so it "jumped" by
 *   roughly (header position + origin) at the end of close. Keeping the
 *   trigger inline and morphing a *separate* panel from the trigger's measured
 *   frame sidesteps the coordinate-system clash entirely — there's no
 *   reparenting of the measured node, so nothing to drift.
 *
 * The morph itself (measure-and-morph):
 *   On open we measure the trigger's on-screen frame (`pageX/pageY/width/
 *   height`) from a UI-thread worklet and stash it in `origin`. The panel BOX
 *   animates its real `width`/`height` (origin → target) plus `translate`
 *   (origin → target) — we animate the box's size, NOT a scale, so the uniform
 *   `borderRadius` stays circular on every frame (an anisotropic scale would
 *   squash the radius into an ellipse and the panel would read as squarish).
 *   The CONTENT inside is pinned to the target size (lays out once → no
 *   per-frame relayout) and SCALES (origin/target → 1, `transformOrigin:
 *   'top left'`) so it grows alongside the panel while fading in.
 *
 * Blurred background (both variants):
 *   The inline trigger and the bloomed panel share the same `expo-blur`
 *   `BlurView` (light tint, `BLOOM_BLUR_INTENSITY`) over a `bg-controls-
 *   background` fallback, wired through `BlurTargetViewProvider` in _layout
 *   (same plumbing as FocusOverlay). The open/close morph reads as one frosted
 *   shape growing — no hard swap from solid to translucent. Requires that
 *   provider; both current callers (HomeHeader, CreateEntryButton) render
 *   inside it.
 *
 * Variants:
 *   - `menu` (default): width = screenWidth − 40, horizontally centered, height
 *     is *intrinsic* (measured from `panelNode` via onLayout). Vertically it's
 *     edge-anchored toward the open space — bottom-anchored if the trigger is
 *     in the lower half of the screen (so it blooms upward), top-anchored
 *     otherwise (blooms downward). Frosted blur + `border-controls-border` on
 *     both trigger and panel (the border lines up at morph start). Height
 *     springs when content changes while open (see `contentKey`). An invisible
 *     backdrop closes the panel on tap.
 *   - `fullscreen`: morphs to fill the whole screen (the calendar use case).
 *     Same frosted blur as menu, but the panel is intentionally borderless so
 *     a 1px frame doesn't ring the whole screen — the trigger's border fades
 *     out with the trigger as the borderless panel takes over. No backdrop.
 *
 * Controlled API:
 *   The parent owns `open`. The trigger tap calls `onOpenChange(true)`; the
 *   backdrop tap and hardware-back call `onOpenChange(false)`. `onClose` fires
 *   on the JS thread *after* the close spring finishes — HomeHeader uses that
 *   to sync the calendar's highlight date only once the morph is done, so the
 *   calendar never re-renders mid-animation.
 *
 * Content switching (menu only, opt-in):
 *   Pass `contentKey` when the parent swaps `panelNode` at a different height.
 *   On key change while open, the old content cross-fades out in an absolutely-
 *   positioned outgoing layer while the new content fades in; `panelHeight`
 *   springs to the new measured height. Omit `contentKey` for static content
 *   (no cross-fade). The outgoing layer re-renders the previous node as a fresh
 *   React instance (no preserved local state) — fine for menu lists/buttons.
 *
 * Animation feel (matches bloom-reference.gif):
 *   The trigger cross-fades out over the first slice of progress, the panel
 *   background snaps in so the morphing rounded shape is visible from frame
 *   one, and the panel content fades in + GROWS alongside the panel (it scales
 *   from the trigger's proportions to full size in sync with the box's
 *   width/height morph). The spring is tuned for a snappy "folder-open" feel
 *   with a touch of overshoot.
 */
import { BlurView } from "expo-blur";
import {
  forwardRef,
  PropsWithChildren,
  ReactNode,
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import {
  BackHandler,
  LayoutChangeEvent,
  Pressable,
  PressableProps,
  StyleSheet,
  useWindowDimensions,
  View,
} from "react-native";
import Animated, {
  interpolate,
  measure,
  type SharedValue,
  useAnimatedReaction,
  useAnimatedRef,
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
import { useBlurTargetRef } from "./BlurTargetViewContext";

/** Cross-fade duration when menu content identity changes via `contentKey`. */
const BLOOM_CONTENT_CROSSFADE_MS = 200;

type BloomButtonProps = Omit<PressableProps, "onPress"> & {
  /** Content rendered inside the inline trigger button (e.g. the date pill). */
  children: ReactNode;
  /** Content rendered inside the bloomed panel (e.g. CalendarOverlay / menu items). */
  panelNode: ReactNode;
  variant?: "fullscreen" | "menu";
  /** Controlled open state — the parent decides when the panel is open. */
  open: boolean;
  /** Trigger tap → true; backdrop tap / hardware-back → false. */
  onOpenChange: (open: boolean) => void;
  /** Fires on the JS thread after the close spring finishes (post-morph sync). */
  onClose?: () => void;
  /** Optional external progress shared value; defaults to an internal one. */
  progress?: SharedValue<number>;
  /** Extra NativeWind classes appended to the inline trigger wrapper. */
  className?: string;
  /**
   * Opt-in identity key for menu content switching. When it changes while open,
   * the previous `panelNode` cross-fades out and height springs to the new
   * content. Omit for static content (backward compatible).
   */
  contentKey?: string | number;
};

const BloomButton = forwardRef<View, PropsWithChildren<BloomButtonProps>>(
  (
    {
      children,
      panelNode,
      variant = "menu",
      open,
      onOpenChange,
      onClose,
      progress: progressProp,
      className,
      contentKey,
      ...props
    },
    ref,
  ) => {
    // Animated ref to the inline trigger. Used to `measure` its frame on open.
    // `collapsable={false}` (set on the JSX below) is required for measure to
    // return a real layout on Android.
    const triggerRef = useAnimatedRef<Animated.View>();

    // Guards the open/close effect so the very first render (mount) doesn't
    // animate — the panel mounts preloaded and should only animate on actual
    // open/close transitions.
    const isFirstRun = useRef(true);

    // Skips the first contentKey run so mount doesn't stage an outgoing layer.
    const isFirstContentKeyRun = useRef(true);

    const blurTargetRef = useBlurTargetRef();

    const { width: screenWidth, height: screenHeight } = useWindowDimensions();
    const insets = useSafeAreaInsets();

    // Screen dimensions mirrored into shared values so animated styles on the
    // UI thread never read stale JS props after a rotation/resize.
    const screenW = useSharedValue(screenWidth);
    const screenH = useSharedValue(screenHeight);

    // Safe-area insets mirrored into shared values for the menu's vertical
    // anchoring math (the panel must not sit under notches/home indicators).
    const insetTop = useSharedValue(insets.top);
    const insetBottom = useSharedValue(insets.bottom);

    // 0 = closed, 1 = open. The single source of truth that drives every
    // animated style below. Owned internally unless the caller passes one.
    const internalProgress = useSharedValue(0);
    const progress = progressProp ?? internalProgress;

    // The trigger's measured screen frame, captured on open. The panel morphs
    // FROM this origin TO its target frame.
    const origin = useSharedValue({ x: 0, y: 0, width: 1, height: 1 });

    // Intrinsic content height for the menu variant (measured via onLayout).
    // Ground-truth height — drives contentStyle scaleY and the height spring
    // reaction. Defaults to a non-zero placeholder so the morph has a sane
    // target before the first layout fires.
    const contentHeight = useSharedValue(200);

    // Animated visual height for the menu panel box. Springs to match
    // contentHeight when fully open; snaps instantly during the open morph so
    // the bloom doesn't fight a second spring.
    const panelHeight = useSharedValue(200);

    // Cross-fade shared values for opt-in content switching (menu only).
    const outgoingFade = useSharedValue(0);
    const currentFade = useSharedValue(1);

    const prevPanelNodeRef = useRef(panelNode);
    const prevContentKeyRef = useRef(contentKey);
    const [outgoing, setOutgoing] = useState<{ node: ReactNode; height: number } | null>(null);

    // Target content width. Fullscreen = the whole screen; menu = screenWidth −
    // 40 (horizontally centered). Used both to pin the fullscreen content to
    // its target size and to measure the menu's intrinsic height at the right
    // width — the menu's *height* is intrinsic (onLayout), not fixed here.
    const panelLayoutWidth = variant === "fullscreen" ? screenWidth : screenWidth - 40;

    // Keep the UI-thread shared values in sync with JS props after dimension
    // changes (rotation, split view, etc.). Without this the morph would target
    // stale screen dimensions.
    useEffect(() => {
      screenW.value = screenWidth;
      screenH.value = screenHeight;
    }, [screenHeight, screenWidth, screenH, screenW]);

    useEffect(() => {
      insetTop.value = insets.top;
      insetBottom.value = insets.bottom;
    }, [insetBottom, insetTop, insets.bottom, insets.top]);

    /**
     * Clears the outgoing cross-fade layer after the fade-out timing finishes.
     * Called from a UI-thread worklet via `scheduleOnRN`.
     */
    const clearOutgoing = useCallback(() => {
      setOutgoing(null);
    }, []);

    /**
     * Menu only: spring `panelHeight` to match measured `contentHeight` when
     * fully open. During the open morph (`progress < 1`) or on the reaction's
     * first fire (`prev == null`), set instantly so the bloom doesn't fight a
     * second spring.
     */
    useAnimatedReaction(
      () => contentHeight.value,
      (next, prev) => {
        if (next === prev) {
          return;
        }

        panelHeight.value =
          progress.value === 1 && prev != null ? withSpring(next, BLOOM_RESIZE_SPRING) : next;
      },
    );

    /**
     * Called on the JS thread after the close spring finishes. Forwards to the
     * optional `onClose` callback. Wrapped in useCallback for a stable identity
     * so the close worklet can call it via `scheduleOnRN`.
     */
    const finishClose = useCallback(() => {
      onClose?.();
    }, [onClose]);

    /**
     * Open: schedule a worklet on the UI thread that measures the inline
     * trigger, stores its frame in `origin`, then springs `progress` to 1.
     * Measuring on the UI thread is synchronous and flicker-free — the
     * measurement and the spring start in the same worklet, so the panel is
     * anchored to the trigger before it blooms in. If measure fails (e.g. the
     * ref isn't ready) we bail rather than morph from a 1×1 box.
     */
    const animateOpen = useCallback(() => {
      scheduleOnUI(() => {
        "worklet";
        const layout = measure(triggerRef);

        if (!layout) {
          return;
        }

        origin.value = {
          x: layout.pageX,
          y: layout.pageY,
          width: layout.width,
          height: layout.height,
        };

        progress.value = withSpring(1, BLOOM_SPRING);
      });
    }, [origin, progress, triggerRef]);

    /**
     * Close: spring `progress` back to 0, and only when the spring *finishes*
     * (not if interrupted) hop back to the JS thread to call `finishClose`.
     * Waiting for completion means the panel stays visible throughout the close
     * morph and only notifies the parent once it's done.
     */
    const animateClose = useCallback(() => {
      scheduleOnUI(() => {
        "worklet";
        progress.value = withSpring(0, BLOOM_SPRING, (finished) => {
          if (finished) {
            scheduleOnRN(finishClose);
          }
        });
      });
    }, [finishClose, progress]);

    // Trigger open/close on `open` changes, but skip the very first run (mount)
    // so preloading doesn't animate. useLayoutEffect runs before paint so the
    // animation begins in the same frame as the state change — no flicker.
    useLayoutEffect(() => {
      if (isFirstRun.current) {
        isFirstRun.current = false;
        return;
      }

      if (open) {
        animateOpen();
        return;
      }

      animateClose();
    }, [animateClose, animateOpen, open]);

    /**
     * Menu + `contentKey` only: when the key changes while open, stash the
     * previous panelNode into an outgoing layer and cross-fade to the new
     * content. Gated on `variant === "menu"` (the cross-fade layers are only
     * rendered for menu) and on `open` so a parent reset (e.g. `onClose` →
     * "main") while closed doesn't stage invisible fades or height churn.
     */
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
        height: contentHeight.value,
      });
      prevPanelNodeRef.current = panelNode;
      prevContentKeyRef.current = contentKey;

      outgoingFade.value = 1;
      currentFade.value = 0;
      outgoingFade.value = withTiming(0, { duration: BLOOM_CONTENT_CROSSFADE_MS }, (finished) => {
        if (finished) {
          scheduleOnRN(clearOutgoing);
        }
      });
      currentFade.value = withTiming(1, { duration: BLOOM_CONTENT_CROSSFADE_MS });
    }, [
      clearOutgoing,
      contentHeight,
      contentKey,
      currentFade,
      open,
      outgoingFade,
      panelNode,
      variant,
    ]);

    // Hardware-back (Android) closes the panel when open. Returning true
    // suppresses the default back behavior (navigating away). Both variants
    // benefit; for fullscreen there's no backdrop, so back is the only
    // non-programmatic way to dismiss.
    useEffect(() => {
      if (!open) {
        return;
      }

      const subscription = BackHandler.addEventListener("hardwareBackPress", () => {
        onOpenChange(false);
        return true;
      });

      return () => subscription.remove();
    }, [onOpenChange, open]);

    /**
     * Menu variant only: measure the panel content's intrinsic height at the
     * target width so the panel can be content-sized. We clamp to the safe area
     * so very tall content never overflows under notches/home indicators. The
     * measured height is written straight to the `contentHeight` shared value,
     * which drives the animated target height on the UI thread — no React state
     * is involved, so measuring the content never triggers a re-render.
     */
    const handleContentLayout = useCallback(
      (event: LayoutChangeEvent) => {
        const maxHeight = screenHeight - insets.top - insets.bottom - 2 * BLOOM_MENU_GAP;
        const nextHeight = Math.min(event.nativeEvent.layout.height, maxHeight);
        contentHeight.value = nextHeight;
      },
      [contentHeight, insets.bottom, insets.top, screenHeight],
    );

    /**
     * Inline trigger opacity: cross-fades the trigger out over the first slice
     * of progress so the button dissolves into the blooming panel rather than
     * hard-cutting. `clamp` keeps it from going negative past the slice.
     */
    const triggerStyle = useAnimatedStyle(() => ({
      opacity: interpolate(progress.value, [0, BLOOM_TRIGGER_FADE_END], [1, 0], "clamp"),
    }));

    /**
     * Panel morph. We animate the box's `width`/`height` (and `translate`) from
     * the trigger's origin frame to the target frame, and ease `borderRadius`
     * from the trigger's pill radius toward the panel's end radius.
     *
     * Why width/height instead of `scale`? A uniform `borderRadius` only stays
     * circular when it is NOT scaled anisotropically. The origin (a wide, short
     * pill) and the target (a tall panel) have very different aspect ratios, so
     * a scale morph would use `scaleX !== scaleY` — that turns the uniform
     * radius into an ELLIPTICAL corner (the short axis collapses to a few px)
     * and the panel reads as squarish instead of matching the trigger's round
     * shape. Animating the real width/height keeps the radius uniform on every
     * frame, so the panel's corners match the trigger's exactly at the start.
     *
     * Perf: only this one box resizes per frame. The content inside is pinned
     * to the *target* size (not `flex: 1`), so it lays out once and is then
     * SCALED to fill the box as it grows (see contentStyle) — the heavy
     * calendar grid never relayouts during the morph, it just scales. Opacity
     * snaps the background in so the morphing shape is visible from frame one.
     *
     * Target frames:
     *   - fullscreen: (0, 0, screenW, screenH).
     *   - menu: horizontally centered; vertically edge-anchored toward open
     *     space — if the trigger's center is in the lower half of the screen
     *     the panel sits at the bottom (blooms upward), otherwise at the top
     *     (blooms downward). Height reads `panelHeight` (springs while open).
     */
    const panelStyle = useAnimatedStyle(() => {
      const o = origin.value;

      const targetWidth = variant === "fullscreen" ? screenW.value : screenW.value - 40;
      const targetHeight = variant === "fullscreen" ? screenH.value : panelHeight.value || o.height;

      const targetX = variant === "fullscreen" ? 0 : (screenW.value - targetWidth) / 2;

      let targetY = 0;
      if (variant === "menu") {
        const triggerCenterY = o.y + o.height / 2;
        targetY =
          triggerCenterY >= screenH.value / 2
            ? screenH.value - targetHeight - insetBottom.value - BLOOM_MENU_GAP
            : insetTop.value + BLOOM_MENU_GAP;
      }

      const endRadius = variant === "fullscreen" ? 0 : BLOOM_MENU_RADIUS;

      return {
        opacity: interpolate(progress.value, [0, BLOOM_PANEL_FADE_END], [0, 1], "clamp"),
        width: interpolate(progress.value, [0, 1], [o.width, targetWidth]),
        height: interpolate(progress.value, [0, 1], [o.height, targetHeight]),
        transform: [
          { translateX: interpolate(progress.value, [0, 1], [o.x, targetX]) },
          { translateY: interpolate(progress.value, [0, 1], [o.y, targetY]) },
        ],
        borderRadius: interpolate(progress.value, [0, 1], [BLOOM_TRIGGER_RADIUS, endRadius]),
      };
    });

    /**
     * Panel content: fades in and GROWS alongside the panel. Instead of sliding
     * up, the content scales from the trigger's proportions to full size in sync
     * with the panel's width/height growth — `scaleX`/`scaleY` mirror the panel's
     * size ratio (origin/target → 1), so the content always fills the panel and
     * expands with it. `transformOrigin: 'top left'` (set on the content wrapper
     * via `styles.contentWrap`) anchors the grow to the trigger's corner, matching
     * the panel's growth direction. Opacity starts at BLOOM_CONTENT_START so the
     * content is hidden while it is most "squished" (smallest); by the time it is
     * clearly visible it is nearly full size. `clamp` keeps opacity/scale from
     * animating before their slices. ScaleY still reads ground-truth
     * `contentHeight` (not `panelHeight`) — at `progress === 1` the ratio is 1.
     */
    const contentStyle = useAnimatedStyle(() => {
      const o = origin.value;

      const targetWidth = variant === "fullscreen" ? screenW.value : screenW.value - 40;
      const targetHeight =
        variant === "fullscreen" ? screenH.value : contentHeight.value || o.height;

      return {
        opacity: interpolate(progress.value, [BLOOM_CONTENT_START, 1], [0, 1], "clamp"),
        transform: [
          { scaleX: interpolate(progress.value, [0, 1], [o.width / targetWidth, 1]) },
          { scaleY: interpolate(progress.value, [0, 1], [o.height / targetHeight, 1]) },
        ],
      };
    });

    /** Outgoing content layer opacity during menu content cross-fade. */
    const outgoingStyle = useAnimatedStyle(() => ({
      opacity: outgoingFade.value,
    }));

    /** Current content measuring wrapper opacity during menu content cross-fade. */
    const measuringFadeStyle = useAnimatedStyle(() => ({
      opacity: currentFade.value,
    }));

    // Trigger tap requests open. We never toggle `open` directly — the parent
    // owns it, so we just forward the intent.
    const handleTriggerPress = () => {
      onOpenChange(true);
    };

    // Backdrop tap (menu variant) requests close.
    const handleBackdropPress = () => {
      onOpenChange(false);
    };

    return (
      <>
        {/* Inline trigger — stays in normal layout, never teleported. This is
            the node we measure on open, so it needs `collapsable={false}` and a
            stable ref. `self-start` keeps it content-width (so a small menu
            button measures as a small button); a caller can pass `w-full` via
            className to make it full-width (the calendar does this).
            `pointerEvents` flips to none while open so taps pass through to the
            portal's backdrop/panel above. `overflow-hidden` clips the BlurView
            to the trigger's rounded corners. The border/bg are the pill surface;
            BlurView frosts the app content behind; the Pressable + children
            render on top so the icon stays crisp. */}
        <Animated.View
          ref={triggerRef}
          collapsable={false}
          style={triggerStyle}
          pointerEvents={open ? "none" : "auto"}
          className={`self-start overflow-hidden rounded-4xl border border-controls-border bg-controls-background ${className ?? ""}`}
        >
          {/*<BlurView*/}
          {/*  blurTarget={blurTargetRef}*/}
          {/*  blurMethod="dimezisBlurViewSdk31Plus"*/}
          {/*  tint={BLOOM_BLUR_TINT}*/}
          {/*  intensity={BLOOM_BLUR_INTENSITY}*/}
          {/*  style={StyleSheet.absoluteFill}*/}
          {/*/>*/}
          <Pressable ref={ref} {...props} onPress={handleTriggerPress}>
            {children}
          </Pressable>
        </Animated.View>

        {/* Preloaded panel in the root `bloom` portal host. Always mounted so
            opening never mounts it fresh; `pointerEvents` follows `open` so a
            closed panel can't intercept touches. The `bloom` host is a sibling
            rendered above the app content in _layout, so the panel floats above
            the header (z-50) without any z-index juggling here. */}
        <Portal hostName="bloom">
          <View style={styles.root} pointerEvents={open ? "auto" : "none"}>
            {/* Invisible dismiss layer for the menu variant. Transparent
                (no background), full-screen, sits behind the panel so tapping
                anywhere outside the panel closes it. Fullscreen has no
                backdrop — it covers the whole screen, so there's no "outside". */}
            {variant === "menu" ? (
              <Pressable
                style={styles.backdrop}
                onPress={handleBackdropPress}
                accessibilityRole="button"
                accessibilityLabel="Close menu"
              />
            ) : null}

            {/* The morphing panel. `panelStyle` animates its width/height +
                translate from the trigger's origin to the target frame, keeping
                the borderRadius uniform (no anisotropic scale → no squarish
                corners). Shared BlurView + `bg-controls-background` fallback for
                both variants; menu adds `border-controls-border`, fullscreen
                stays borderless so no 1px ring around the whole screen. */}
            <Animated.View
              style={[styles.panel, panelStyle]}
              pointerEvents="auto"
              className={
                variant === "menu"
                  ? "border border-controls-border bg-controls-background"
                  : "bg-controls-background"
              }
            >
              <BlurView
                blurTarget={blurTargetRef}
                blurMethod="dimezisBlurViewSdk31Plus"
                tint={BLOOM_BLUR_TINT}
                intensity={BLOOM_BLUR_INTENSITY}
                style={StyleSheet.absoluteFill}
              />
              {/* Content wrapper. Pinned to the *target* size (not `flex: 1`) so
                  the content lays out once and never relayouts during the morph.
                  `contentStyle` scales it from the trigger's proportions to full
                  size in sync with the panel's growth (`transformOrigin: 'top
                  left'` via `styles.contentWrap`, so it grows from the trigger's
                  corner) and fades it in once visible — it grows alongside the
                  panel instead of sliding up. */}
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
                    {/* Measuring wrapper: pin the content to the target width so
                        its onLayout reports the true intrinsic height at that
                        width. Absolutely-positioned outgoing layer stays out of
                        flow so this height stays clean. `measuringFadeStyle`
                        drives the cross-fade when `contentKey` changes. */}
                    <Animated.View
                      onLayout={handleContentLayout}
                      style={[{ width: panelLayoutWidth }, measuringFadeStyle]}
                    >
                      {panelNode}
                    </Animated.View>
                  </>
                ) : (
                  panelNode
                )}
              </Animated.View>
            </Animated.View>
          </View>
        </Portal>
      </>
    );
  },
);

const styles = StyleSheet.create({
  // Root fills the portal host so the backdrop can cover the whole screen and
  // the panel can be positioned absolutely within it.
  root: {
    ...StyleSheet.absoluteFill,
  },
  // Backdrop: full-screen, transparent (no background color) — invisible but
  // tappable, so it intercepts outside-of-panel taps to close the menu.
  backdrop: {
    ...StyleSheet.absoluteFill,
  },
  // The panel is positioned at (0,0) and moved/resized by `panelStyle`
  // (animated width/height + translate). `overflow: hidden` clips any
  // sub-pixel spillover while the content scales to fill the box — no
  // `transformOrigin` here because we resize the box (not scale it) to keep
  // the `borderRadius` uniform on every frame. BlurView is absoluteFill inside
  // and resizes with the panel on every morph frame.
  panel: {
    position: "absolute",
    top: 0,
    left: 0,
    overflow: "hidden",
  },
  // Content wrapper grow anchor. `transformOrigin: 'top left'` makes the
  // content scale up from the trigger's corner (matching the panel's growth
  // direction) instead of from its center, so it grows alongside the panel.
  contentWrap: {
    transformOrigin: "top left",
  },
});

export default BloomButton;
