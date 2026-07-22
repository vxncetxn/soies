import { PropsWithChildren, useEffect, useState } from "react";
import { ActivityIndicator, Pressable, Text, View } from "react-native";
import { StyleSheet, withUnistyles } from "react-native-unistyles";

import { initDatabase } from "./init";

const ThemedActivityIndicator = withUnistyles(ActivityIndicator, (theme) => ({
  color: theme.colors.icon.default,
}));

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
      <View style={styles.stateContainer}>
        <Text style={styles.stateText}>Couldn&apos;t load your journal.</Text>
        <Pressable
          onPress={retry}
          accessibilityRole="button"
          accessibilityLabel="Retry loading database"
          style={({ pressed }) => [styles.retryButton, pressed && styles.pressed]}
        >
          <Text style={styles.retryLabel}>Try again</Text>
        </Pressable>
      </View>
    );
  }

  if (!ready) {
    return (
      <View style={styles.loadingContainer}>
        <ThemedActivityIndicator />
      </View>
    );
  }

  return children;
}

const styles = StyleSheet.create((theme) => ({
  loadingContainer: {
    alignItems: "center",
    backgroundColor: theme.colors.canvas.app,
    flex: 1,
    justifyContent: "center",
  },
  pressed: {
    opacity: 0.75,
  },
  retryButton: {
    backgroundColor: theme.colors.surface.control,
    borderColor: theme.colors.border.control,
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: 20,
    paddingVertical: 8,
  },
  retryLabel: {
    ...theme.typography.feedback.action,
    color: theme.colors.content.primary,
  },
  stateContainer: {
    alignItems: "center",
    backgroundColor: theme.colors.canvas.app,
    flex: 1,
    gap: 16,
    justifyContent: "center",
    paddingHorizontal: 24,
  },
  stateText: {
    ...theme.typography.feedback.body,
    color: theme.colors.content.primary,
    textAlign: "center",
  },
}));
