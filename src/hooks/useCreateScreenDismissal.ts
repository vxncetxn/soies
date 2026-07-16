/**
 * useCreateScreenDismissal — shared native-responder-to-overlay close handoff.
 *
 * Paper and Print both host Expo native text views. Closing first freezes the
 * shared authoring controller and resigns every responder while the root Create
 * tree is still mounted; the visual overlay close begins on the next frame.
 * This two-phase order prevents late UIKit focus/blur events from racing a
 * Fabric child-unmount transaction. Rapid Cancel/save callbacks are idempotent.
 */
import { useCallback, useEffect, useRef, useState } from "react";

type CreateScreenDismissal = {
  /** True from the first close request until the owning Create tree unmounts. */
  closing: boolean;
  /** Idempotent JS-thread entry point shared by Cancel and successful Save. */
  handleClose: () => void;
};

/**
 * Coordinates a JS-owned overlay close with UIKit/Fabric responder teardown.
 * Callers provide their shared synchronous blur/freeze operation; this hook
 * crosses one committed animation frame before invoking the root close so late
 * native focus events cannot race child removal.
 */
export function useCreateScreenDismissal(
  onClose: () => void,
  prepareForDismiss: () => void,
): CreateScreenDismissal {
  /** Makes Cancel/save dismissal idempotent across rapid or stale callbacks. */
  const closeRequestedRef = useRef(false);
  /** Cancels the handoff frame if an ancestor removes this screen first. */
  const closeFrameRef = useRef<ReturnType<typeof requestAnimationFrame> | null>(null);
  /** Locks authoring controls while native responders settle. */
  const [closing, setClosing] = useState(false);

  useEffect(
    () => () => {
      if (closeFrameRef.current !== null) {
        cancelAnimationFrame(closeFrameRef.current);
        closeFrameRef.current = null;
      }
    },
    [],
  );

  /**
   * Runs on the JS thread: freeze/blur now, then cross one committed frame before
   * the root Create owner begins its close spring and eventual native teardown.
   */
  const handleClose = useCallback(() => {
    if (closeRequestedRef.current) {
      return;
    }
    closeRequestedRef.current = true;
    setClosing(true);
    prepareForDismiss();
    closeFrameRef.current = requestAnimationFrame(() => {
      closeFrameRef.current = null;
      onClose();
    });
  }, [onClose, prepareForDismiss]);

  return { closing, handleClose };
}
