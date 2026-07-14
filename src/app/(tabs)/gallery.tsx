/**
 * Gallery tab — horizontal framed artefacts (no HomeHeader).
 */
import type { ErrorBoundaryProps } from "expo-router";

import { Pressable, Text, View } from "react-native";

import GalleryPager from "../../components/GalleryPager";

export default function GalleryScreen() {
  return <GalleryPager />;
}

/** Route-level fallback for unexpected render failures outside query recovery. */
export function ErrorBoundary({ retry }: ErrorBoundaryProps) {
  return (
    <View className="flex-1 items-center justify-center gap-4 bg-background px-8">
      <Text className="text-center text-primary">Gallery couldn&apos;t be displayed.</Text>
      <Pressable
        onPress={retry}
        accessibilityRole="button"
        accessibilityLabel="Retry displaying Gallery"
        className="rounded-full border border-controls-border bg-controls-background px-5 py-2"
      >
        <Text className="text-primary">Try again</Text>
      </Pressable>
    </View>
  );
}
