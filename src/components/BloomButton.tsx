/**
 * BloomButton — a pressable trigger that "blooms" into an expanded panel.
 *
 * A thin shell around `BloomPanel` (the measure-and-morph engine). It owns two
 * things and delegates everything else:
 *   1. The **inline trigger** (the button itself), which stays in normal layout
 *      and is NEVER teleported. It's the thing the user taps, and the thing
 *      `BloomPanel` measures (`originRef`) to learn where the bloom should
 *      originate from. Its opacity cross-fades out over the first slice of
 *      `progress` (via `useBloomOriginFade`) so it disappears as the panel
 *      takes over.
 *   2. A `BloomPanel` instance, given the trigger's ref + a `progress` shared
 *      value. The panel renders into a root portal host and does the actual
 *      morph, blur, backdrop, content cross-fade, and hardware-back handling.
 *
 * Why the trigger stays inline (the "two-world problem"): an earlier version
 * teleported the *same* button node into the portal on open and back on close.
 * That node carried a transform in the portal's absolute coordinate system; on
 * reparent back into flex layout it kept that transform and "jumped" by roughly
 * (header position + origin) at the end of close. Keeping the trigger inline
 * and morphing a *separate* panel from the trigger's measured frame sidesteps
 * the coordinate-system clash — there's no reparenting of the measured node, so
 * nothing drifts. See `BloomPanel` for the morph mechanics.
 *
 * Callers: pass `open` (controlled), `onOpenChange`, `panelNode`, and a
 * `variant` ("menu" | "fullscreen"). `onClose` fires on the JS thread after the
 * close spring finishes (post-morph sync, e.g. HomeHeader's calendar highlight).
 * Pass `contentKey` to opt into menu content cross-fading on key change.
 */
import { forwardRef, PropsWithChildren, ReactNode } from "react";
import { Pressable, PressableProps, View } from "react-native";
import Animated, {
  type SharedValue,
  useAnimatedRef,
  useSharedValue,
} from "react-native-reanimated";

import BloomPanel, { useBloomOriginFade } from "./BloomPanel";

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
    const triggerRef = useAnimatedRef<Animated.View>();
    const internalProgress = useSharedValue(0);
    const progress = progressProp ?? internalProgress;
    const triggerStyle = useBloomOriginFade(progress);

    const handleTriggerPress = () => {
      onOpenChange(true);
    };

    return (
      <>
        <Animated.View
          ref={triggerRef}
          collapsable={false}
          style={triggerStyle}
          pointerEvents={open ? "none" : "auto"}
          className={`border-controls-border bg-controls-background self-start rounded-4xl border ${className ?? ""}`}
        >
          <Pressable ref={ref} {...props} onPress={handleTriggerPress}>
            {children}
          </Pressable>
        </Animated.View>

        <BloomPanel
          originRef={triggerRef}
          progress={progress}
          open={open}
          onOpenChange={onOpenChange}
          onClose={onClose}
          panelNode={panelNode}
          variant={variant}
          contentKey={contentKey}
        />
      </>
    );
  },
);

export default BloomButton;
