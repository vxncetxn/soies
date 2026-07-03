/**
 * BloomButton — a pressable trigger that "blooms" into an expanded panel.
 *
 * The component has two halves that live in different places in the tree:
 *   1. An **inline trigger** (the button itself), which stays in normal layout
 *      and is NEVER teleported. It's the thing the user taps, and the thing we
 *      measure to learn where the bloom should originate from.
 *   2. A **panel**, rendered into the root `bloom` portal host so it floats
 *      above the whole app. It's always mounted (preloaded) and only animates
 *      on open/close — see the `isFirstRun` guard.
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
 * The morph itself (measure-and-morph, GPU-friendly):
 *   On open we measure the trigger's on-screen frame (`pageX/pageY/width/
 *   height`) from a UI-thread worklet and stash it in `origin`. The panel's
 *   layout box is sized to the *target* frame, and we animate transforms only:
 *   `translate` origin → target and `scale` (origin/target → 1), with
 *   `transformOrigin: 'top left'` so the box grows from the trigger's corner.
 *   Animating transforms (not width/height) keeps the morph on the GPU and
 *   avoids per-frame layout recalculation.
 *
 * Variants:
 *   - `menu` (default): width = screenWidth − 40, horizontally centered, height
 *     is *intrinsic* (measured from `panelNode` via onLayout). Vertically it's
 *     edge-anchored toward the open space — bottom-anchored if the trigger is
 *     in the lower half of the screen (so it blooms upward), top-anchored
 *     otherwise (blooms downward). Translucent background + an invisible
 *     backdrop that closes the panel on tap.
 *   - `fullscreen`: morphs to fill the whole screen (the calendar use case).
 *     Solid background, no backdrop.
 *
 * Controlled API (mirrors MorphOverlay):
 *   The parent owns `open`. The trigger tap calls `onOpenChange(true)`; the
 *   backdrop tap and hardware-back call `onOpenChange(false)`. `onClose` fires
 *   on the JS thread *after* the close spring finishes — HomeHeader uses that
 *   to sync the calendar's highlight date only once the morph is done, so the
 *   calendar never re-renders mid-animation.
 *
 * Animation feel (matches bloom-reference.gif):
 *   The trigger cross-fades out over the first slice of progress, the panel
 *   background fades in over the same slice, and the panel content fades in +
 *   slides upward once the container is visible. The spring is tuned for a
 *   snappy "folder-open" feel with a touch of overshoot.
 */
import { forwardRef, PropsWithChildren, ReactNode, useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
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
  useAnimatedRef,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  type SharedValue,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Portal } from "react-native-teleport";
import { scheduleOnRN, scheduleOnUI } from "react-native-worklets";

import {
  BLOOM_CONTENT_START,
  BLOOM_CONTENT_TRANSLATE,
  BLOOM_MENU_GAP,
  BLOOM_MENU_RADIUS,
  BLOOM_PANEL_FADE_END,
  BLOOM_SPRING,
  BLOOM_TRIGGER_FADE_END,
  BLOOM_TRIGGER_RADIUS,
} from "../constants/animation";

