/**
 * BloomBar — a multi-icon pill bar where one slot triggers a bloom from the
 * whole bar's measured frame (not just that icon).
 */
import { ReactNode } from "react";
import { AccessibilityRole, Pressable } from "react-native";
import Animated, { useAnimatedRef, useSharedValue } from "react-native-reanimated";

import BloomPanel, { useBloomOriginFade } from "./BloomPanel";

export type BloomBarSlot = {
  node: ReactNode;
  onPress?: () => void;
  accessibilityLabel?: string;
  accessibilityRole?: AccessibilityRole;
};

type BloomBarProps = {
  slots: BloomBarSlot[];
  bloomTriggerIndex: number;
  panelNode: ReactNode;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onClose?: () => void;
  variant?: "fullscreen" | "menu";
  contentKey?: string | number;
  className?: string;
  portalHostName?: string;
  originOffset?: { x: number; y: number };
};

const BloomBar = ({
  slots,
  bloomTriggerIndex,
  panelNode,
  open,
  onOpenChange,
  onClose,
  variant = "menu",
  contentKey,
  className,
  portalHostName = "bloom",
  originOffset,
}: BloomBarProps) => {
  const barRef = useAnimatedRef<Animated.View>();
  const progress = useSharedValue(0);
  const originFadeStyle = useBloomOriginFade(progress);

  return (
    <>
      <Animated.View
        ref={barRef}
        collapsable={false}
        style={originFadeStyle}
        pointerEvents={open ? "none" : "auto"}
        className={`flex-row items-center gap-3 self-start rounded-4xl border border-controls-border bg-controls-background px-3 py-2 ${className ?? ""}`}
      >
        {slots.map((slot, index) => (
          <Pressable
            key={index}
            onPress={index === bloomTriggerIndex ? () => onOpenChange(true) : slot.onPress}
            accessibilityRole={slot.accessibilityRole ?? "button"}
            accessibilityLabel={slot.accessibilityLabel}
            className="p-1"
          >
            {slot.node}
          </Pressable>
        ))}
      </Animated.View>

      <BloomPanel
        originRef={barRef}
        progress={progress}
        open={open}
        onOpenChange={onOpenChange}
        onClose={onClose}
        panelNode={panelNode}
        variant={variant}
        contentKey={contentKey}
        hostName={portalHostName}
        originOffset={originOffset}
      />
    </>
  );
};

export default BloomBar;
