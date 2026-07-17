import { useCallback, useEffect, useRef, useState } from "react";
import { AppState, Platform } from "react-native";

import type { PrintMediaBloomScreen } from "../components/PrintMediaBloomPanel";

import {
  pickPrintImage,
  recoverPendingPrintImage,
  type PickPrintImageResult,
  type PickPrintImageSource,
} from "../media/pickPrintImage";

type UsePrintImagePickFlowOptions = {
  onSuccess: (uri: string) => void;
  /** Close bloom / system-UI prep before the picker opens. */
  onBeforePick?: () => void;
  /** Re-open bloom after permission/error so the alert panel is visible. */
  onNeedsAttention?: () => void;
  /** Consume an Android result restored after the picker Activity was destroyed. */
  recoverPending?: boolean;
};

/**
 * Shared Print image-pick orchestration for Create Entry and Create Print add.
 * Uses a synchronous ref mutex so same-tick double taps cannot start two picks.
 */
export function usePrintImagePickFlow(options: UsePrintImagePickFlowOptions) {
  const { onSuccess, onBeforePick, onNeedsAttention, recoverPending = false } = options;
  const [picking, setPicking] = useState(false);
  const pickingRef = useRef(false);
  const [mediaScreen, setMediaScreen] = useState<PrintMediaBloomScreen>("media");
  const [permissionSource, setPermissionSource] = useState<PickPrintImageSource>("camera");
  const [errorMessage, setErrorMessage] = useState("Couldn’t get that image.");

  const onSuccessRef = useRef(onSuccess);
  const onBeforePickRef = useRef(onBeforePick);
  const onNeedsAttentionRef = useRef(onNeedsAttention);
  const mountedRef = useRef(false);
  const recoveryInFlightRef = useRef(false);
  const deliveredUriRef = useRef<string | null>(null);

  useEffect(() => {
    onSuccessRef.current = onSuccess;
    onBeforePickRef.current = onBeforePick;
    onNeedsAttentionRef.current = onNeedsAttention;
  }, [onSuccess, onBeforePick, onNeedsAttention]);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  // Stable identity is a correctness contract for the AppState subscription
  // below: ordinary renders must not tear down and recreate the native resume
  // listener while it may be reconciling a pending picker result.
  const applyResult = useCallback((result: PickPrintImageResult) => {
    if (!mountedRef.current) {
      return;
    }

    if (result.status === "success") {
      // A pending native result and the original launch promise can settle on
      // the same resume. Deliver that URI once; a new picker launch resets it.
      if (deliveredUriRef.current === result.uri) {
        return;
      }
      deliveredUriRef.current = result.uri;
      setMediaScreen("media");
      onSuccessRef.current(result.uri);
      return;
    }

    if (result.status === "cancelled") {
      setMediaScreen("media");
      return;
    }

    if (result.status === "permission_denied") {
      setPermissionSource(result.source);
      setMediaScreen("permission");
      onNeedsAttentionRef.current?.();
      return;
    }

    setErrorMessage(result.message || "Couldn’t get that image.");
    setMediaScreen("error");
    onNeedsAttentionRef.current?.();
  }, []);

  useEffect(() => {
    if (!recoverPending || Platform.OS !== "android") {
      return;
    }

    let cancelled = false;
    const recover = () => {
      if (recoveryInFlightRef.current) {
        return;
      }
      recoveryInFlightRef.current = true;
      void recoverPendingPrintImage()
        .then((result) => {
          if (!cancelled && result) {
            applyResult(result);
          }
        })
        .finally(() => {
          recoveryInFlightRef.current = false;
        });
    };

    recover();
    const subscription = AppState.addEventListener("change", (state) => {
      if (state === "active") {
        recover();
      }
    });
    return () => {
      cancelled = true;
      subscription.remove();
    };
  }, [applyResult, recoverPending]);

  const handlePick = useCallback(
    async (source: PickPrintImageSource) => {
      if (pickingRef.current) {
        return;
      }
      pickingRef.current = true;
      deliveredUriRef.current = null;
      onBeforePickRef.current?.();
      setPicking(true);

      const result = await pickPrintImage(source)
        .catch(() => ({
          status: "error" as const,
          message: "Couldn’t get that image.",
        }))
        .finally(() => {
          pickingRef.current = false;
          setPicking(false);
        });

      applyResult(result);
    },
    [applyResult],
  );

  const resetToMedia = useCallback(() => {
    setMediaScreen("media");
  }, []);

  return {
    picking,
    mediaScreen,
    setMediaScreen,
    permissionSource,
    errorMessage,
    handlePick,
    resetToMedia,
  };
}
