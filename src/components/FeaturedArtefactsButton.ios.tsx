/**
 * FeaturedArtefactsButton — bottom-left launcher for the five widget slots.
 *
 * Its 40-point round surface mirrors CreateEntryButton across the centred Home
 * tab. It shares Home's chrome fade, so expanding an entry or opening Create
 * removes all three bottom controls from the interaction layer together.
 */
import { Pressable, View } from "react-native";
import Animated from "react-native-reanimated";

import { useHomeChromeFade } from "../hooks/useHomeChromeFade";
import { useFeaturedWidgets } from "../widgets/FeaturedWidgetsContext";
import { Icon } from "./Icon";

const FeaturedArtefactsButton = () => {
  const { openFeatured } = useFeaturedWidgets();
  const chromeFadeStyle = useHomeChromeFade();

  return (
    <Animated.View
      style={chromeFadeStyle}
      pointerEvents="box-none"
      className="absolute bottom-5 left-5 z-50"
    >
      <Pressable
        onPress={() => openFeatured()}
        accessibilityRole="button"
        accessibilityLabel="Open Featured Artefacts"
      >
        <View className="items-center justify-center rounded-full border border-controls-border bg-controls-background p-2">
          <Icon name="photo" size={24} color="#79716B" />
        </View>
      </Pressable>
    </Animated.View>
  );
};

export default FeaturedArtefactsButton;
