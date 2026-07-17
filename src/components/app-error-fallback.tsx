import { Pressable, StyleSheet, Text, View } from "react-native";

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
 * the root route may need to render it when one of those providers failed.
 * StyleSheet and literal accessible colors are intentional here: this
 * emergency surface must still render when theme or Uniwind setup is the part
 * of the tree that failed.
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

const styles = StyleSheet.create({
  container: {
    alignItems: "center",
    backgroundColor: "#F7F4EF",
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
    color: "#342F2B",
    fontSize: 20,
    fontWeight: "600",
    textAlign: "center",
  },
  message: {
    color: "#5E5751",
    fontSize: 16,
    lineHeight: 22,
    textAlign: "center",
  },
  details: {
    color: "#79716B",
    fontSize: 12,
    textAlign: "center",
  },
  button: {
    backgroundColor: "#342F2B",
    borderRadius: 999,
    paddingHorizontal: 20,
    paddingVertical: 11,
  },
  buttonPressed: {
    opacity: 0.75,
  },
  buttonLabel: {
    color: "#FFFFFF",
    fontSize: 15,
    fontWeight: "600",
  },
  dismissButton: {
    paddingHorizontal: 20,
    paddingVertical: 8,
  },
  dismissButtonLabel: {
    color: "#342F2B",
    fontSize: 15,
    fontWeight: "600",
  },
});
