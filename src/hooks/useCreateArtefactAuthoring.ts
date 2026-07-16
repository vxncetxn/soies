import { useCallback, useEffect, useRef, useState, type RefObject } from "react";
import {
  runOnJS,
  useAnimatedReaction,
  useSharedValue,
  withSpring,
  type SharedValue,
} from "react-native-reanimated";

import type { ArtefactTextInputHandle } from "../components/ArtefactTextInput";
import type { CreateArtefactPagerHandle } from "../components/CreateArtefactPager";

import { SPRING_CONFIG } from "../constants/animation";
import { MAX_ARTEFACTS_PER_ENTRY } from "../constants/artefact";

const CHROME_CROSSFADE_END = 0.5;
// UIKit focus/blur events can arrive after React Native's JS command returns.
// Four hundred milliseconds spans the pager jump and native responder handoff
// without leaving blur suppression active during normal typing interactions.
const RESPONDER_TRANSFER_GUARD_MS = 400;

export type CreateExpandMode = "default" | "type" | "scribble";

/**
 * Shared create-authoring controller: Type/Scribble expand, pager focus, capped append.
 *
 * `tryAppend` uses a synchronous list-length ref so two rapid adds at the cap
 * cannot both pass a render-time check and produce a sixth artefact.
 */
export function useCreateArtefactAuthoring(options?: {
  onActiveIndexChange?: (index: number) => void;
}) {
  const onActiveIndexChange = options?.onActiveIndexChange;

  const [activeIndex, setActiveIndex] = useState(0);
  const [enteringIndex, setEnteringIndex] = useState<number | null>(null);
  const [expandMode, setExpandMode] = useState<CreateExpandMode>("default");

  const expandProgress = useSharedValue(0);
  const pagerRef = useRef<CreateArtefactPagerHandle>(null);
  const keepExpandedOnBlurRef = useRef(false);
  const suppressArtefactFocusRef = useRef(false);
  const scribbleActiveRef = useRef(false);
  // Dismissal crosses three schedulers: React, UIKit responder callbacks, and
  // the Create overlay's UI-thread spring. Once closing begins, late focus or
  // blur events must not mutate the root-owned Create subtree while Fabric is
  // already preparing to remove its native views.
  const dismissingRef = useRef(false);
  const inputRefs = useRef<(ArtefactTextInputHandle | null)[]>([]);
  /** Mirrors artefact list length for sync cap checks before setState flushes. */
  const artefactCountRef = useRef(1);
  const activeIndexRef = useRef(0);
  const keepClearTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const syncExpandModeFromProgress = useCallback((expanded: boolean) => {
    if (dismissingRef.current) {
      return;
    }
    if (scribbleActiveRef.current) {
      setExpandMode(expanded ? "scribble" : "default");
      return;
    }
    setExpandMode(expanded ? "type" : "default");
  }, []);

  useEffect(() => {
    // StrictMode rehearses setup → cleanup → setup in development. Cleanup
    // freezes late native responder events, so setup must re-arm this session;
    // otherwise the rehearsal permanently discards every Type transition.
    dismissingRef.current = false;

    return () => {
      dismissingRef.current = true;
      if (keepClearTimerRef.current) {
        clearTimeout(keepClearTimerRef.current);
        keepClearTimerRef.current = null;
      }
    };
  }, []);

  useAnimatedReaction(
    () => expandProgress.get(),
    (v, prev) => {
      if (prev === null) {
        return;
      }
      if (
        (prev <= CHROME_CROSSFADE_END && v > CHROME_CROSSFADE_END) ||
        (prev > CHROME_CROSSFADE_END && v <= CHROME_CROSSFADE_END)
      ) {
        runOnJS(syncExpandModeFromProgress)(v > CHROME_CROSSFADE_END);
      }
    },
  );

  const handleActiveIndexChange = useCallback(
    (index: number) => {
      activeIndexRef.current = index;
      setActiveIndex(index);
      onActiveIndexChange?.(index);
    },
    [onActiveIndexChange],
  );

  const focusArtefact = useCallback((index: number) => {
    // Hold expand across the outgoing blur; clear via timeout (or Back).
    // A single rAF was too short — blur arrived after keep was cleared.
    keepExpandedOnBlurRef.current = true;
    // Intentional Prev/Next must not be treated as a post-drag accidental focus.
    suppressArtefactFocusRef.current = false;
    if (keepClearTimerRef.current) {
      clearTimeout(keepClearTimerRef.current);
    }
    pagerRef.current?.jumpToIndex(index, true);
    activeIndexRef.current = index;
    setActiveIndex(index);
    inputRefs.current[index]?.focus();
    keepClearTimerRef.current = setTimeout(() => {
      keepExpandedOnBlurRef.current = false;
      keepClearTimerRef.current = null;
    }, RESPONDER_TRANSFER_GUARD_MS);
  }, []);

  const handlePrev = useCallback(() => {
    if (scribbleActiveRef.current) {
      return;
    }
    const current = activeIndexRef.current;
    if (current <= 0) {
      return;
    }
    focusArtefact(current - 1);
  }, [focusArtefact]);

  const handleNext = useCallback(
    (artefactCount: number) => {
      if (scribbleActiveRef.current) {
        return;
      }
      const current = activeIndexRef.current;
      if (current >= artefactCount - 1) {
        return;
      }
      focusArtefact(current + 1);
    },
    [focusArtefact],
  );

  const enterScribble = useCallback(() => {
    // Native Paper blur is asynchronous. Hold the expanded sheet across that
    // responder transition exactly as Prev/Next does; otherwise a late blur
    // could spring Scribble back to Default after we have already opened it.
    scribbleActiveRef.current = true;
    keepExpandedOnBlurRef.current = true;
    if (keepClearTimerRef.current) {
      clearTimeout(keepClearTimerRef.current);
    }
    inputRefs.current[activeIndexRef.current]?.blur();
    setExpandMode("scribble");
    expandProgress.set(withSpring(1, SPRING_CONFIG));
    keepClearTimerRef.current = setTimeout(() => {
      keepExpandedOnBlurRef.current = false;
      keepClearTimerRef.current = null;
    }, RESPONDER_TRANSFER_GUARD_MS);
  }, [expandProgress]);

  const exitScribble = useCallback(() => {
    scribbleActiveRef.current = false;
    setExpandMode("default");
    expandProgress.set(withSpring(0, SPRING_CONFIG));
  }, [expandProgress]);

  const handleBack = useCallback(() => {
    if (keepClearTimerRef.current) {
      clearTimeout(keepClearTimerRef.current);
      keepClearTimerRef.current = null;
    }
    keepExpandedOnBlurRef.current = false;
    if (scribbleActiveRef.current) {
      exitScribble();
      return;
    }
    inputRefs.current[activeIndexRef.current]?.blur();
  }, [exitScribble]);

  /**
   * Freeze focus-derived state and resign every native text responder before
   * the parent starts the root Create overlay's close animation.
   *
   * UIKit delivers focus and blur asynchronously, so simply calling `blur()`
   * from a Cancel press can leave callbacks racing Fabric's later subtree
   * removal. The refs are switched synchronously first; the screen then gets a
   * committed Default frame before CreatePaperScreen invokes `onClose`.
   */
  const prepareForDismiss = useCallback(() => {
    if (dismissingRef.current) {
      return;
    }
    dismissingRef.current = true;
    if (keepClearTimerRef.current) {
      clearTimeout(keepClearTimerRef.current);
      keepClearTimerRef.current = null;
    }
    keepExpandedOnBlurRef.current = false;
    scribbleActiveRef.current = false;
    suppressArtefactFocusRef.current = true;
    inputRefs.current.forEach((input) => input?.blur());
    setExpandMode("default");
    expandProgress.set(0);
  }, [expandProgress]);

  /**
   * Append when under the cap. Returns the new index, or null if at max.
   * Caller supplies the setState that stores the item; this updates the sync
   * count ref first so a second tap in the same tick sees the cap.
   */
  const tryAppend = useCallback((append: () => void): number | null => {
    if (artefactCountRef.current >= MAX_ARTEFACTS_PER_ENTRY) {
      return null;
    }
    const nextIndex = artefactCountRef.current;
    artefactCountRef.current += 1;
    append();
    setEnteringIndex(nextIndex);
    requestAnimationFrame(() => {
      pagerRef.current?.jumpToIndex(nextIndex, true);
      activeIndexRef.current = nextIndex;
      setActiveIndex(nextIndex);
    });
    return nextIndex;
  }, []);

  const syncArtefactCount = useCallback((count: number) => {
    artefactCountRef.current = count;
  }, []);

  const isExpanded = expandMode !== "default";
  const scribbleActive = expandMode === "scribble";
  const typeState = expandMode === "type";

  return {
    activeIndex,
    enteringIndex,
    setEnteringIndex,
    expandMode,
    typeState,
    scribbleActive,
    isExpanded,
    expandProgress: expandProgress as SharedValue<number>,
    pagerRef: pagerRef as RefObject<CreateArtefactPagerHandle | null>,
    keepExpandedOnBlurRef,
    suppressArtefactFocusRef,
    inputRefs,
    handleActiveIndexChange,
    focusArtefact,
    handlePrev,
    handleNext,
    handleBack,
    prepareForDismiss,
    enterScribble,
    exitScribble,
    tryAppend,
    syncArtefactCount,
  };
}
