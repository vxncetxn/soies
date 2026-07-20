import { useCallback, useEffect, useReducer, useRef, useState, type RefObject } from "react";

import type { ArtefactTextInputHandle } from "../components/ArtefactTextInput";
import type { CreateArtefactPagerHandle } from "../components/CreateArtefactPager";

import { MAX_ARTEFACTS_PER_ENTRY } from "../constants/artefact";
import {
  createAuthoringDisplayMode,
  createAuthoringExpandedTarget,
  createAuthoringReducer,
  createAuthoringState,
  type CreateExpandMode,
} from "./createAuthoringTransition";

const RESPONDER_TRANSFER_GUARD_MS = 400;

/**
 * Shared Create authoring coordinator for Type/Scribble phases, pager focus,
 * responder transfer, and capped append behavior.
 */
export function useCreateArtefactAuthoring(options?: {
  onActiveIndexChange?: (index: number) => void;
}) {
  const onActiveIndexChange = options?.onActiveIndexChange;
  const [activeIndex, setActiveIndex] = useState(0);
  const [enteringIndex, setEnteringIndex] = useState<number | null>(null);
  const [authoringState, dispatchAuthoring] = useReducer(
    createAuthoringReducer,
    undefined,
    createAuthoringState,
  );

  const pagerRef = useRef<CreateArtefactPagerHandle>(null);
  const keepExpandedOnBlurRef = useRef(false);
  const suppressArtefactFocusRef = useRef(false);
  const scribbleActiveRef = useRef(false);
  const dismissingRef = useRef(false);
  const inputRefs = useRef<(ArtefactTextInputHandle | null)[]>([]);
  const artefactCountRef = useRef(1);
  const activeIndexRef = useRef(0);
  const keepClearTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const nextAuthoringRequestIdRef = useRef(0);

  useEffect(() => {
    dismissingRef.current = false;
    return () => {
      dismissingRef.current = true;
      if (keepClearTimerRef.current) {
        clearTimeout(keepClearTimerRef.current);
        keepClearTimerRef.current = null;
      }
    };
  }, []);

  const requestMode = useCallback((mode: CreateExpandMode) => {
    if (dismissingRef.current) {
      return;
    }
    nextAuthoringRequestIdRef.current += 1;
    dispatchAuthoring({
      type: "requestMode",
      mode,
      requestId: nextAuthoringRequestIdRef.current,
    });
  }, []);

  const requestType = useCallback(() => {
    if (!scribbleActiveRef.current) {
      requestMode("type");
    }
  }, [requestMode]);

  const requestDefault = useCallback(() => {
    if (!keepExpandedOnBlurRef.current && !scribbleActiveRef.current) {
      requestMode("default");
    }
  }, [requestMode]);

  const handleAuthoringMotionEnd = useCallback((requestId: number) => {
    dispatchAuthoring({ type: "motionFinished", requestId });
  }, []);

  const handleActiveIndexChange = useCallback(
    (index: number) => {
      activeIndexRef.current = index;
      setActiveIndex(index);
      onActiveIndexChange?.(index);
    },
    [onActiveIndexChange],
  );

  const focusArtefact = useCallback((index: number) => {
    keepExpandedOnBlurRef.current = true;
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
    if (current > 0) {
      focusArtefact(current - 1);
    }
  }, [focusArtefact]);

  const handleNext = useCallback(
    (artefactCount: number) => {
      if (scribbleActiveRef.current) {
        return;
      }
      const current = activeIndexRef.current;
      if (current < artefactCount - 1) {
        focusArtefact(current + 1);
      }
    },
    [focusArtefact],
  );

  const enterScribble = useCallback(() => {
    scribbleActiveRef.current = true;
    keepExpandedOnBlurRef.current = true;
    if (keepClearTimerRef.current) {
      clearTimeout(keepClearTimerRef.current);
    }
    inputRefs.current[activeIndexRef.current]?.blur();
    requestMode("scribble");
    keepClearTimerRef.current = setTimeout(() => {
      keepExpandedOnBlurRef.current = false;
      keepClearTimerRef.current = null;
    }, RESPONDER_TRANSFER_GUARD_MS);
  }, [requestMode]);

  const exitScribble = useCallback(() => {
    scribbleActiveRef.current = false;
    requestMode("default");
  }, [requestMode]);

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
    requestMode("default");
  }, [exitScribble, requestMode]);

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
    dispatchAuthoring({ type: "dismiss" });
  }, []);

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

  const expandMode = createAuthoringDisplayMode(authoringState);
  const authoringExpanded = createAuthoringExpandedTarget(authoringState);
  const scribbleActive = expandMode === "scribble";
  const typeState = expandMode === "type";

  return {
    activeIndex,
    enteringIndex,
    setEnteringIndex,
    authoringState,
    authoringExpanded,
    authoringMotionRequestId:
      authoringState.phase === "transitioning" ? authoringState.requestId : null,
    typeState,
    scribbleActive,
    pagerRef: pagerRef as RefObject<CreateArtefactPagerHandle | null>,
    keepExpandedOnBlurRef,
    suppressArtefactFocusRef,
    inputRefs,
    requestType,
    requestDefault,
    handleAuthoringMotionEnd,
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
