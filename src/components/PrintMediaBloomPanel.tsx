/**
 * Shared Print media-source bloom panel nodes (Take picture / Camera roll +
 * permission / error alerts). Used by CreateEntryButton and Create Print's
 * document-plus bloom so both stay one implementation.
 */
import { Linking, Pressable, Text, View } from "react-native";
import { StyleSheet } from "react-native-unistyles";

import type { PickPrintImageSource } from "../media/pickPrintImage";

export type PrintMediaBloomScreen = "media" | "permission" | "error";

type PrintMediaPanelProps = {
  screen: PrintMediaBloomScreen;
  picking: boolean;
  permissionSource: PickPrintImageSource;
  errorMessage: string;
  onPick: (source: PickPrintImageSource) => void;
  onBackToMedia: () => void;
  onDismiss: () => void;
  /** Optional back row (Create Entry print submenu). Omit on create-chrome add. */
  onBackToParent?: () => void;
};

export function PrintMediaBloomPanel({
  screen,
  picking,
  permissionSource,
  errorMessage,
  onPick,
  onBackToMedia,
  onDismiss,
  onBackToParent,
}: PrintMediaPanelProps) {
  if (screen === "permission") {
    const permissionMessage =
      permissionSource === "camera"
        ? "Camera access is needed to take a picture."
        : "Photo access is needed to choose from Camera roll.";

    return (
      <View style={styles.panel}>
        <Text style={[styles.row, styles.primaryText]}>{permissionMessage}</Text>
        <Pressable
          onPress={() => {
            onDismiss();
            void Linking.openSettings();
          }}
          accessibilityRole="button"
          accessibilityLabel="Open Settings"
          style={styles.row}
        >
          <Text style={styles.primaryText}>Open Settings</Text>
        </Pressable>
        <Pressable
          onPress={onDismiss}
          accessibilityRole="button"
          accessibilityLabel="Dismiss"
          style={styles.row}
        >
          <Text style={styles.secondaryText}>OK</Text>
        </Pressable>
      </View>
    );
  }

  if (screen === "error") {
    return (
      <View style={styles.panel}>
        <Text style={[styles.row, styles.primaryText]}>{errorMessage}</Text>
        <Pressable
          onPress={onBackToMedia}
          accessibilityRole="button"
          accessibilityLabel="Try again"
          style={styles.row}
        >
          <Text style={styles.primaryText}>Try again</Text>
        </Pressable>
        <Pressable
          onPress={onDismiss}
          accessibilityRole="button"
          accessibilityLabel="Dismiss"
          style={styles.row}
        >
          <Text style={styles.secondaryText}>OK</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View style={styles.panel}>
      {onBackToParent ? (
        <Pressable
          onPress={onBackToParent}
          accessibilityRole="button"
          accessibilityLabel="Back to main menu"
          style={styles.row}
        >
          <Text style={styles.primaryText}>‹ Back</Text>
        </Pressable>
      ) : null}
      <Pressable
        onPress={() => onPick("camera")}
        disabled={picking}
        accessibilityRole="button"
        accessibilityLabel="Take picture"
        style={styles.row}
      >
        <Text style={styles.primaryText}>Take picture</Text>
      </Pressable>
      <Pressable
        onPress={() => onPick("library")}
        disabled={picking}
        accessibilityRole="button"
        accessibilityLabel="Camera roll"
        style={styles.row}
      >
        <Text style={styles.primaryText}>Camera roll</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create((theme) => ({
  panel: {
    paddingVertical: 8,
  },
  primaryText: {
    ...theme.typography.ui.body,
    color: theme.colors.content.primary,
  },
  row: {
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  secondaryText: {
    ...theme.typography.ui.body,
    color: theme.colors.content.secondary,
  },
}));
