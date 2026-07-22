/**
 * BloomBar — a multi-icon pill bar where one slot triggers a bloom from the
 * whole bar's measured frame (not just that icon).
 */
import { ReactNode } from "react";
import { AccessibilityRole, Pressable } from "react-native";
import Animated, { useAnimatedRef, useSharedValue } from "react-native-reanimated";
import { StyleSheet } from "react-native-unistyles";

import BloomPanel, { useBloomOriginFade } from "./BloomPanel";

export type BloomBarSlot = {
  node: ReactNode;
  onPress?: () => void;
  /** When true, tapping opens the bloom panel (in addition to onPress). */
  opensPanel?: boolean;
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
  portalHostName?: string;
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
  portalHostName = "bloom",
}: BloomBarProps) => {
  const barRef = useAnimatedRef<Animated.View>();
  const progress = useSharedValue(0);
  const originFadeStyle = useBloomOriginFade(progress);

  return (
    <>
      <Animated.View
        ref={barRef}
        collapsable={false}
        style={[styles.bar, originFadeStyle]}
        pointerEvents={open ? "none" : "auto"}
      >
        {slots.map((slot, index) => (
          <Pressable
            key={index}
            onPress={() => {
              const opens = index === bloomTriggerIndex || slot.opensPanel;
              slot.onPress?.();
              if (opens) {
                onOpenChange(true);
              }
            }}
            accessibilityRole={slot.accessibilityRole ?? "button"}
            accessibilityLabel={slot.accessibilityLabel}
            style={styles.slot}
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
      />
    </>
  );
};

export default BloomBar;

const styles = StyleSheet.create((theme) => ({
  bar: {
    alignItems: "center",
    alignSelf: "flex-start",
    backgroundColor: theme.colors.surface.control,
    borderColor: theme.colors.border.control,
    borderCurve: "continuous",
    borderRadius: 32,
    borderWidth: 1,
    flexDirection: "row",
    gap: 12,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  slot: {
    padding: 4,
  },
}));
