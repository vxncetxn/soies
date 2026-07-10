import { useEffect, useRef, useState } from "react";
import { Alert } from "react-native";

/**
 * Create-entry submit with lock, error/Retry, and stale-callback guards.
 *
 * - Ignores overlapping submits while `saving`.
 * - On success, only runs `onSuccess` if this screen is still mounted and this
 *   submit is the latest generation (avoids closing a newly opened session).
 * - On failure, keeps the draft, clears the busy flag, and offers Retry.
 *
 * Uses promise chains instead of try/finally — React Compiler cannot lower
 * `try` with a `finally` clause yet.
 */
export function useCreateEntrySave(options: {
  save: () => Promise<void>;
  onSuccess: () => void;
  setSessionBusy?: (busy: boolean) => void;
}) {
  const { save, onSuccess, setSessionBusy } = options;
  const [saving, setSaving] = useState(false);
  const generationRef = useRef(0);
  const aliveRef = useRef(true);
  const saveRef = useRef(save);
  const onSuccessRef = useRef(onSuccess);
  const setSessionBusyRef = useRef(setSessionBusy);

  useEffect(() => {
    aliveRef.current = true;
    return () => {
      aliveRef.current = false;
    };
  }, []);

  useEffect(() => {
    saveRef.current = save;
    onSuccessRef.current = onSuccess;
    setSessionBusyRef.current = setSessionBusy;
  }, [save, onSuccess, setSessionBusy]);

  const clearBusyIfCurrent = (generation: number) => {
    if (generation === generationRef.current) {
      setSaving(false);
      setSessionBusyRef.current?.(false);
    }
  };

  const submit = () => {
    if (saving) {
      return;
    }

    const generation = generationRef.current + 1;
    generationRef.current = generation;
    setSaving(true);
    setSessionBusyRef.current?.(true);

    void saveRef
      .current()
      .then(() => {
        if (!aliveRef.current || generation !== generationRef.current) {
          return;
        }
        onSuccessRef.current();
      })
      .catch((error: unknown) => {
        if (!aliveRef.current || generation !== generationRef.current) {
          return;
        }
        const message = error instanceof Error ? error.message : "Couldn’t save this entry.";
        Alert.alert("Couldn’t save", message, [
          { text: "Keep editing", style: "cancel" },
          {
            text: "Retry",
            onPress: () => {
              submit();
            },
          },
        ]);
      })
      .then(() => {
        // Settlement cleanup (success or failure) — replaces `finally`.
        clearBusyIfCurrent(generation);
      });
  };

  return { saving, submit };
}