// Solid white for the fullscreen panel (e.g. the calendar fills the screen).
const FULLSCREEN_BG = "#FFFFFF";
// Translucent white for menu panels — the app shows through subtly, matching
// the "glassmorphism" feel in the reference gif.
const MENU_BG = "rgba(255, 255, 255, 0.82)";

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

    const { width: screenWidth, height: screenHeight } = useWindowDimensions();
    const insets = useSafeAreaInsets();

    // 0 = closed, 1 = open. The single source of truth that drives every
    // animated style below. Owned internally unless the caller passes one.
    const internalProgress = useSharedValue(0);
    const progress = progressProp ?? internalProgress;
    // The trigger's measured screen frame, captured on open. The panel morphs
    // FROM this origin TO its target frame.
    const origin = useSharedValue({ x: 0, y: 0, width: 1, height: 1 });
    // Screen dimensions mirrored into shared values so animated styles on the
    // UI thread never read stale JS props after a rotation/resize.
    const screenW = useSharedValue(screenWidth);
    const screenH = useSharedValue(screenHeight);
    // Intrinsic content height for the menu variant (measured via onLayout).
    // Drives the panel's animated target height. Defaults to a non-zero
    // placeholder so the morph has a sane target before the first layout.
    const contentHeight = useSharedValue(200);
    // Safe-area insets mirrored into shared values for the menu's vertical
    // anchoring math (the panel must not sit under notches/home indicators).
    const insetTop = useSharedValue(insets.top);
    const insetBottom = useSharedValue(insets.bottom);

    // JS-side height for the panel's *layout box* (menu variant). A shared
    // value alone can't drive the layout `height` prop, so we keep a state
    // twin: the shared value drives the animated target, this drives the box.
    const [measuredHeight, setMeasuredHeight] = useState(0);

    // The panel's layout box is the *target* size. For fullscreen that's the
    // screen; for menu it's the fixed width and the measured intrinsic height
    // (1px before the first onLayout, invisible because opacity is 0 closed).
    const panelLayoutWidth = variant === "fullscreen" ? screenWidth : screenWidth - 40;
    const panelLayoutHeight = variant === "fullscreen" ? screenHeight : measuredHeight || 1;

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
     * value is written to both the `measuredHeight` state (for the layout box)
     * and the `contentHeight` shared value (for the animated target height).
     */
    const handleContentLayout = useCallback(
      (event: LayoutChangeEvent) => {
        const maxHeight = screenHeight - insets.top - insets.bottom - 2 * BLOOM_MENU_GAP;
        const height = Math.min(event.nativeEvent.layout.height, maxHeight);

        setMeasuredHeight(height);
        contentHeight.value = height;
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
     * Panel morph. The layout box is the *target* size; we animate transforms
     * to grow it from the trigger's origin frame to the target frame:
     *   - translate: origin (x,y) → target (x,y)
     *   - scale: (origin.w/target.w, origin.h/target.h) → (1, 1)
     * `transformOrigin: 'top left'` (set in `styles.panel`) makes the scale
     * grow from the trigger's top-left corner, so the box appears to expand
     * out of the button. Opacity fades the background in over the first slice
     * (a transparent → solid/​translucent cross-fade), and borderRadius eases
     * from the trigger's pill radius toward the panel's end radius.
     *
     * Target frames:
     *   - fullscreen: (0, 0, screenW, screenH).
     *   - menu: horizontally centered; vertically edge-anchored toward open
     *     space — if the trigger's center is in the lower half of the screen
     *     the panel sits at the bottom (blooms upward), otherwise at the top
     *     (blooms downward). Height is the measured intrinsic content height.
     */
    const panelStyle = useAnimatedStyle(() => {
      const o = origin.value;

      const targetWidth = variant === "fullscreen" ? screenW.value : screenW.value - 40;
      const targetHeight =
        variant === "fullscreen" ? screenH.value : contentHeight.value || o.height;

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
        transform: [
          { translateX: interpolate(progress.value, [0, 1], [o.x, targetX]) },
          { translateY: interpolate(progress.value, [0, 1], [o.y, targetY]) },
          {
            scaleX: interpolate(progress.value, [0, 1], [o.width / targetWidth, 1]),
          },
          {
            scaleY: interpolate(progress.value, [0, 1], [o.height / targetHeight, 1]),
          },
        ],
        borderRadius: interpolate(progress.value, [0, 1], [BLOOM_TRIGGER_RADIUS, endRadius]),
      };
    });

    /**
     * Panel content: fades in and slides upward once the container is visible
     * (starting at BLOOM_CONTENT_START). This is the "content rises into the
     * newly opened space" motion from the reference gif. `clamp` prevents the
     * content from starting translated/​invisible before its slice.
     */
    const contentStyle = useAnimatedStyle(() => ({
      opacity: interpolate(progress.value, [BLOOM_CONTENT_START, 1], [0, 1], "clamp"),
      transform: [
        {
          translateY: interpolate(
            progress.value,
            [BLOOM_CONTENT_START, 1],
            [BLOOM_CONTENT_TRANSLATE, 0],
            "clamp",
          ),
        },
      ],
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
            portal's backdrop/panel above. The border/bg here are the pill
            surface; the Pressable inside stretches to fill it (default
            alignItems stretch — do NOT add items-center, that would collapse
            the content width and break the fullscreen calendar layout). */}
        <Animated.View
          ref={triggerRef}
          collapsable={false}
          style={triggerStyle}
          pointerEvents={open ? "none" : "auto"}
          className={`self-start rounded-4xl border border-controls-border bg-controls-background ${className ?? ""}`}
        >
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

            {/* The morphing panel. Its layout box is the target size; the
                `panelStyle` transforms grow it from the trigger's origin. Static
                style (bg/border) is variant-driven: solid + no border for
                fullscreen, translucent + hairline border for menu. */}
            <Animated.View
              style={[
                styles.panel,
                {
                  width: panelLayoutWidth,
                  height: panelLayoutHeight,
                  backgroundColor: variant === "fullscreen" ? FULLSCREEN_BG : MENU_BG,
                  borderWidth: variant === "menu" ? StyleSheet.hairlineWidth : 0,
                  borderColor: variant === "menu" ? "rgba(0,0,0,0.08)" : undefined,
                },
                panelStyle,
              ]}
              pointerEvents="auto"
            >
              {/* Content wrapper. `flex: 1` for fullscreen so CalendarOverlay
                  fills the panel; menu content is content-sized (the measuring
                  View below handles its own width/height). `contentStyle` fades
                  + slides the content in once the container is visible. */}
              <Animated.View
                style={variant === "fullscreen" ? [styles.content, contentStyle] : contentStyle}
              >
                {variant === "menu" ? (
                  // Measuring wrapper: pin the content to the target width so
                  // its onLayout reports the true intrinsic height at that
                  // width. The panel's `overflow: hidden` clips it to the
                  // (initially 1px) box while closed, but onLayout still
                  // reports the content's natural size.
                  <View onLayout={handleContentLayout} style={{ width: panelLayoutWidth }}>
                    {panelNode}
                  </View>
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
  // The panel is positioned at (0,0) and moved/scaled by `panelStyle`.
  // `transformOrigin: 'top left'` is essential — it makes the scale grow from
  // the trigger's corner instead of the box center. `overflow: hidden` clips
  // the content to the rounded border during the morph.
  panel: {
    position: "absolute",
    top: 0,
    left: 0,
    overflow: "hidden",
    transformOrigin: "top left",
  },
  // Fullscreen content fills the panel so CalendarOverlay can take all space.
  content: {
    flex: 1,
  },
});

export default BloomButton;
