/**
 * EditablePrint — Create adapter around the canonical Print canvas.
 *
 * Image/chrome/caption geometry comes from `PrintCanvas`, the same component
 * used by Home, frames and Share. The caption itself is `PrintCaptionSurface`,
 * a Default-only configuration of the native bounded-text engine shared with
 * Paper. No hidden mirror, guessed character cap or post-paint truncation exists
 * in this component.
 *
 * The card is allocated at the device's final expanded width from mount. One
 * scale moves it from the responsive Default slot to identity in Type/Scribble,
 * preserving sharp native text and caret on phones and large iPads. A separate
 * outer translation pins the expanded card above the keyboard; separating those
 * transforms keeps its screen-space gutter independent of bloom scale.
 */
import type { ReactNode, Ref, RefObject } from "react";

import { useEffect, useRef } from "react";
import { Pressable, StyleSheet, useWindowDimensions } from "react-native";
import { EaseView } from "react-native-ease";
import { useReanimatedKeyboardAnimation } from "react-native-keyboard-controller";
import Animated, {
  interpolate,
  useAnimatedReaction,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import type { PrintCaptionSurfaceHandle } from "./PrintCaptionSurface";

import { EASE_CREATE_EXPANSION_SPRING, SPRING_CONFIG } from "../constants/animation";
import { useReducedMotionPreference } from "../hooks/useReducedMotionPreference";
import { getCollapsedArtefactLayout } from "./artefactLayout";
import { PrintCanvas } from "./Print";
import PrintCaptionSurface from "./PrintCaptionSurface";
import {
  PRINT_CANVAS_HEIGHT,
  PRINT_PLACEHOLDER,
  printCanvasScaleForDisplayWidth,
} from "./printLayout";

// The expanded card visually rests this far above the keyboard edge.
const PRINT_BOTTOM_GUTTER = 16;
// Must match CreateScreenChrome's content heights below the top safe padding.
const CREATE_HEADER_HEIGHT = 84;
const EXPANDED_HEADER_HEIGHT = 44;

/** Writes one native handle through either supported React ref representation. */
function assignRef<T>(ref: Ref<T> | undefined, value: T | null) {
  if (!ref) {
    return;
  }
  if (typeof ref === "function") {
    ref(value);
    return;
  }
  ref.current = value;
}

type EditablePrintProps = {
  /** Draft-owned image selected before this page mounted. */
  imageUri: string;
  /** Draft-owned accepted caption. */
  value: string;
  /** Mirrors only native-accepted mutations into the draft. */
  onChangeText: (text: string) => void;
  /** Discrete visual endpoint supplied by the Create authoring phase. */
  expanded: boolean;
  onRequestType: () => void;
  onRequestDefault: () => void;
  /** Shared pager receives the native responder handle for Prev/Next and dismissal. */
  textInputRef: Ref<PrintCaptionSurfaceHandle | null>;
  /** Hold Type across intentional Prev/Next responder transfer. */
  keepExpandedOnBlurRef?: RefObject<boolean>;
  /** Pager drag guard that rejects an accidental focus after a swipe. */
  suppressArtefactFocusRef?: RefObject<boolean>;
  /** Locked while entry or Scribble persistence is in flight. */
  editable?: boolean;
  /** Committed Ink fallback while the live canvas is hidden outside Scribble. */
  inkOverlayUri?: string | null;
  /** Scribble owns expanded state and disables the caption responder. */
  scribbleActive?: boolean;
  /** Per-page persistent native Ink canvas in the same expanded coordinates. */
  scribbleCanvas?: ReactNode;
  /** Image display or terminal error gate for the root Entry transition. */
  onImageReady?: () => void;
};

/** Create-only interaction shell around the output-identical canonical Print canvas. */
const EditablePrint = ({
  imageUri,
  value,
  onChangeText,
  expanded,
  onRequestType,
  onRequestDefault,
  textInputRef,
  keepExpandedOnBlurRef,
  suppressArtefactFocusRef,
  editable = true,
  inkOverlayUri = null,
  scribbleActive = false,
  scribbleCanvas = null,
  onImageReady,
}: EditablePrintProps) => {
  const reduceMotionEnabled = useReducedMotionPreference();
  const insets = useSafeAreaInsets();
  const { width: windowWidth, height: windowHeight } = useWindowDimensions();
  const { height: keyboardHeight } = useReanimatedKeyboardAnimation();
  const topPad = insets.top + 12;
  /** Owns the mounted UIKit responder; pager refs receive the same handle via assignRef. */
  const localInputRef = useRef<PrintCaptionSurfaceHandle>(null);

  const { width: baseWidth } = getCollapsedArtefactLayout(windowWidth, "print");
  const expandedWidth = windowWidth - 20;
  const presentationScale = printCanvasScaleForDisplayWidth(expandedWidth);
  const expandedHeight = PRINT_CANVAS_HEIGHT * presentationScale;
  const collapsedPresentationScale = baseWidth / expandedWidth;

  // Pin state lives on the UI thread so the card follows interactive keyboard
  // motion without round-tripping through React renders.
  const scribbleModeSV = useSharedValue(scribbleActive ? 1 : 0);
  // This private companion is used only to reconcile the interactive keyboard
  // with Ease's opaque native scale/body motion. It never leaves this adapter.
  const geometryProgress = useSharedValue(expanded ? 1 : 0);
  const pinY = useSharedValue(0);
  /** 1 while keyboard dismissal owns pinY and springs it safely back to zero. */
  const isCollapsingSV = useSharedValue(0);

  /** UI-thread worklet that preserves the last visible pin while collapse settles. */
  const beginCollapsePin = () => {
    "worklet";
    if (isCollapsingSV.get() === 1) {
      return;
    }
    isCollapsingSV.set(1);
    // Start from the last visible pin rather than recomputing after keyboard=0.
    pinY.set(withSpring(0, SPRING_CONFIG));
  };

  /** JS/native focus bridge: enter Type unless a swipe or Scribble owns the responder. */
  const handleFocus = () => {
    if (scribbleActive || suppressArtefactFocusRef?.current) {
      queueMicrotask(() => {
        localInputRef.current?.blur();
      });
      return;
    }
    isCollapsingSV.set(0);
    onRequestType();
  };

  /** JS/native blur bridge: keep intentional page transfers expanded, collapse all others. */
  const handleBlur = () => {
    if (keepExpandedOnBlurRef?.current) {
      return;
    }
    // UIKit blur can arrive after the keyboard shared value has already reset.
    isCollapsingSV.set(1);
    pinY.set(withSpring(0, SPRING_CONFIG));
    onRequestDefault();
  };

  /** Routes taps on non-caption card space to the sole native caption responder. */
  const focusCaption = () => {
    if (!editable || scribbleActive) {
      return;
    }
    localInputRef.current?.focus();
  };

  useEffect(() => {
    scribbleModeSV.set(scribbleActive ? 1 : 0);
    if (scribbleActive) {
      isCollapsingSV.set(0);
      pinY.set(0);
    }
  }, [scribbleActive, scribbleModeSV, isCollapsingSV, pinY]);

  useEffect(() => {
    geometryProgress.set(
      reduceMotionEnabled ? (expanded ? 1 : 0) : withSpring(expanded ? 1 : 0, SPRING_CONFIG),
    );
  }, [expanded, geometryProgress, reduceMotionEnabled]);

  // Detect keyboard closure on the UI thread because it can precede JS blur.
  // The live pin is derived from the one high-resolution card and its current
  // bloom scale, so Default and Type share the same bottom-edge calculation.
  useAnimatedReaction(
    () => {
      const p = geometryProgress.get();
      const keyboardOpen = Math.max(0, -keyboardHeight.get());
      const scribble = scribbleModeSV.get() === 1;
      const collapsing = isCollapsingSV.get() === 1;
      const scale = interpolate(p, [0, 1], [collapsedPresentationScale, 1]);
      const headerContent = interpolate(p, [0, 1], [CREATE_HEADER_HEIGHT, EXPANDED_HEADER_HEIGHT]);
      const contentTop = topPad + headerContent;
      const visualBottom = contentTop + expandedHeight * scale;
      const targetBottom = windowHeight - keyboardOpen - PRINT_BOTTOM_GUTTER;
      const livePin = targetBottom - visualBottom;
      return { p, keyboardOpen, scribble, collapsing, livePin };
    },
    (curr, prev) => {
      "worklet";
      if (curr.scribble) {
        pinY.set(0);
        return;
      }

      const keyboardClosing =
        prev != null && curr.p > 0.25 && prev.keyboardOpen - curr.keyboardOpen > 30;
      const progressCollapsing =
        prev != null && curr.p < prev.p - 0.01 && prev.p > 0.4 && !curr.collapsing;

      if (keyboardClosing || progressCollapsing) {
        beginCollapsePin();
        return;
      }

      if (curr.collapsing || isCollapsingSV.get() === 1) {
        if (curr.p < 0.01 && curr.keyboardOpen < 1) {
          isCollapsingSV.set(0);
          pinY.set(0);
        }
        return;
      }

      // With no keyboard, livePin points toward an unrelated idle slot. Ignore
      // it so residual spring progress cannot create an end-of-collapse dip.
      if (curr.keyboardOpen < 1) {
        pinY.set(0);
        return;
      }

      pinY.set(interpolate(curr.p, [0, 1], [0, curr.livePin], "clamp"));
    },
    [collapsedPresentationScale, expandedHeight, topPad, windowHeight],
  );

  const pinStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: scribbleModeSV.get() === 1 ? 0 : pinY.get() }],
  }));

  const scale = expanded ? 1 : collapsedPresentationScale;

  return (
    <Animated.View style={pinStyle}>
      <EaseView
        style={[styles.displayFrame, { width: expandedWidth, height: expandedHeight }]}
        transformOrigin={{ x: 0.5, y: 0 }}
        initialAnimate={{ scale }}
        animate={{ scale }}
        transition={reduceMotionEnabled ? { type: "none" } : EASE_CREATE_EXPANSION_SPRING}
      >
        {/* Blank/photo areas focus the caption; the native caption itself stays
            above this target so UIKit retains caret and selection ownership. */}
        <Pressable
          onPress={focusCaption}
          accessibilityRole="button"
          accessibilityLabel="Edit print caption"
          style={StyleSheet.absoluteFill}
        />
        <PrintCanvas
          imagePath={imageUri}
          presentationScale={presentationScale}
          inkOverlayPath={scribbleActive ? undefined : (inkOverlayUri ?? undefined)}
          onImageDisplay={onImageReady}
          onImageError={onImageReady}
          captionSurface={
            <PrintCaptionSurface
              ref={(node) => {
                localInputRef.current = node;
                assignRef(textInputRef, node);
              }}
              value={value}
              onChangeText={onChangeText}
              onFocus={handleFocus}
              onBlur={handleBlur}
              editable={editable && !scribbleActive}
              presentationScale={presentationScale}
              placeholder={PRINT_PLACEHOLDER}
            />
          }
        />
        {scribbleCanvas}
      </EaseView>
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  // Create reserves one expanded page slot. Top-centred scaling keeps the
  // collapsed Print aligned without adding an inverse transform wrapper.
  displayFrame: {
    position: "relative",
    overflow: "hidden",
  },
});

export default EditablePrint;
