import { useCallback, useRef, useState, type RefObject } from "react";
import { TextInput } from "react-native";
import {
  runOnJS,
  useAnimatedReaction,
  useSharedValue,
  type SharedValue,
} from "react-native-reanimated";

import type { CreateArtefactPagerHandle } from "../components/CreateArtefactPager";

import { MAX_ARTEFACTS_PER_ENTRY } from "../constants/artefact";

const CHROME_CROSSFADE_END = 0.5;

/**
 * Shared create-authoring controller: Type-state, pager focus, and capped append.
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
  const [typeState, setTypeState] = useState(false);

  const expandProgress = useSharedValue(0);
  const pagerRef = useRef<CreateArtefactPagerHandle>(null);
  const keepExpandedOnBlurRef = useRef(false);
  const suppressArtefactFocusRef = useRef(false);
  const inputRefs = useRef<(TextInput | null)[]>([]);
  /** Mirrors artefact list length for sync cap checks before setState flushes. */
  const artefactCountRef = useRef(1);
  const activeIndexRef = useRef(0);
  const keepClearTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

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
        runOnJS(setTypeState)(v > CHROME_CROSSFADE_END);
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
    }, 400);
  }, []);

  const handlePrev = useCallback(() => {
    const current = activeIndexRef.current;
    if (current <= 0) {
      return;
    }
    focusArtefact(current - 1);
  }, [focusArtefact]);

  const handleNext = useCallback(
    (artefactCount: number) => {
      const current = activeIndexRef.current;
      if (current >= artefactCount - 1) {
        return;
      }
      focusArtefact(current + 1);
    },
    [focusArtefact],
  );

  const handleBack = useCallback(() => {
    if (keepClearTimerRef.current) {
      clearTimeout(keepClearTimerRef.current);
      keepClearTimerRef.current = null;
    }
    keepExpandedOnBlurRef.current = false;
    inputRefs.current[activeIndexRef.current]?.blur();
  }, []);

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

  return {
    activeIndex,
    enteringIndex,
    setEnteringIndex,
    typeState,
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
    tryAppend,
    syncArtefactCount,
  };
}
