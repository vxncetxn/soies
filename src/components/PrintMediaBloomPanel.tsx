/**
 * Shared Print media-source bloom panel nodes (Take picture / Camera roll +
 * permission / error alerts). Used by CreateEntryButton and Create Print's
 * document-plus bloom so both stay one implementation.
 */
import { Linking, Pressable, Text, View } from "react-native";

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
      <View className="py-2">
        <Text className="text-primary px-4 py-3 text-base">{permissionMessage}</Text>
        <Pressable
          onPress={() => {
            onDismiss();
            void Linking.openSettings();
          }}
          accessibilityRole="button"
          accessibilityLabel="Open Settings"
          className="px-4 py-3"
        >
          <Text className="text-primary text-base">Open Settings</Text>
        </Pressable>
        <Pressable
          onPress={onDismiss}
          accessibilityRole="button"
          accessibilityLabel="Dismiss"
          className="px-4 py-3"
        >
          <Text className="text-secondary text-base">OK</Text>
        </Pressable>
      </View>
    );
  }

  if (screen === "error") {
    return (
      <View className="py-2">
        <Text className="text-primary px-4 py-3 text-base">{errorMessage}</Text>
        <Pressable
          onPress={onBackToMedia}
          accessibilityRole="button"
          accessibilityLabel="Try again"
          className="px-4 py-3"
        >
          <Text className="text-primary text-base">Try again</Text>
        </Pressable>
        <Pressable
          onPress={onDismiss}
          accessibilityRole="button"
          accessibilityLabel="Dismiss"
          className="px-4 py-3"
        >
          <Text className="text-secondary text-base">OK</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View className="py-2">
      {onBackToParent ? (
        <Pressable
          onPress={onBackToParent}
          accessibilityRole="button"
          accessibilityLabel="Back to main menu"
          className="px-4 py-3"
        >
          <Text className="text-primary text-base">‹ Back</Text>
        </Pressable>
      ) : null}
      <Pressable
        onPress={() => onPick("camera")}
        disabled={picking}
        accessibilityRole="button"
        accessibilityLabel="Take picture"
        className="px-4 py-3"
      >
        <Text className="text-primary text-base">Take picture</Text>
      </Pressable>
      <Pressable
        onPress={() => onPick("library")}
        disabled={picking}
        accessibilityRole="button"
        accessibilityLabel="Camera roll"
        className="px-4 py-3"
      >
        <Text className="text-primary text-base">Camera roll</Text>
      </Pressable>
    </View>
  );
}
