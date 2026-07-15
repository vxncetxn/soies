import { PropsWithChildren, useEffect, useState } from "react";
import { ActivityIndicator, Pressable, Text, View } from "react-native";

import { initDatabase } from "./init";

/**
 * Gates the app behind database initialisation (open + migrate + seed).
 *
 * On a transient init failure (e.g. a migration error or a corrupt file) we
 * surface a retry UI instead of throwing during render — throwing here would
 * bypass any error boundary and crash straight to a red screen with no way to
 * recover. The retry button re-runs `initDatabase` from scratch; since
 * `getDatabase` clears its failed promise on error, the retry can actually
 * succeed rather than re-returning the same rejection.
 */
export function DatabaseProvider({ children }: PropsWithChildren) {
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  // Bumped by `retry` to retrigger the init effect.
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;

    // Do not call setError/setReady synchronously in the effect body — that
    // trips React Compiler EffectSetState. Clear/settle only in async callbacks
    // (or in `retry`, which already resets error/ready before bumping attempt).
    initDatabase()
      .then(() => {
        if (!cancelled) {
          setReady(true);
          setError(null);
        }
      })
      .catch((nextError: unknown) => {
        if (!cancelled) {
          setError(nextError instanceof Error ? nextError : new Error(String(nextError)));
        }
      });

    return () => {
      cancelled = true;
    };
  }, [attempt]);

  const retry = () => {
    setReady(false);
    setError(null);
    setAttempt((previous) => previous + 1);
  };

  if (error) {
    return (
      <View className="bg-background flex-1 items-center justify-center gap-4 px-6">
        <Text className="text-primary text-center">Couldn&apos;t load your journal.</Text>
        <Pressable
          onPress={retry}
          accessibilityRole="button"
          accessibilityLabel="Retry loading database"
          className="border-controls-border bg-controls-background rounded-full border px-5 py-2"
        >
          <Text className="text-primary">Try again</Text>
        </Pressable>
      </View>
    );
  }

  if (!ready) {
    return (
      <View className="bg-background flex-1 items-center justify-center">
        <ActivityIndicator />
      </View>
    );
  }

  return children;
}
