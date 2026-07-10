import { useCallback, useEffect, useRef, useState } from "react";

import type { PrintMediaBloomScreen } from "../components/PrintMediaBloomPanel";

import { pickPrintImage, type PickPrintImageSource } from "../media/pickPrintImage";

type UsePrintImagePickFlowOptions = {
  onSuccess: (uri: string) => void;
  /** Close bloom / system-UI prep before the picker opens. */
  onBeforePick?: () => void;
  /** Re-open bloom after permission/error so the alert panel is visible. */
  onNeedsAttention?: () => void;
};

/**
 * Shared Print image-pick orchestration for Create Entry and Create Print add.
 * Uses a synchronous ref mutex so same-tick double taps cannot start two picks.
 */
export function usePrintImagePickFlow(options: UsePrintImagePickFlowOptions) {
  const { onSuccess, onBeforePick, onNeedsAttention } = options;
  const [picking, setPicking] = useState(false);
  const pickingRef = useRef(false);
  const [mediaScreen, setMediaScreen] = useState<PrintMediaBloomScreen>("media");
  const [permissionSource, setPermissionSource] = useState<PickPrintImageSource>("camera");
  const [errorMessage, setErrorMessage] = useState("Couldn’t get that image.");

  const onSuccessRef = useRef(onSuccess);
  const onBeforePickRef = useRef(onBeforePick);
  const onNeedsAttentionRef = useRef(onNeedsAttention);

  useEffect(() => {
    onSuccessRef.current = onSuccess;
    onBeforePickRef.current = onBeforePick;
    onNeedsAttentionRef.current = onNeedsAttention;
  }, [onSuccess, onBeforePick, onNeedsAttention]);

  const handlePick = useCallback(async (source: PickPrintImageSource) => {
    if (pickingRef.current) {
      return;
    }
    pickingRef.current = true;
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

    if (result.status === "success") {
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
