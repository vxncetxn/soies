import { Pressable, Text, View } from "react-native";
import { StyleSheet } from "react-native-unistyles";

type AppErrorFallbackProps = {
  error: Error;
  onRetry: () => void;
  onDismiss?: () => void;
  overlay?: boolean;
  title?: string;
};

/**
 * Dependency-light route fallback so a rendering failure never strands the
 * user on a blank screen. Keep this component independent of app providers:
 * the root route may need to render it when one of those providers failed. The
 * Unistyles registry is configured by the custom entry point before Expo
 * Router loads this module, so the fallback can still use the shared tokens.
 */
export default function AppErrorFallback({
  error,
  onRetry,
  onDismiss,
  overlay = false,
  title = "Something went wrong.",
}: AppErrorFallbackProps) {
  return (
    <View accessibilityRole="alert" style={[styles.container, overlay && styles.overlay]}>
      <Text style={styles.title}>{title}</Text>
      <Text style={styles.message}>Your journal is still on this device. Please try again.</Text>
      {__DEV__ ? <Text style={styles.details}>{error.message}</Text> : null}
      <Pressable
        accessibilityLabel="Retry loading Soies"
        accessibilityRole="button"
        onPress={onRetry}
        style={({ pressed }) => [styles.button, pressed && styles.buttonPressed]}
      >
        <Text style={styles.buttonLabel}>Try again</Text>
      </Pressable>
      {onDismiss ? (
        <Pressable
          accessibilityLabel="Dismiss failed feature"
          accessibilityRole="button"
          onPress={onDismiss}
          style={({ pressed }) => [styles.dismissButton, pressed && styles.buttonPressed]}
        >
          <Text style={styles.dismissButtonLabel}>Close</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create((theme) => ({
  container: {
    alignItems: "center",
    backgroundColor: theme.colors.canvas.app,
    flex: 1,
    gap: 16,
    justifyContent: "center",
    paddingHorizontal: 24,
  },
  overlay: {
    ...StyleSheet.absoluteFill,
    zIndex: 1000,
  },
  title: {
    ...theme.typography.feedback.title,
    color: theme.colors.content.primary,
    textAlign: "center",
  },
  message: {
    ...theme.typography.feedback.body,
    color: theme.colors.content.secondary,
    textAlign: "center",
  },
  details: {
    ...theme.typography.feedback.detail,
    color: theme.colors.content.muted,
    textAlign: "center",
  },
  button: {
    backgroundColor: theme.colors.action.primary,
    borderRadius: 999,
    paddingHorizontal: 20,
    paddingVertical: 11,
  },
  buttonPressed: {
    opacity: 0.75,
  },
  buttonLabel: {
    ...theme.typography.feedback.action,
    color: theme.colors.content.onAction,
  },
  dismissButton: {
    paddingHorizontal: 20,
    paddingVertical: 8,
  },
  dismissButtonLabel: {
    ...theme.typography.feedback.action,
    color: theme.colors.content.primary,
  },
}));
